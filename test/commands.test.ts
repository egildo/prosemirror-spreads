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
  spreadsKey,
  isCellType,
  insertTable,
  startEditing,
  stopEditing,
  settleCell,
  selectRelativeCell,
  selectCellDelta,
  setColumnWidths,
  clearSelectedCells,
} from "prosemirror-spreads"

const schema = new Schema({
  nodes: base.spec.nodes.append(spreadsNodes()),
  marks: base.spec.marks,
})

function createState() {
  return EditorState.create({ schema, plugins: [history(), ...spreads()] })
}

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

// A state whose document already holds a 3×3 table, so history starts
// empty and each command's undo behavior is measured alone.
function withTable() {
  const types = spreadsNodeTypes(schema)
  const rows = Array.from({ length: 3 }, () =>
    types.row!.create(null, Array.from({ length: 3 }, () => types.cell!.createAndFill()!)),
  )
  const doc = schema.node("doc", null, [types.table!.create(null, [types.body!.create(null, rows)])])
  const state = EditorState.create({ schema, doc, plugins: [history(), ...spreads()] })
  return { state, cells: cellPositions(state.doc) }
}

describe("insertTable", () => {
  it("inserts a fresh, honest table: 3×3, empty, bare tbody", () => {
    const { state } = withTable()
    const table = state.doc.firstChild!
    expect(table.type.name).toBe("table")
    expect(table.childCount).toBe(1)
    const tbody = table.firstChild!
    expect(tbody.type.name).toBe("table_body")
    expect(tbody.childCount).toBe(3)
    tbody.forEach((row) => {
      expect(row.childCount).toBe(3)
      row.forEach((cell) => {
        expect(cell.type.name).toBe("table_cell")
        expect(cell.textContent).toBe("")
      })
    })
  })
})

describe("editing seam", () => {
  it("startEditing marks the cell and selects it as a node", () => {
    const { state, cells } = withTable()
    const editing = apply(state, startEditing(cells[4]!))
    expect(spreadsKey.getState(editing)!.editing).toEqual({ pos: cells[4], seed: null })
    const sel = editing.selection
    expect(sel).toBeInstanceOf(NodeSelection)
    expect(sel.from).toBe(cells[4])
  })

  it("carries the type-to-replace seed", () => {
    const { state, cells } = withTable()
    const editing = apply(state, startEditing(cells[0]!, "4"))
    expect(spreadsKey.getState(editing)!.editing!.seed).toBe("4")
  })

  it("stopEditing abandons the edit — the document never knew", () => {
    const { state, cells } = withTable()
    const editing = apply(state, startEditing(cells[0]!))
    const abandoned = apply(editing, stopEditing)
    expect(spreadsKey.getState(abandoned)!.editing).toBeNull()
    expect(abandoned.doc.eq(state.doc)).toBe(true)
  })

  it("maps the editing pos through unrelated changes — the remote press", () => {
    const { state, cells } = withTable()
    const editing = apply(state, startEditing(cells[4]!))
    // A "remote" change lands in the first cell while the buffer is open.
    const remote = editing.apply(editing.tr.insertText("remote", cells[0]! + 1))
    const mapped = spreadsKey.getState(remote)!.editing!
    expect(remote.doc.nodeAt(mapped.pos)!.type.name).toBe("table_cell")
    expect(mapped.pos).toBeGreaterThan(cells[4]!)
  })

  it("clears the seam when the edited cell's table is deleted", () => {
    const { state, cells } = withTable()
    const editing = apply(state, startEditing(cells[4]!))
    const gone = editing.apply(editing.tr.delete(0, editing.doc.content.size))
    expect(spreadsKey.getState(gone)!.editing).toBeNull()
  })
})

