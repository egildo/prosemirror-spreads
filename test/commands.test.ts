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
    const settled = apply(state, settleCell(cells[0]!, "a", 1))
    // Neighbor positions are measured on the settled document.
    expect(settled.selection.from).toBe(cellPositions(settled.doc)[1]!)
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
    let s = apply(state, settleCell(cells[0]!, "", 0)) // NodeSelection on first cell
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
