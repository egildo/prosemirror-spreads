import { describe, it, expect } from "vitest"
import { Schema } from "prosemirror-model"
import type { Node } from "prosemirror-model"
import { EditorState, NodeSelection } from "prosemirror-state"
import type { Command } from "prosemirror-state"
import { schema as base } from "prosemirror-schema-basic"
import { history, undo } from "prosemirror-history"
import {
  spreads,
  spreadsNodes,
  spreadsNodeTypes,
  isCellType,
  settleCell,
  setRowRegion,
  toggleRowHeaderColumn,
  splitBody,
  joinBodies,
  writeSelectedAbbr,
  writeSelectedColumnWidth,
  ERRORS,
} from "prosemirror-spreads"

// The regions and partition family, pinned to its rulings: scope is a
// consequence, settle-and-demote, adjacency landings, demotion never a
// side effect, and the partition invisible to the resolver.

const schema = new Schema({
  nodes: base.spec.nodes.append(spreadsNodes()),
  marks: base.spec.marks,
})

const types = spreadsNodeTypes(schema)

function apply(state: EditorState, command: Command): EditorState {
  let next = state
  const ok = command(state, (tr) => (next = state.apply(tr)))
  expect(ok).toBe(true)
  return next
}

function cellPositions(doc: Node): number[] {
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

function select(state: EditorState, pos: number): EditorState {
  return state.apply(state.tr.setSelection(NodeSelection.create(state.doc, pos)))
}

const td = (text: string) => types.cell!.create(null, text ? schema.text(text) : null)
const th = (text: string, scope: string) => types.header!.create({ scope }, text ? schema.text(text) : null)
const row = (...cells: Node[]) => types.row!.create(null, cells)

function stateOf(table: Node) {
  const doc = schema.node("doc", null, [table])
  const state = EditorState.create({ schema, doc, plugins: [history(), ...spreads()] })
  return { state, cells: cellPositions(state.doc) }
}

function withTable() {
  const rows = [row(td("a1"), td("b1")), row(td("a2"), td("b2")), row(td("a3"), td("b3"))]
  return stateOf(types.table!.create(null, [types.body!.create(null, rows)]))
}

function withAnatomy() {
  return stateOf(
    types.table!.create(null, [
      types.head!.create(null, [row(th("A", "col"), th("B", "col"), th("C", "col"))]),
      types.body!.create(null, [row(td("a1"), td("b1"), td("c1")), row(td("a2"), td("b2"))]),
    ]),
  )
}

function withRowHeaders() {
  return stateOf(
    types.table!.create(null, [
      types.head!.create(null, [row(th("A", "col"), th("B", "col"))]),
      types.body!.create(null, [row(th("x", "row"), td("1")), row(th("y", "row"), td("2"))]),
    ]),
  )
}

describe("setRowRegion — the boundary-crossing verb", () => {
  it("promotes a body row to a head it creates, cells minted th scope=col", () => {
    const { state, cells } = withTable()
    const promoted = apply(select(state, cells[2]!), setRowRegion("head")) // td "a2"
    const table = promoted.doc.firstChild!
    expect(table.childCount).toBe(2)
    const head = table.child(0)
    expect(head.type.name).toBe("table_head")
    expect(head.childCount).toBe(1)
    head.child(0).forEach((cell) => {
      expect(cell.type.name).toBe("table_header")
      expect(cell.attrs.scope).toBe("col")
    })
    expect(head.child(0).child(0).textContent).toBe("a2")
    expect(table.child(1).childCount).toBe(2) // the body kept the other rows
    // Selection follows the moved row, same column.
    const sel = promoted.selection
    expect(sel).toBeInstanceOf(NodeSelection)
    expect(promoted.doc.nodeAt(sel.from)!.textContent).toBe("a2")
  })

  it("settle-and-demote: a formula cell promoted to the head keeps its computed text", () => {
    const { state, cells } = withTable()
    const declared = apply(state, settleCell(cells[2]!, "=1+2"))
    const promoted = apply(select(declared, cellPositions(declared.doc)[2]!), setRowRegion("head"))
    const headCell = promoted.doc.firstChild!.child(0).child(0).child(0)
    expect(headCell.type.name).toBe("table_header")
    expect(headCell.textContent).toBe("3")
    expect(headCell.attrs.formula).toBeUndefined()
  })

  it("adjacency: promotion appends at the head's end; demotion lands at the body's top", () => {
    const { state, cells } = withAnatomy()
    const promoted = apply(select(state, cells[3]!), setRowRegion("head")) // td "a1"
    const head = promoted.doc.firstChild!.child(0)
    expect(head.childCount).toBe(2)
    expect(head.child(1).child(0).textContent).toBe("a1") // appended, nearest the data
    const demoted = apply(promoted, setRowRegion("body")) // selection rode the row
    const body = demoted.doc.firstChild!.child(1)
    expect(body.child(0).child(0).textContent).toBe("a1") // back at the top
    expect(body.child(0).child(0).type.name).toBe("table_cell")
  })

  it("demoting the only head row removes the thead — the cascade rhyme", () => {
    const { state, cells } = withAnatomy()
    const demoted = apply(select(state, cells[0]!), setRowRegion("body")) // th "A"
    const table = demoted.doc.firstChild!
    expect(table.childCount).toBe(1)
    expect(table.firstChild!.type.name).toBe("table_body")
    expect(table.firstChild!.childCount).toBe(3)
    expect(table.firstChild!.child(0).child(0).type.name).toBe("table_cell")
  })

  it("a demoted head row copies the row-header shape of the row it lands against", () => {
    const { state, cells } = withRowHeaders()
    const demoted = apply(select(state, cells[0]!), setRowRegion("body")) // th "A"
    const landed = demoted.doc.firstChild!.child(0).child(0) // top of body (head is gone)
    expect(landed.child(0).type.name).toBe("table_header")
    expect(landed.child(0).attrs.scope).toBe("row")
    expect(landed.child(1).type.name).toBe("table_cell")
  })

  it("body → foot moves the row unchanged, formula intact", () => {
    const { state, cells } = withTable()
    const declared = apply(state, settleCell(cells[3]!, "=2*3")) // td "b2"
    const moved = apply(select(declared, cellPositions(declared.doc)[2]!), setRowRegion("foot"))
    const table = moved.doc.firstChild!
    const foot = table.child(table.childCount - 1)
    expect(foot.type.name).toBe("table_foot")
    expect(foot.child(0).child(1).attrs.formula).toBe("=2*3")
    const back = apply(moved, setRowRegion("body"))
    const body = back.doc.firstChild!.child(0)
    expect(body.childCount).toBe(3)
    expect(body.child(2).child(0).textContent).toBe("a2") // foot → bottom of the body
  })

  it("refuses: already in the region, and the only row of the only body", () => {
    const { state, cells } = withTable()
    const onCell = select(state, cells[0]!)
    expect(setRowRegion("body")(onCell, undefined)).toBe(false)
    const single = stateOf(types.table!.create(null, [types.body!.create(null, [row(td("x"), td("y"))])]))
    const singleSel = select(single.state, single.cells[0]!)
    expect(setRowRegion("head")(singleSel, undefined)).toBe(false)
    expect(setRowRegion("foot")(singleSel, undefined)).toBe(false)
  })
})

describe("toggleRowHeaderColumn", () => {
  it("promotes the selected column to row headers across body and foot, head untouched", () => {
    const { state, cells } = stateOf(
      types.table!.create(null, [
        types.head!.create(null, [row(th("A", "col"), th("B", "col"))]),
        types.body!.create(null, [row(td("x"), td("1")), row(td("y"), td("2"))]),
        types.foot!.create(null, [row(td("Totale"), td("3"))]),
      ]),
    )
    const toggled = apply(select(state, cells[2]!), toggleRowHeaderColumn) // td "x"
    const table = toggled.doc.firstChild!
    expect(table.child(0).child(0).child(0).attrs.scope).toBe("col") // head keeps col
    table.child(1).forEach((r) => {
      expect(r.child(0).type.name).toBe("table_header")
      expect(r.child(0).attrs.scope).toBe("row")
      expect(r.child(1).type.name).toBe("table_cell")
    })
    expect(table.child(2).child(0).child(0).type.name).toBe("table_header") // foot converts too
  })

  it("toggles back to data, and refuses while another column holds the seat", () => {
    const { state, cells } = withRowHeaders()
    // Column 1 can't take the seat while column 0 holds it.
    expect(toggleRowHeaderColumn(select(state, cells[3]!), undefined)).toBe(false)
    // Column 0 toggles off.
    const off = apply(select(state, cells[2]!), toggleRowHeaderColumn)
    off.doc.firstChild!.child(1).forEach((r) => expect(r.child(0).type.name).toBe("table_cell"))
    // And back on.
    const on = apply(off, toggleRowHeaderColumn)
    on.doc.firstChild!.child(1).forEach((r) => expect(r.child(0).attrs.scope).toBe("row"))
  })

  it("settle-and-demote rides the promotion", () => {
    const { state, cells } = withTable()
    const declared = apply(state, settleCell(cells[0]!, "=5+5"))
    const toggled = apply(select(declared, cellPositions(declared.doc)[0]!), toggleRowHeaderColumn)
    const cell = toggled.doc.firstChild!.child(0).child(0).child(0)
    expect(cell.type.name).toBe("table_header")
    expect(cell.textContent).toBe("10")
  })
})

describe("splitBody / joinBodies — the partition", () => {
  it("splits above the selected row and joins back, one undo step each", () => {
    const { state, cells } = withTable()
    const split = apply(select(state, cells[2]!), splitBody) // td "a2"
    const table = split.doc.firstChild!
    expect(table.childCount).toBe(2)
    expect(table.child(0).childCount).toBe(1)
    expect(table.child(1).childCount).toBe(2)
    const joined = apply(split, joinBodies) // selection rode into the second body
    expect(joined.doc.firstChild!.childCount).toBe(1)
    expect(joined.doc.eq(state.doc)).toBe(true)
    const undone = apply(apply(select(state, cells[2]!), splitBody), undo)
    expect(undone.doc.eq(state.doc)).toBe(true)
  })

  it("refuses at standing boundaries: first row, head rows, head-adjacent bodies", () => {
    const { state, cells } = withTable()
    expect(splitBody(select(state, cells[0]!), undefined)).toBe(false)
    expect(joinBodies(select(state, cells[0]!), undefined)).toBe(false) // first body
    const anatomy = withAnatomy()
    expect(splitBody(select(anatomy.state, anatomy.cells[0]!), undefined)).toBe(false) // head row
    expect(joinBodies(select(anatomy.state, anatomy.cells[3]!), undefined)).toBe(false) // head before body
  })

  it("the partition is invisible to the resolver — names keep spanning", () => {
    const { state, cells } = stateOf(
      types.table!.create(null, [
        types.head!.create(null, [row(th("Voce", "col"), th("Prezzo", "col"))]),
        types.body!.create(null, [row(td("Ravioli"), td("12")), row(td("Nebbiolo"), td("28"))]),
        types.foot!.create(null, [row(td("Totale"), td(""))]),
      ]),
    )
    const declared = apply(state, settleCell(cells[7]!, "=SUM(Prezzo)"))
    expect(declared.doc.nodeAt(cellPositions(declared.doc)[7]!)!.textContent).toBe("40")
    const split = apply(select(declared, cellPositions(declared.doc)[4]!), splitBody) // above "Nebbiolo"
    const after = cellPositions(split.doc)
    expect(split.doc.firstChild!.childCount).toBe(4) // head + two bodies + foot
    expect(split.doc.nodeAt(after[7]!)!.textContent).toBe("40") // arithmetic unchanged
  })
})

describe("writeSelectedAbbr — the naming register's twin", () => {
  it("sets and demotes the reference name, th-only", () => {
    const { state, cells } = withAnatomy()
    const onTh = select(state, cells[0]!)
    const named = apply(onTh, writeSelectedAbbr("Alpha"))
    expect(named.doc.nodeAt(cells[0]!)!.attrs.abbr).toBe("Alpha")
    const demoted = apply(named, writeSelectedAbbr(""))
    expect(demoted.doc.nodeAt(cells[0]!)!.attrs.abbr).toBeNull()
    expect(writeSelectedAbbr("x")(select(state, cells[3]!), undefined)).toBe(false) // td refuses
  })

  it("an abbr unlocks a name the visible text cannot mint", () => {
    const { state, cells } = stateOf(
      types.table!.create(null, [
        types.head!.create(null, [row(th("Voce", "col"), th("Prezzo Unitario", "col"))]),
        types.body!.create(null, [row(td("Ravioli"), td("12")), row(td("Nebbiolo"), td("28"))]),
        types.foot!.create(null, [row(td("Totale"), td(""))]),
      ]),
    )
    // "Prezzo Unitario" has a space: no name exists, the reference dangles.
    const declared = apply(state, settleCell(cells[7]!, "=SUM(Prezzo)"))
    expect(declared.doc.nodeAt(cellPositions(declared.doc)[7]!)!.textContent).toBe(ERRORS.name.token)
    // Declaring the abbr mints the name; the recompute rides the dispatch.
    const named = apply(select(declared, cellPositions(declared.doc)[1]!), writeSelectedAbbr("Prezzo"))
    expect(named.doc.nodeAt(cellPositions(named.doc)[7]!)!.textContent).toBe("40")
  })
})

describe("writeSelectedColumnWidth — the presentation register's twin", () => {
  const colWidths = (state: EditorState) => {
    let group: Node | null = null
    state.doc.firstChild!.forEach((child) => {
      if (child.type.name === "table_colgroup" && !group) group = child
    })
    if (!group) return null
    const widths: (number | null)[] = []
    ;(group as Node).forEach((col) => widths.push(col.attrs.width as number | null))
    return widths
  }

  it("declares a width — the first declaration carves the colgroup", () => {
    const { state, cells } = withTable()
    const sized = apply(select(state, cells[1]!), writeSelectedColumnWidth(120))
    expect(colWidths(sized)).toEqual([null, 120])
  })

  it("null demotes to fluid, and refuses when nothing was ever declared", () => {
    const { state, cells } = withTable()
    expect(writeSelectedColumnWidth(null)(select(state, cells[0]!), undefined)).toBe(false)
    const sized = apply(select(state, cells[1]!), writeSelectedColumnWidth(120))
    const both = apply(select(sized, cellPositions(sized.doc)[0]!), writeSelectedColumnWidth(80))
    // Clearing one column keeps the other's declaration standing.
    const oneCleared = apply(select(both, cellPositions(both.doc)[0]!), writeSelectedColumnWidth(null))
    expect(colWidths(oneCleared)).toEqual([null, 120])
    // Clearing the last declaration lifts the whole colgroup back out —
    // the carve's mirror; fixed layout never stands with nothing declared.
    const lifted = apply(select(oneCleared, cellPositions(oneCleared.doc)[1]!), writeSelectedColumnWidth(null))
    expect(colWidths(lifted)).toBeNull()
  })
})
