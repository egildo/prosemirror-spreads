import { describe, it, expect } from "vitest"
import { Schema } from "prosemirror-model"
import type { Node } from "prosemirror-model"
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state"
import type { Command } from "prosemirror-state"
import { schema as base } from "prosemirror-schema-basic"
import { history, undo } from "prosemirror-history"
import {
  spreads,
  spreadsNodes,
  spreadsNodeTypes,
  isCellType,
  startEditing,
  settleCell,
  selectEnclosingTable,
  addRowBefore,
  addRowAfter,
  addColumnBefore,
  addColumnAfter,
  deleteRow,
  deleteColumn,
  ERRORS,
} from "prosemirror-spreads"

// The structure family, pinned to its carved rules: R1 (a new row joins
// its reference's section), R2 (full-width rows copying the reference's
// shape), R3 (the emptying cascade, refusing the only body row), C1 (new
// columns arrive as data), C2 (ragged rows clamp), and colgroup truth.

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

// A bare 3×3 — the anonymous table every command must serve (C11).
function withTable() {
  const rows = Array.from({ length: 3 }, () =>
    types.row!.create(null, Array.from({ length: 3 }, () => types.cell!.createAndFill()!)),
  )
  return stateOf(types.table!.create(null, [types.body!.create(null, rows)]))
}

// Anatomy: a thead over a tbody whose last row is ragged (2 under 3).
function withAnatomy() {
  return stateOf(
    types.table!.create(null, [
      types.head!.create(null, [row(th("A", "col"), th("B", "col"), th("C", "col"))]),
      types.body!.create(null, [row(td("a1"), td("b1"), td("c1")), row(td("a2"), td("b2"))]),
    ]),
  )
}

// A scope="row" column: the row headers live in the body rows.
function withRowHeaders() {
  return stateOf(
    types.table!.create(null, [
      types.head!.create(null, [row(th("A", "col"), th("B", "col"))]),
      types.body!.create(null, [row(th("x", "row"), td("1")), row(th("y", "row"), td("2"))]),
    ]),
  )
}

describe("addRow — R1/R2", () => {
  it("adds a full-width data row below and selects the new cell in the same column", () => {
    const { state, cells } = withTable()
    const added = apply(select(state, cells[4]!), addRowAfter)
    const tbody = added.doc.firstChild!.firstChild!
    expect(tbody.childCount).toBe(4)
    const newRow = tbody.child(2)
    expect(newRow.childCount).toBe(3)
    newRow.forEach((cell) => {
      expect(cell.type.name).toBe("table_cell")
      expect(cell.textContent).toBe("")
    })
    // The new row's cells are grid indices 6..8; its middle is selected.
    expect(added.selection.from).toBe(cellPositions(added.doc)[7]!)
  })

  it("addRowBefore inserts above the reference row", () => {
    const { state, cells } = withTable()
    const added = apply(select(state, cells[4]!), addRowBefore)
    expect(added.doc.firstChild!.firstChild!.childCount).toBe(4)
    // The new row occupies grid indices 3..5; its middle is selected.
    expect(added.selection.from).toBe(cellPositions(added.doc)[4]!)
  })

  it("after the last thead row stays in the thead (R1)", () => {
    const { state, cells } = withAnatomy()
    const added = apply(select(state, cells[1]!), addRowAfter) // th "B"
    const table = added.doc.firstChild!
    const head = table.firstChild!
    expect(head.type.name).toBe("table_head")
    expect(head.childCount).toBe(2)
    head.child(1).forEach((cell) => {
      expect(cell.type.name).toBe("table_header")
      expect(cell.attrs.scope).toBe("col")
      expect(cell.textContent).toBe("")
    })
    expect(table.child(1).childCount).toBe(2) // the body is untouched
  })

  it("a body row beside a scope-row column keeps the column columnar (R2)", () => {
    const { state, cells } = withRowHeaders()
    const added = apply(select(state, cells[3]!), addRowAfter) // td "1"
    const newRow = added.doc.firstChild!.child(1).child(1)
    expect(newRow.child(0).type.name).toBe("table_header")
    expect(newRow.child(0).attrs.scope).toBe("row")
    expect(newRow.child(1).type.name).toBe("table_cell")
  })

  it("a tfoot insert stays in the tfoot", () => {
    const { state, cells } = stateOf(
      types.table!.create(null, [
        types.body!.create(null, [row(td("a"), td("b"))]),
        types.foot!.create(null, [row(td("f1"), td("f2"))]),
      ]),
    )
    const added = apply(select(state, cells[2]!), addRowAfter) // td "f1"
    const table = added.doc.firstChild!
    expect(table.child(0).childCount).toBe(1)
    expect(table.child(1).type.name).toBe("table_foot")
    expect(table.child(1).childCount).toBe(2)
  })

  it("a ragged reference row still mints a full-width row (R2's region default)", () => {
    const { state, cells } = withAnatomy()
    const added = apply(select(state, cells[6]!), addRowAfter) // td "a2", the short row
    const body = added.doc.firstChild!.child(1)
    expect(body.childCount).toBe(3)
    const newRow = body.child(2)
    expect(newRow.childCount).toBe(3)
    newRow.forEach((cell) => expect(cell.type.name).toBe("table_cell"))
  })

  it("one undo step lifts the whole insert back out", () => {
    const { state, cells } = withTable()
    const added = apply(select(state, cells[4]!), addRowAfter)
    const undone = apply(added, undo)
    expect(undone.doc.eq(state.doc)).toBe(true)
  })
})

