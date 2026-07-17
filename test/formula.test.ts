// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { DOMParser, DOMSerializer, Schema } from "prosemirror-model"
import type { Node } from "prosemirror-model"
import { EditorState, NodeSelection } from "prosemirror-state"
import { schema as base } from "prosemirror-schema-basic"
import { history, undo } from "prosemirror-history"
import {
  spreads,
  spreadsNodes,
  parseFormula,
  FormulaParseError,
  gridMap,
  nameTable,
  nameCells,
  evaluateTable,
  displayText,
  settleCell,
  isCellType,
} from "prosemirror-spreads"

const schema = new Schema({
  nodes: base.spec.nodes.append(spreadsNodes()),
  marks: base.spec.marks,
})

function parseHTML(html: string): Node {
  const container = document.createElement("div")
  container.innerHTML = html
  return DOMParser.fromSchema(schema).parse(container)
}

function serialize(doc: Node): string {
  const container = document.createElement("div")
  container.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(doc.content))
  return container.innerHTML
}

// The manual's own table: named columns, a row-named tbody, a tfoot total.
const FIXTURE =
  "<table><thead><tr>" +
  '<th scope="col">Trimestre</th><th scope="col" abbr="Prezzo">Prezzo unitario</th><th scope="col">Qty</th>' +
  "</tr></thead><tbody>" +
  '<tr><th scope="row">Q1</th><td>10</td><td>2</td></tr>' +
  '<tr><th scope="row">Q2</th><td>30</td><td>4</td></tr>' +
  "</tbody><tfoot>" +
  '<tr><th scope="row">Totale</th><td data-formula="=SUM(Prezzo)"></td><td></td></tr>' +
  "</tfoot></table>"

function fixtureTable(): Node {
  const doc = parseHTML(FIXTURE)
  return doc.firstChild!
}

describe("gridMap", () => {
  it("maps regions and geometry", () => {
    const map = gridMap(fixtureTable())
    expect(map.width).toBe(3)
    expect(map.height).toBe(4)
    expect(map.rowsMeta.map((m) => m.region)).toEqual(["head", "body", "body", "foot"])
    expect(map.headerAt(0, 1)).toBe(true)
    expect(map.headerAt(1, 0)).toBe(true)
    expect(map.headerAt(1, 1)).toBe(false)
  })

  it("reports ragged rows as problems", () => {
    const table = parseHTML("<table><tbody><tr><td>1</td><td>2</td></tr><tr><td>3</td></tr></tbody></table>").firstChild!
    const map = gridMap(table)
    expect(map.problems).toEqual([{ type: "ragged", row: 1, expected: 2, found: 1 }])
  })

  it("is memoized by node identity", () => {
    const table = fixtureTable()
    expect(gridMap(table)).toBe(gridMap(table))
  })
})

describe("nameTable — the region-filtered resolver", () => {
  it("abbr wins over content; content otherwise", () => {
    const names = nameTable(fixtureTable())
    expect(names.byName.has("Prezzo")).toBe(true)
    expect(names.byName.has("Prezzo unitario")).toBe(false)
    expect(names.byName.has("Qty")).toBe(true)
    expect(names.byName.has("Q1")).toBe(true)
  })

  it("a name denotes its tbody cells — the tfoot total is not in its own range", () => {
    const table = fixtureTable()
    const names = nameTable(table)
    const prezzo = names.byName.get("Prezzo")!
    const cells = nameCells(table, prezzo)
    expect(cells).toHaveLength(2)
    const texts = cells.map((off) => table.nodeAt(off)!.textContent)
    expect(texts).toEqual(["10", "30"])
  })

  it("a tfoot row header mints no name", () => {
    const names = nameTable(fixtureTable())
    expect(names.byName.has("Totale")).toBe(false)
  })

  it("row names exclude the minting header cell", () => {
    const table = fixtureTable()
    const q1 = nameTable(table).byName.get("Q1")!
    const texts = nameCells(table, q1).map((off) => table.nodeAt(off)!.textContent)
    expect(texts).toEqual(["10", "2"])
  })

  it("names that are not bare identifiers are not minted without abbr", () => {
    const table = parseHTML(
      '<table><thead><tr><th scope="col">Prezzo unitario</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>',
    ).firstChild!
    expect(nameTable(table).all).toHaveLength(0)
  })
})