describe("settleCell", () => {
  it("settles as one transaction and one undo step", () => {
    const { state, cells } = withTable()
    const editing = apply(state, startEditing(cells[0]!))
    const settled = apply(editing, settleCell(cells[0]!, "42"))
    expect(settled.doc.nodeAt(cells[0]!)!.textContent).toBe("42")
    expect(spreadsKey.getState(settled)!.editing).toBeNull()
    expect(settled.selection.from).toBe(cells[0]!)
    const undone = apply(settled, undo)
    expect(undone.doc.nodeAt(cells[0]!)!.textContent).toBe("")
  })

  it("advance moves the selection to the neighboring cell", () => {
    const { state, cells } = withTable()
    const settled = apply(state, settleCell(cells[0]!, "a", "next"))
    // Neighbor positions are measured on the settled document.
    expect(settled.selection.from).toBe(cellPositions(settled.doc)[1]!)
  })

  it("Enter's advance lands the value and moves down the column", () => {
    const { state, cells } = withTable()
    const settled = apply(state, settleCell(cells[1]!, "b", "down"))
    // Down from the middle of row 0 is the middle of row 1: cell index 4.
    expect(settled.selection.from).toBe(cellPositions(settled.doc)[4]!)
    const back = apply(settled, settleCell(cellPositions(settled.doc)[4]!, "c", "up"))
    expect(back.selection.from).toBe(cellPositions(back.doc)[1]!)
  })

  it("a directional advance clamps at the table's edge — the settle stays put", () => {
    const { state, cells } = withTable()
    const settled = apply(state, settleCell(cells[0]!, "top", "up"))
    expect(settled.selection.from).toBe(cells[0]!)
  })

  it("settling an empty string empties the cell", () => {
    const { state, cells } = withTable()
    const filled = apply(state, settleCell(cells[0]!, "abc"))
    const emptied = apply(filled, settleCell(cells[0]!, ""))
    expect(emptied.doc.nodeAt(cells[0]!)!.textContent).toBe("")
  })
})

describe("grid navigation", () => {
  it("walks cells in document order and stops at the edges", () => {
    const { state, cells } = withTable()
    let s = apply(state, settleCell(cells[0]!, "")) // NodeSelection on first cell
    s = apply(s, selectRelativeCell(1))
    expect(s.selection.from).toBe(cells[1]!)
    const atStart = apply(s, selectRelativeCell(-1))
    expect(atStart.selection.from).toBe(cells[0]!)
    expect(selectRelativeCell(-1)(atStart, undefined)).toBe(false)
  })

  it("does not fire outside a cell node-selection", () => {
    const state = createState()
    const text = state.apply(state.tr.setSelection(TextSelection.atStart(state.doc)))
    expect(selectRelativeCell(1)(text, undefined)).toBe(false)
  })
})

// A table with anatomy for the 2-D walk: a thead row of headers over a
// tbody whose last row is ragged (2 cells under a width of 3).
function withAnatomy() {
  const types = spreadsNodeTypes(schema)
  const th = (text: string) => types.header!.create({ scope: "col" }, schema.text(text))
  const td = (text: string) => types.cell!.create(null, text ? schema.text(text) : null)
  const doc = schema.node("doc", null, [
    types.table!.create(null, [
      types.head!.create(null, [types.row!.create(null, [th("A"), th("B"), th("C")])]),
      types.body!.create(null, [
        types.row!.create(null, [td("a1"), td("b1"), td("c1")]),
        types.row!.create(null, [td("a2"), td("b2")]),
      ]),
    ]),
  ])
  const state = EditorState.create({ schema, doc, plugins: [history(), ...spreads()] })
  return { state, cells: cellPositions(state.doc) }
}

function select(state: EditorState, pos: number): EditorState {
  return state.apply(state.tr.setSelection(NodeSelection.create(state.doc, pos)))
}

