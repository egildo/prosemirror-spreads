import type { Node } from "prosemirror-model"
import { Fragment } from "prosemirror-model"
import type { Command } from "prosemirror-state"
import { NodeSelection } from "prosemirror-state"
import { isCellType, spreadsNodeTypes } from "./schema"
import type { SpreadsMeta } from "./state"
import { spreadsKey } from "./state"

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

function relativeCellPos(doc: Node, pos: number, dir: -1 | 1): number | null {
  const cells = cellPositions(doc)
  const index = cells.indexOf(pos)
  if (index < 0) return null
  return cells[index + dir] ?? null
}

/// Insert a fresh table at the selection: `rows` × `cols`, empty, and
/// honest — a bare tbody and nothing more. With `headerRow`, a thead of
/// `scope="col"` headers rides above the data rows (probe scaffolding:
/// the promotion affordance is the rulers round's business).
export function insertTable(rows = 3, cols = 3, options: { headerRow?: boolean } = {}): Command {
  return (state, dispatch) => {
    const types = spreadsNodeTypes(state.schema)
    if (!types.table || !types.body || !types.row || !types.cell) return false
    const tableRows: Node[] = []
    for (let r = 0; r < rows; r++) {
      const cells: Node[] = []
      for (let c = 0; c < cols; c++) {
        const cell = types.cell.createAndFill()
        if (!cell) return false
        cells.push(cell)
      }
      tableRows.push(types.row.create(null, cells))
    }
    const sections: Node[] = []
    if (options.headerRow) {
      if (!types.head || !types.header) return false
      const headers: Node[] = []
      for (let c = 0; c < cols; c++) {
        const th = types.header.createAndFill({ scope: "col" })
        if (!th) return false
        headers.push(th)
      }
      sections.push(types.head.create(null, [types.row.create(null, headers)]))
    }
    sections.push(types.body.create(null, tableRows))
    const table = types.table.create(null, sections)
    if (dispatch) dispatch(state.tr.replaceSelectionWith(table).scrollIntoView())
    return true
  }
}

/// Enter edit mode on the selected cell — the public, selection-driven
/// verb (menus can dry-run it; keymaps bind it). With a `seed`, the buffer
/// opens holding the seed instead of the cell's content — typing replaces.
export function editSelectedCell(seed: string | null = null): Command {
  return (state, dispatch) => {
    const sel = state.selection
    if (!(sel instanceof NodeSelection) || !isCellType(sel.node.type)) return false
    return startEditing(sel.from, seed)(state, dispatch)
  }
}

/// Enter edit mode on the cell at `pos` — the node-view seam's form (the
/// view knows its position; menus and keymaps want [`editSelectedCell`](#editSelectedCell)).
/// With a `seed`, the buffer opens holding the seed instead of the cell's
/// content.
export function startEditing(pos: number, seed: string | null = null): Command {
  return (state, dispatch) => {
    const node = state.doc.nodeAt(pos)
    if (!node || !isCellType(node.type)) return false
    if (dispatch) {
      const tr = state.tr
      tr.setSelection(NodeSelection.create(state.doc, pos))
      tr.setMeta(spreadsKey, { type: "startEditing", pos, seed } satisfies SpreadsMeta)
      dispatch(tr)
    }
    return true
  }
}

/// Leave edit mode without settling — the abandoned edit. The document
/// never knew; selection returns to the cell.
export const stopEditing: Command = (state, dispatch) => {
  const editing = spreadsKey.getState(state)?.editing
  if (!editing) return false
  if (dispatch) {
    const tr = state.tr.setMeta(spreadsKey, { type: "stopEditing" } satisfies SpreadsMeta)
    const node = state.doc.nodeAt(editing.pos)
    if (node && isCellType(node.type)) tr.setSelection(NodeSelection.create(state.doc, editing.pos))
    dispatch(tr)
  }
  return true
}

/// Settle the cell at `pos`: commit the buffer's text, close the edit
/// seam, and place the selection — all in one transaction, one undo step
/// (C6: commit is the mode boundary, the evaluation trigger, and the undo
/// grouping; the recompute cascade rides this dispatch via enforcement).
/// "=" as the first character makes the cell a formula (the attribute is
/// the automation, content becomes the computed value — filled by the
/// enforcement pass in this same dispatch); plain text over a formula
/// cell demotes it to a standing value. Header cells never carry
/// formulas (settled): "=" text settles as literal content there.
export function settleCell(pos: number, text: string, advance: -1 | 0 | 1 = 0): Command {
  return (state, dispatch) => {
    const cell = state.doc.nodeAt(pos)
    if (!cell || !isCellType(cell.type)) return false
    if (dispatch) {
      const tr = state.tr
      const isDataCell = cell.type.spec.spreadsRole === "cell"
      const asFormula = isDataCell && text.startsWith("=")
      if (asFormula) {
        if (text !== cell.attrs.formula) tr.setNodeMarkup(pos, null, { ...cell.attrs, formula: text })
      } else {
        if (isDataCell && cell.attrs.formula != null) tr.setNodeMarkup(pos, null, { ...cell.attrs, formula: null })
        if (text !== cell.textContent)
          tr.replaceWith(pos + 1, pos + cell.nodeSize - 1, text ? state.schema.text(text) : Fragment.empty)
      }
      tr.setMeta(spreadsKey, { type: "stopEditing" } satisfies SpreadsMeta)
      const target = advance ? relativeCellPos(tr.doc, pos, advance) : null
      tr.setSelection(NodeSelection.create(tr.doc, target ?? pos))
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

/// In grid mode, walk the selection to the neighboring cell in document order.
export function selectRelativeCell(dir: -1 | 1): Command {
  return (state, dispatch) => {
    const sel = state.selection
    if (!(sel instanceof NodeSelection) || !isCellType(sel.node.type)) return false
    const target = relativeCellPos(state.doc, sel.from, dir)
    if (target == null) return false
    if (dispatch) dispatch(state.tr.setSelection(NodeSelection.create(state.doc, target)).scrollIntoView())
    return true
  }
}

/// Empty the selected cell — Backspace/Delete in grid mode.
export const clearSelectedCells: Command = (state, dispatch) => {
  const sel = state.selection
  if (!(sel instanceof NodeSelection) || !isCellType(sel.node.type)) return false
  if (dispatch) {
    const pos = sel.from
    const tr = state.tr
    if (sel.node.content.size > 0) {
      tr.replaceWith(pos + 1, pos + sel.node.nodeSize - 1, Fragment.empty)
      tr.setSelection(NodeSelection.create(tr.doc, pos))
    }
    dispatch(tr)
  }
  return true
}