describe("deleteRow — R3", () => {
  it("deletes the row and lands the selection on the same coordinates", () => {
    const { state, cells } = withTable()
    const gone = apply(select(state, cells[4]!), deleteRow)
    expect(gone.doc.firstChild!.firstChild!.childCount).toBe(2)
    expect(gone.selection.from).toBe(cellPositions(gone.doc)[4]!)
  })

  it("deleting the last row clamps the selection to the surviving one", () => {
    const { state, cells } = withTable()
    const gone = apply(select(state, cells[7]!), deleteRow)
    expect(gone.selection.from).toBe(cellPositions(gone.doc)[4]!)
  })

  it("the only thead row takes the thead with it — the table demotes honestly", () => {
    const { state, cells } = withAnatomy()
    const gone = apply(select(state, cells[0]!), deleteRow) // th "A"
    const table = gone.doc.firstChild!
    expect(table.childCount).toBe(1)
    expect(table.firstChild!.type.name).toBe("table_body")
    expect(table.firstChild!.childCount).toBe(2)
  })

  it("the only row of one of two bodies removes that body; the other stands", () => {
    const { state, cells } = stateOf(
      types.table!.create(null, [
        types.body!.create(null, [row(td("a"), td("b"))]),
        types.body!.create(null, [row(td("c"), td("d")), row(td("e"), td("f"))]),
      ]),
    )
    const gone = apply(select(state, cells[0]!), deleteRow)
    const table = gone.doc.firstChild!
    expect(table.childCount).toBe(1)
    expect(table.firstChild!.childCount).toBe(2)
  })

  it("refuses the only row of the only body — head rows stay deletable", () => {
    const { state, cells } = stateOf(
      types.table!.create(null, [
        types.head!.create(null, [row(th("A", "col"), th("B", "col"))]),
        types.body!.create(null, [row(td("x"), td("y"))]),
      ]),
    )
    expect(deleteRow(select(state, cells[2]!), undefined)).toBe(false) // td "x"
    expect(deleteRow(select(state, cells[0]!), undefined)).toBe(true) // th "A"
  })
})