describe("parseFormula", () => {
  it("parses precedence and unary minus", () => {
    expect(parseFormula("=1+2*3")).toEqual({
      type: "bin",
      op: "+",
      left: { type: "num", value: 1 },
      right: { type: "bin", op: "*", left: { type: "num", value: 2 }, right: { type: "num", value: 3 } },
    })
    expect(parseFormula("=-2")).toEqual({ type: "neg", expr: { type: "num", value: 2 } })
  })

  it("parses references, intersections, and calls", () => {
    expect(parseFormula("=SUM(Prezzo)")).toEqual({
      type: "call",
      fn: "SUM",
      args: [{ type: "ref", name: "Prezzo", sub: null }],
    })
    expect(parseFormula("=Prezzo[Q1]*2")).toEqual({
      type: "bin",
      op: "*",
      left: { type: "ref", name: "Prezzo", sub: "Q1" },
      right: { type: "num", value: 2 },
    })
  })

  it("refuses malformed input", () => {
    expect(() => parseFormula("=SUM(")).toThrow(FormulaParseError)
    expect(() => parseFormula("=1 2")).toThrow(FormulaParseError)
    expect(() => parseFormula("=A1:B2")).toThrow(FormulaParseError) // no coordinate tokens in the kernel
  })
})

describe("evaluateTable", () => {
  function computed(table: Node): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [off, value] of evaluateTable(table)) out[String(off)] = displayText(value)
    return out
  }

  it("computes the tfoot total over the tbody cells only", () => {
    const values = Object.values(computed(fixtureTable()))
    expect(values).toEqual(["40"])
  })

  it("evaluates intersections and arithmetic", () => {
    const table = parseHTML(
      FIXTURE.replace('<td data-formula="=SUM(Prezzo)"></td><td></td>', '<td data-formula="=SUM(Prezzo)"></td><td data-formula="=Prezzo[Q1]*Qty[Q2]"></td>'),
    ).firstChild!
    const values = Object.values(computed(table))
    expect(values).toEqual(["40", "40"])
  })

  it("chains through dependent formulas", () => {
    const table = parseHTML(
      '<table><thead><tr><th scope="col">A</th><th scope="col">B</th></tr></thead>' +
        '<tbody><tr><td>5</td><td data-formula="=SUM(A)*2"></td></tr></tbody>' +
        '<tfoot><tr><td></td><td data-formula="=SUM(B)+1"></td></tr></tfoot></table>',
    ).firstChild!
    const values = Object.values(computed(table))
    expect(values.sort()).toEqual(["10", "11"])
  })

  it("a formula inside its own column's data is an honest cycle", () => {
    const table = parseHTML(
      '<table><thead><tr><th scope="col">A</th></tr></thead>' +
        '<tbody><tr><td>1</td></tr><tr><td data-formula="=SUM(A)"></td></tr></tbody></table>',
    ).firstChild!
    expect(Object.values(computed(table))).toEqual(["#CYCLE!"])
  })

  it("errors are values: unknown name, division by zero, text in an aggregate", () => {
    const table = parseHTML(
      '<table><thead><tr><th scope="col">A</th></tr></thead>' +
        '<tbody><tr><td>abc</td></tr></tbody>' +
        "<tfoot><tr><td></td></tr></tfoot></table>"
        .replace("<tfoot><tr><td></td></tr></tfoot>", '<tfoot><tr><td data-formula="=SUM(Nope)"></td></tr></tfoot>'),
    ).firstChild!
    expect(Object.values(computed(table))).toEqual(["#NAME?"])
    const div0 = parseHTML(
      '<table><tbody><tr><td data-formula="=1/0"></td></tr></tbody></table>',
    ).firstChild!
    expect(Object.values(computed(div0))).toEqual(["#DIV/0!"])
    const trap = parseHTML(
      '<table><thead><tr><th scope="col">A</th></tr></thead>' +
        '<tbody><tr><td>abc</td></tr></tbody>' +
        '<tfoot><tr><td data-formula="=SUM(A)"></td></tr></tfoot></table>',
    ).firstChild!
    expect(Object.values(computed(trap))).toEqual(["#VALUE!"])
  })

  it("COUNT counts non-empty cells; AVG of nothing is an error", () => {
    const table = parseHTML(
      '<table><thead><tr><th scope="col">A</th></tr></thead>' +
        "<tbody><tr><td>1</td></tr><tr><td></td></tr><tr><td>x</td></tr></tbody>" +
        '<tfoot><tr><td data-formula="=COUNT(A)"></td></tr></tfoot></table>',
    ).firstChild!
    expect(Object.values(computed(table))).toEqual(["2"])
    const empty = parseHTML(
      '<table><thead><tr><th scope="col">A</th></tr></thead>' +
        "<tbody><tr><td></td></tr></tbody>" +
        '<tfoot><tr><td data-formula="=AVG(A)"></td></tr></tfoot></table>',
    ).firstChild!
    expect(Object.values(computed(empty))).toEqual(["#DIV/0!"])
  })
})

