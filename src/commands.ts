import type { Node } from "prosemirror-model"
import { Fragment } from "prosemirror-model"
import type { Command } from "prosemirror-state"
import { NodeSelection, Selection } from "prosemirror-state"
import { gridMap } from "./gridmap"
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

/// The table enclosing a cell position, with the table's own position.
function tableAround(doc: Node, cellPos: number): { table: Node; tablePos: number } | null {
  const $pos = doc.resolve(cellPos)
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d)
    if (node.type.spec.spreadsRole === "table") return { table: node, tablePos: $pos.before(d) }
  }
  return null
}

const clampIndex = (value: number, max: number) => Math.max(0, Math.min(value, max))

/// Grid-walk a step of (dRow, dCol) from the cell at `pos`, clamping at the
/// table's edges — never wrapping (Tab wraps; arrows don't). A ragged target
/// row clamps to its nearest existing cell. Null when the step goes nowhere.
function deltaCellPos(doc: Node, pos: number, dRow: number, dCol: number): number | null {
  const around = tableAround(doc, pos)
  if (!around) return null
  const map = gridMap(around.table)
  const at = map.find(pos - around.tablePos - 1)
  if (!at) return null
  const row = clampIndex(at.row + dRow, map.height - 1)
  let col = clampIndex(at.col + dCol, map.width - 1)
  let off = map.cellAt(row, col)
  while (off == null && col > 0) off = map.cellAt(row, --col)
  if (off == null) return null
  const target = around.tablePos + 1 + off
  return target === pos ? null : target
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

/// Where a settle sends the selection: the spreadsheet's directions.
/// `down`/`up`/`right`/`left` walk the grid, clamping at edges (Enter,
/// Shift-Enter, and entry-mode arrows); `next`/`prev` walk document order,
/// wrapping at row ends (Tab / Shift-Tab); null leaves the selection
/// where it is — the blur settle's form.
export type SettleAdvance = "down" | "up" | "right" | "left" | "next" | "prev" | null

/// Settle the cell at `pos`: commit the buffer's text, close the edit
/// seam, and place the selection — all in one transaction, one undo step
/// (C6: commit is the mode boundary, the evaluation trigger, and the undo
/// grouping; the recompute cascade rides this dispatch via enforcement).
/// "=" as the first character makes the cell a formula (the attribute is
/// the automation, content becomes the computed value — filled by the
/// enforcement pass in this same dispatch); plain text over a formula
/// cell demotes it to a standing value. Header cells never carry
/// formulas (settled): "=" text settles as literal content there.
export function settleCell(pos: number, text: string, advance: SettleAdvance = null): Command {
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
      // The cell's own start position survives the in-cell edits above, so
      // the walk runs on tr.doc from the same pos. Without an advance the
      // selection stays wherever the user put it — a blur settle must not
      // yank it back to the edited cell.
      if (advance) {
        const target =
          advance === "next" ? relativeCellPos(tr.doc, pos, 1)
          : advance === "prev" ? relativeCellPos(tr.doc, pos, -1)
          : advance === "down" ? deltaCellPos(tr.doc, pos, 1, 0)
          : advance === "up" ? deltaCellPos(tr.doc, pos, -1, 0)
          : advance === "right" ? deltaCellPos(tr.doc, pos, 0, 1)
          : deltaCellPos(tr.doc, pos, 0, -1)
        tr.setSelection(NodeSelection.create(tr.doc, target ?? pos))
      }
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

/// In grid mode, walk the selection a grid step of (dRow, dCol) — the four
/// arrows' command. Clamps at table edges, never wraps; a ragged target row
/// clamps to its nearest existing cell.
export function selectCellDelta(dRow: number, dCol: number): Command {
  return (state, dispatch) => {
    const sel = state.selection
    if (!(sel instanceof NodeSelection) || !isCellType(sel.node.type)) return false
    const target = deltaCellPos(state.doc, sel.from, dRow, dCol)
    if (target == null) return false
    if (dispatch) dispatch(state.tr.setSelection(NodeSelection.create(state.doc, target)).scrollIntoView())
    return true
  }
}

/// Leave the table vertically — the arrows' document exit. When the grid
/// walk has nowhere further to go (top or bottom row), the selection steps
/// out into the prose before or after the table. Refuses to fire when
/// there is nowhere outside to land (Selection.near bending back inside
/// the table means the table sits at the document's edge — clamp).
export function exitTable(dir: -1 | 1): Command {
  return (state, dispatch) => {
    const sel = state.selection
    if (!(sel instanceof NodeSelection) || !isCellType(sel.node.type)) return false
    const around = tableAround(state.doc, sel.from)
    if (!around) return false
    const from = dir < 0 ? around.tablePos : around.tablePos + around.table.nodeSize
    const target = Selection.near(state.doc.resolve(from), dir)
    const end = around.tablePos + around.table.nodeSize
    if (target.head > around.tablePos && target.head < end) return false
    if (dispatch) dispatch(state.tr.setSelection(target).scrollIntoView())
    return true
  }
}

/// The Escape ladder's first rung: from a cell to its whole table. A table
/// node-selection belongs to the editor — typing replaces it, Backspace
/// deletes it, arrows leave it.
export const selectEnclosingTable: Command = (state, dispatch) => {
  const sel = state.selection
  if (!(sel instanceof NodeSelection) || !isCellType(sel.node.type)) return false
  const around = tableAround(state.doc, sel.from)
  if (!around) return false
  if (dispatch) dispatch(state.tr.setSelection(NodeSelection.create(state.doc, around.tablePos)).scrollIntoView())
  return true
}

/// In grid mode, walk the selection to the neighboring cell in document
/// order — Tab's command: unlike the arrows it wraps at row ends.
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

/// Declare column widths on the table at `tablePos` — the resize gesture's
/// settle (seam form: the box measured the geometry). Creates the colgroup
/// when the table has none (the first resize carves it into the document),
/// sizes it to the grid's width, and applies every defined entry —
/// `undefined` keeps a column's standing width, `null` clears it. One
/// transaction, one undo step: undoing the first resize lifts the whole
/// colgroup back out.
export function setColumnWidths(tablePos: number, widths: readonly (number | null | undefined)[]): Command {
  return (state, dispatch) => {
    const table = state.doc.nodeAt(tablePos)
    if (!table || table.type.spec.spreadsRole !== "table") return false
    const types = spreadsNodeTypes(state.schema)
    if (!types.colgroup || !types.col) return false
    let colgroup: Node | null = null
    let colgroupOffset = -1
    let insertAt = 0
    table.forEach((child, childOffset) => {
      const role = child.type.spec.spreadsRole
      if (role === "colgroup" && !colgroup) {
        colgroup = child
        colgroupOffset = childOffset
      }
      if (role === "caption") insertAt = childOffset + child.nodeSize
    })
    const current: (number | null)[] = []
    if (colgroup) (colgroup as Node).forEach((col) => current.push((col.attrs.width as number | null) ?? null))
    while (current.length < gridMap(table).width) current.push(null)
    const next = current.map((w, i) => (widths[i] === undefined ? w : widths[i]!))
    if (dispatch) {
      const group = types.colgroup.create(null, next.map((w) => types.col!.create({ width: w })))
      const tr = state.tr
      if (colgroup)
        tr.replaceWith(tablePos + 1 + colgroupOffset, tablePos + 1 + colgroupOffset + (colgroup as Node).nodeSize, group)
      else tr.insert(tablePos + 1 + insertAt, group)
      dispatch(tr)
    }
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