describe("addColumn — C1/C2", () => {
  it("adds a column right, head rows get scope-col headers, ragged rows clamp", () => {
    const { state, cells } = withAnatomy()
    const added = apply(select(state, cells[4]!), addColumnAfter) // td "b1"
    const table = added.doc.firstChild!
    const headRow = table.child(0).child(0)
    expect(headRow.childCount).toBe(4)
    expect(headRow.child(2).type.name).toBe("table_header")
    expect(headRow.child(2).attrs.scope).toBe("col")
    expect(headRow.child(2).textContent).toBe("")
    const full = table.child(1).child(0)
    expect(full.childCount).toBe(4)
    expect(full.child(2).type.name).toBe("table_cell")
    // C2: the short row (2 cells, insert index 2) appends at its own end.
    const ragged = table.child(1).child(1)
    expect(ragged.childCount).toBe(3)
    expect(ragged.child(2).textContent).toBe("")
    // The new cell in the reference row is selected: grid (1, 2).
    expect(added.selection.from).toBe(cellPositions(added.doc)[6]!)
  })

  it("addColumnBefore at column 0 arrives as data even beside row headers (C1)", () => {
    const { state, cells } = withRowHeaders()
    const added = apply(select(state, cells[2]!), addColumnBefore) // th "x"
    const table = added.doc.firstChild!
    expect(table.child(0).child(0).child(0).type.name).toBe("table_header") // head row: th scope=col
    expect(table.child(0).child(0).child(0).attrs.scope).toBe("col")
    table.child(1).forEach((bodyRow) => {
      expect(bodyRow.childCount).toBe(3)
      expect(bodyRow.child(0).type.name).toBe("table_cell") // data, not a second row header
      expect(bodyRow.child(1).type.name).toBe("table_header") // the standing one keeps its seat
    })
  })

  it("creates no colgroup where none stands", () => {
    const { state, cells } = withTable()
    const added = apply(select(state, cells[0]!), addColumnAfter)
    added.doc.firstChild!.forEach((child) => expect(child.type.name).not.toBe("table_colgroup"))
  })
})

describe("colgroup truth — the built portion of C8", () => {
  function withColgroup() {
    const cols = [100, 120, 80].map((width) => types.col!.create({ width }))
    const rows = Array.from({ length: 2 }, () => row(td("x"), td("y"), td("z")))
    return stateOf(
      types.table!.create(null, [types.colgroup!.create(null, cols), types.body!.create(null, rows)]),
    )
  }

  const colWidths = (state: EditorState) => {
    const widths: (number | null)[] = []
    state.doc.firstChild!.firstChild!.forEach((col) => widths.push(col.attrs.width as number | null))
    return widths
  }

  it("a column insert splices an undeclared col at the matching index", () => {
    const { state, cells } = withColgroup()
    const added = apply(select(state, cells[0]!), addColumnAfter)
    expect(colWidths(added)).toEqual([100, null, 120, 80])
  })

  it("a column delete removes its col", () => {
    const { state, cells } = withColgroup()
    const gone = apply(select(state, cells[1]!), deleteColumn)
    expect(colWidths(gone)).toEqual([100, 80])
  })

  it("one undo step restores cells and colgroup together", () => {
    const { state, cells } = withColgroup()
    const added = apply(select(state, cells[0]!), addColumnAfter)
    const undone = apply(added, undo)
    expect(undone.doc.eq(state.doc)).toBe(true)
  })
})

describe("deleteColumn — C2's cascade", () => {
  it("removes the column and lands the selection clamped", () => {
    const { state, cells } = withTable()
    const gone = apply(select(state, cells[1]!), deleteColumn)
    gone.doc.firstChild!.firstChild!.forEach((r) => expect(r.childCount).toBe(2))
    expect(gone.selection.from).toBe(cellPositions(gone.doc)[1]!)
  })

  it("rows that don't reach the column are untouched", () => {
    const { state, cells } = withAnatomy()
    const gone = apply(select(state, cells[5]!), deleteColumn) // td "c1", column 2
    const table = gone.doc.firstChild!
    expect(table.child(0).child(0).childCount).toBe(2)
    expect(table.child(1).child(0).childCount).toBe(2)
    expect(table.child(1).child(1).childCount).toBe(2) // the ragged row never reached column 2
  })

  it("a row whose only cell dies goes with it", () => {
    const { state, cells } = stateOf(
      types.table!.create(null, [types.body!.create(null, [row(td("a1"), td("b1")), row(td("a2"))])]),
    )
    const gone = apply(select(state, cells[0]!), deleteColumn)
    const body = gone.doc.firstChild!.firstChild!
    expect(body.childCount).toBe(1)
    expect(body.child(0).childCount).toBe(1)
    expect(body.child(0).textContent).toBe("b1")
  })

  it("refuses when no body row would survive", () => {
    const { state, cells } = stateOf(
      types.table!.create(null, [
        types.head!.create(null, [row(th("A", "col"), th("B", "col"))]),
        types.body!.create(null, [row(td("x")), row(td("y"))]),
      ]),
    )
    expect(deleteColumn(select(state, cells[2]!), undefined)).toBe(false)
  })

  it("refuses at width one — the Escape ladder owns delete-table", () => {
    const { state, cells } = stateOf(
      types.table!.create(null, [types.body!.create(null, [row(td("a")), row(td("b"))])]),
    )
    expect(deleteColumn(select(state, cells[0]!), undefined)).toBe(false)
    // The other direction stays open: the narrow table can still grow.
    expect(addColumnAfter(select(state, cells[0]!), undefined)).toBe(true)
  })
})