describe("enforcement — the cascade rides the settle", () => {
  function stateWithFixture() {
    const doc = parseHTML(FIXTURE)
    return EditorState.create({ schema, doc, plugins: [history(), ...spreads()] })
  }

  function cellOffsets(doc: Node): number[] {
    const found: number[] = []
    doc.descendants((node, pos) => {
      if (isCellType(node.type)) {
        found.push(pos)
        return false
      }
      return true
    })
    return found
  }

  function textOf(state: EditorState, pos: number): string {
    return state.doc.nodeAt(pos)!.textContent
  }

  it("settling a data cell recomputes the total in the same dispatch", () => {
    let state = stateWithFixture()
    const cells = cellOffsets(state.doc)
    // cells: [Trimestre, Prezzo, Qty, Q1, 10, 2, Q2, 30, 4, Totale, total-formula, empty]
    const priceQ1 = cells[4]!
    const totalCell = cells[10]!
    // The cold-parsed doc is stale (the total cell is empty) until a
    // dispatch runs enforcement — headless there is no view to fire the
    // stale-value pass, so the settle itself is the first trigger.
    expect(textOf(state, totalCell)).toBe("")
    const settle = settleCell(priceQ1, "50")
    let next = state
    settle(state, (tr) => (next = state.apply(tr)))
    const nextCells = cellOffsets(next.doc)
    expect(textOf(next, nextCells[4]!)).toBe("50")
    expect(textOf(next, nextCells[10]!)).toBe("80")
  })

  it("one settle, one undo: the cascade unwinds with its trigger", () => {
    let state = stateWithFixture()
    // Prime: settle once so the total is computed, then undo and check both revert.
    const cells = cellOffsets(state.doc)
    let next = state
    settleCell(cells[4]!, "50")(state, (tr) => (next = state.apply(tr)))
    const after = cellOffsets(next.doc)
    expect(textOf(next, after[10]!)).toBe("80")
    let undone = next
    undo(next, (tr) => (undone = next.apply(tr)))
    const back = cellOffsets(undone.doc)
    expect(textOf(undone, back[4]!)).toBe("10")
    // Enforcement rides the undo too: the total recomputes for the
    // restored data (40 = 10 + 30). The cold fixture's empty total was
    // staleness, and no observable state may show it — doctrine over cache.
    expect(textOf(undone, back[10]!)).toBe("40")
  })

  it("typing plain text over a formula cell demotes it", () => {
    let state = stateWithFixture()
    const cells = cellOffsets(state.doc)
    let withTotal = state
    settleCell(cells[4]!, "15")(state, (tr) => (withTotal = state.apply(tr))) // a real change, so enforcement fires
    const cur = cellOffsets(withTotal.doc)
    expect(textOf(withTotal, cur[10]!)).toBe("45")
    let demoted = withTotal
    settleCell(cur[10]!, "hello")(withTotal, (tr) => (demoted = withTotal.apply(tr)))
    const dem = cellOffsets(demoted.doc)
    const cell = demoted.doc.nodeAt(dem[10]!)!
    expect(cell.attrs.formula).toBeNull()
    expect(cell.textContent).toBe("hello")
  })

  it("settling a formula computes it in the same dispatch", () => {
    let state = stateWithFixture()
    const cells = cellOffsets(state.doc)
    let next = state
    settleCell(cells[5]!, "=Prezzo[Q1]+1")(state, (tr) => (next = state.apply(tr)))
    const after = cellOffsets(next.doc)
    const cell = next.doc.nodeAt(after[5]!)!
    expect(cell.attrs.formula).toBe("=Prezzo[Q1]+1")
    expect(cell.textContent).toBe("11")
  })

  it("round-trips formulas through serialization", () => {
    const doc = parseHTML(FIXTURE)
    expect(serialize(doc)).toContain('data-formula="=SUM(Prezzo)"')
  })
})