describe("selectCellDelta — the arrows' 2-D walk", () => {
  it("walks down and right on the grid", () => {
    const { state, cells } = withTable()
    let s = select(state, cells[4]!) // middle of the 3×3
    s = apply(s, selectCellDelta(1, 0))
    expect(s.selection.from).toBe(cells[7]!)
    s = select(state, cells[4]!)
    s = apply(s, selectCellDelta(0, 1))
    expect(s.selection.from).toBe(cells[5]!)
  })

  it("clamps at the table's edges — arrows never wrap", () => {
    const { state, cells } = withTable()
    const corner = select(state, cells[0]!)
    expect(selectCellDelta(-1, 0)(corner, undefined)).toBe(false)
    expect(selectCellDelta(0, -1)(corner, undefined)).toBe(false)
    const end = select(state, cells[2]!) // end of first row: right must not wrap
    expect(selectCellDelta(0, 1)(end, undefined)).toBe(false)
  })

  it("crosses the thead/tbody boundary in the same column", () => {
    const { state, cells } = withAnatomy()
    const header = select(state, cells[1]!) // th "B"
    const below = apply(header, selectCellDelta(1, 0))
    expect(below.selection.from).toBe(cells[4]!) // td "b1"
    const back = apply(below, selectCellDelta(-1, 0))
    expect(back.selection.from).toBe(cells[1]!)
  })

  it("a ragged target row clamps to its nearest existing cell", () => {
    const { state, cells } = withAnatomy()
    const c1 = select(state, cells[5]!) // td "c1", column 3 of a full row
    const down = apply(c1, selectCellDelta(1, 0))
    expect(down.selection.from).toBe(cells[7]!) // td "b2" — the ragged row's last cell
  })

  it("does not fire outside a cell node-selection", () => {
    const state = createState()
    const text = state.apply(state.tr.setSelection(TextSelection.atStart(state.doc)))
    expect(selectCellDelta(1, 0)(text, undefined)).toBe(false)
  })
})

describe("setColumnWidths", () => {
  const colWidths = (state: EditorState) => {
    const table = state.doc.firstChild!
    let group: Node | null = null
    table.forEach((child) => {
      if (child.type.name === "table_colgroup" && !group) group = child
    })
    if (!group) return null
    const widths: (number | null)[] = []
    ;(group as Node).forEach((col) => widths.push(col.attrs.width))
    return widths
  }

  it("the first resize carves the colgroup — and one undo step lifts it out", () => {
    const { state } = withTable()
    const sized = apply(state, setColumnWidths(0, [100, 120, 80]))
    expect(colWidths(sized)).toEqual([100, 120, 80])
    const undone = apply(sized, undo)
    expect(colWidths(undone)).toBeNull()
  })

  it("a later resize keeps standing declarations untouched", () => {
    const { state } = withTable()
    const sized = apply(state, setColumnWidths(0, [100, 120, 80]))
    const resized = apply(sized, setColumnWidths(0, [undefined, 90, undefined]))
    expect(colWidths(resized)).toEqual([100, 90, 80])
  })

  it("the cell selection survives the carve", () => {
    const { state, cells } = withTable()
    const selected = select(state, cells[4]!)
    const sized = apply(selected, setColumnWidths(0, [100, 120, 80]))
    const sel = sized.selection
    expect(sel).toBeInstanceOf(NodeSelection)
    expect(sized.doc.nodeAt(sel.from)!.type.name).toBe("table_cell")
  })

  it("the colgroup lands between thead and any earlier furniture", () => {
    const { state } = withAnatomy()
    const sized = apply(state, setColumnWidths(0, [50, 60, 70]))
    expect(sized.doc.firstChild!.firstChild!.type.name).toBe("table_colgroup")
    expect(colWidths(sized)).toEqual([50, 60, 70])
  })
})

describe("selection legality", () => {
  it("coerces a text selection inside an atom cell to the cell's node selection", () => {
    const { state, cells } = withTable()
    const filled = apply(state, settleCell(cells[0]!, "abc"))
    // A caret inside the cell (as undo/redo can restore) must not survive.
    const inside = filled.apply(filled.tr.setSelection(TextSelection.create(filled.doc, cells[0]! + 2)))
    expect(inside.selection).toBeInstanceOf(NodeSelection)
    expect(inside.selection.from).toBe(cells[0]!)
  })
})

describe("clearSelectedCells", () => {
  it("empties the selected cell and keeps it selected", () => {
    const { state, cells } = withTable()
    const filled = apply(state, settleCell(cells[4]!, "kaboom"))
    const cleared = apply(filled, clearSelectedCells)
    expect(cleared.doc.nodeAt(cells[4]!)!.textContent).toBe("")
    expect(cleared.selection.from).toBe(cells[4]!)
  })
})