describe("shared refusals", () => {
  const family: [string, Command][] = [
    ["addRowBefore", addRowBefore],
    ["addRowAfter", addRowAfter],
    ["addColumnBefore", addColumnBefore],
    ["addColumnAfter", addColumnAfter],
    ["deleteRow", deleteRow],
    ["deleteColumn", deleteColumn],
  ]

  it("outside a table every command refuses", () => {
    const state = EditorState.create({ schema, plugins: [history(), ...spreads()] })
    const text = state.apply(state.tr.setSelection(TextSelection.atStart(state.doc)))
    for (const [, command] of family) expect(command(text, undefined)).toBe(false)
  })

  it("a whole-table selection carries no target — every command refuses", () => {
    const { state, cells } = withTable()
    const onTable = apply(select(state, cells[0]!), selectEnclosingTable)
    for (const [, command] of family) expect(command(onTable, undefined)).toBe(false)
  })

  it("an open edit buffer refuses the whole family — settle first", () => {
    const { state, cells } = withTable()
    const editing = apply(state, startEditing(cells[4]!))
    for (const [, command] of family) expect(command(editing, undefined)).toBe(false)
  })
})

describe("the recompute rides the dispatch", () => {
  // Voce | Prezzo | Note, with =SUM(Prezzo) declared in the Note column.
  function withNamed() {
    const built = stateOf(
      types.table!.create(null, [
        types.head!.create(null, [row(th("Voce", "col"), th("Prezzo", "col"), th("Note", "col"))]),
        types.body!.create(null, [
          row(td("Ravioli"), td("12"), td("")),
          row(td("Nebbiolo"), td("28"), td("")),
        ]),
      ]),
    )
    const cells = built.cells
    const state = apply(built.state, settleCell(cells[8]!, "=SUM(Prezzo)"))
    return { state, cells: cellPositions(state.doc) }
  }

  it("deleteRow re-sums the named range", () => {
    const { state, cells } = withNamed()
    expect(state.doc.nodeAt(cells[8]!)!.textContent).toBe("40")
    const gone = apply(select(state, cells[4]!), deleteRow) // the Ravioli row
    const after = cellPositions(gone.doc)
    expect(gone.doc.nodeAt(after[5]!)!.textContent).toBe("28")
  })

  it("addRowAfter grows the membership without rewriting the formula", () => {
    const { state, cells } = withNamed()
    const added = apply(select(state, cells[4]!), addRowAfter)
    const grown = apply(added, settleCell(cellPositions(added.doc)[7]!, "5")) // the new Prezzo cell
    const after = cellPositions(grown.doc)
    const formulaCell = grown.doc.nodeAt(after[11]!)!
    expect(formulaCell.attrs.formula).toBe("=SUM(Prezzo)")
    expect(formulaCell.textContent).toBe("45")
  })

  it("deleteColumn on the named column leaves the formula reading #NAME?", () => {
    const { state, cells } = withNamed()
    const gone = apply(select(state, cells[4]!), deleteColumn) // the Prezzo column
    const after = cellPositions(gone.doc)
    const formulaCell = gone.doc.nodeAt(after[5]!)!
    expect(formulaCell.attrs.formula).toBe("=SUM(Prezzo)")
    expect(formulaCell.textContent).toBe(ERRORS.name.token)
  })
})
