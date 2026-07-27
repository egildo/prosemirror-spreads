import type { Node } from "prosemirror-model"
import type { Command, EditorState, Transaction } from "prosemirror-state"
import { NodeSelection } from "prosemirror-state"
import { tableAround } from "./commands"
import type { Region } from "./gridmap"
import { GridMap, gridMap } from "./gridmap"
import { isCellType, spreadsNodeTypes } from "./schema"
import { spreadsKey } from "./state"

/// The structure family: add and delete rows and columns, as public
/// selection-driven commands (C12: menus dry-run them, keymaps bind them,
/// verbs declare them). All exported names are provisional — christening
/// cargo. The rules this file carves, each red-pennable:
///
/// - R1  a new row joins the reference row's section; crossing the
///       thead/tbody boundary is a promotion, which is its own verb.
/// - R2  a new row is full grid width and copies the reference row's
///       shape per column; ragged holes fall back to the region default.
/// - R3  deleting a section's last row deletes the section — except the
///       only body, which refuses: delete-table lives on the Escape
///       ladder, never as a row verb's side effect.
/// - C1  a new column arrives as data (th scope="col" under thead, td
///       everywhere else, even beside a row-header column — one
///       row-header per row is the v1 cap; "make this column the row
///       headers" is the regions family's future verb).
/// - C2  ragged rows clamp: inserts append at a short row's own end,
///       deletes touch only rows that reach the column; repair stays
///       C8's future duty, never a side effect.
///
/// Colgroup truth (the built portion of C8's shape duty): when a colgroup
/// stands, a column insert splices an undeclared col at the matching index
/// and a delete removes it — same transaction, one undo step. No colgroup
/// is ever created here (the first resize carves it). Only the first
/// colgroup is kept true, matching setColumnWidths' posture.

type Side = "before" | "after"

export interface CellContext {
  table: Node
  tablePos: number
  map: GridMap
  row: number
  col: number
}

/// Resolve grid mode for the structure family: a cell node-selection, its
/// table, and its grid coordinates. Null — the honest dry-run's false —
/// outside a cell selection, and while an edit buffer is open (surgery
/// under a live buffer would restructure the very cell being edited;
/// settling is one blur away). A whole-table selection also resolves
/// null: it carries no row or column target, and guessing one is the
/// magic the dry-run contract exists to avoid.
export function selectedCellContext(state: EditorState): CellContext | null {
  if (spreadsKey.getState(state)?.editing) return null
  const sel = state.selection
  if (!(sel instanceof NodeSelection) || !isCellType(sel.node.type)) return null
  const around = tableAround(state.doc, sel.from)
  if (!around) return null
  const map = gridMap(around.table)
  const at = map.find(sel.from - around.tablePos - 1)
  if (!at) return null
  return { table: around.table, tablePos: around.tablePos, map, row: at.row, col: at.col }
}

export interface RowSeat {
  section: Node
  sectionOffset: number
  region: Region
  row: Node
  rowOffset: number
}

/// Locate grid row `index` in the table's anatomy. Offsets are relative to
/// content starts: the row's document position is
/// `tablePos + 1 + sectionOffset + 1 + rowOffset`.
export function rowSeat(table: Node, index: number): RowSeat | null {
  let seen = 0
  let sectionOffset = 0
  for (let s = 0; s < table.childCount; s++) {
    const section = table.child(s)
    const region = section.type.spec.spreadsRole as string
    if (region === "head" || region === "body" || region === "foot") {
      let rowOffset = 0
      for (let r = 0; r < section.childCount; r++) {
        const row = section.child(r)
        if (row.type.spec.spreadsRole === "row") {
          if (seen === index) return { section, sectionOffset, region: region as Region, row, rowOffset }
          seen++
        }
        rowOffset += row.nodeSize
      }
    }
    sectionOffset += section.nodeSize
  }
  return null
}

export function bodyCount(table: Node): number {
  let count = 0
  for (let i = 0; i < table.childCount; i++) if (table.child(i).type.spec.spreadsRole === "body") count++
  return count
}

/// The first colgroup and its offset within the table's content — the one
/// kept true, matching setColumnWidths.
export function firstColgroup(table: Node): { node: Node; offset: number } | null {
  let offset = 0
  for (let i = 0; i < table.childCount; i++) {
    const child = table.child(i)
    if (child.type.spec.spreadsRole === "colgroup") return { node: child, offset }
    offset += child.nodeSize
  }
  return null
}

/// Offset of child `index` within a node's content (`index === childCount`
/// gives the content's end).
export function childOffset(node: Node, index: number): number {
  let offset = 0
  for (let i = 0; i < index; i++) offset += node.child(i).nodeSize
  return offset
}

/// R2 — build the new row: full grid width, each cell copying the
/// reference row's shape at its column (header cells keep kind and scope,
/// so a body row beside a scope="row" column keeps that column columnar;
/// data cells arrive empty, no formula). Where the ragged reference row
/// has no cell, the region decides: head rows default to scope="col"
/// headers, body and foot rows to data cells.
function newRowNode(state: EditorState, table: Node, map: GridMap, refRow: number, region: Region): Node {
  const types = spreadsNodeTypes(state.schema)
  const cells: Node[] = []
  for (let col = 0; col < map.width; col++) {
    const off = map.cellAt(refRow, col)
    const ref = off != null ? table.nodeAt(off) : null
    let cell: Node | null
    if (ref && ref.type.spec.spreadsRole === "header" && types.header)
      cell = types.header.createAndFill({ scope: (ref.attrs.scope as string | null) ?? null })
    else if (!ref && region === "head" && types.header) cell = types.header.createAndFill({ scope: "col" })
    else cell = types.cell!.createAndFill()
    cells.push(cell!)
  }
  return types.row!.create(null, cells)
}

/// After surgery, land the selection at the same grid coordinates on the
/// surviving grid — clamped, with the walk-left fallback the arrows use.
function selectClamped(tr: Transaction, tablePos: number, row: number, col: number): void {
  const table = tr.doc.nodeAt(tablePos)
  if (!table || table.type.spec.spreadsRole !== "table") return
  const map = gridMap(table)
  if (!map.height || !map.width) return
  const r = Math.min(row, map.height - 1)
  let c = Math.min(col, map.width - 1)
  let off = map.cellAt(r, c)
  while (off == null && c > 0) off = map.cellAt(r, --c)
  if (off == null) return
  tr.setSelection(NodeSelection.create(tr.doc, tablePos + 1 + off))
}

function insertRow(side: Side): Command {
  return (state, dispatch) => {
    const ctx = selectedCellContext(state)
    if (!ctx) return false
    const seat = rowSeat(ctx.table, ctx.row)
    if (!seat) return false
    if (dispatch) {
      // R1 — the insertion point stays inside the reference row's section:
      // "after" the last thead row is still the thead.
      const rowPos = ctx.tablePos + 1 + seat.sectionOffset + 1 + seat.rowOffset
      const insertPos = side === "before" ? rowPos : rowPos + seat.row.nodeSize
      const row = newRowNode(state, ctx.table, ctx.map, ctx.row, seat.region)
      const tr = state.tr.insert(insertPos, row)
      // The eyes and the next keystroke go to the new material: the new
      // row's cell in the reference column.
      tr.setSelection(NodeSelection.create(tr.doc, insertPos + 1 + childOffset(row, ctx.col)))
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

/// Insert a row above the selected cell's row, in the same section (R1),
/// shaped by the reference row (R2). Provisional name.
export const addRowBefore: Command = insertRow("before")

/// Insert a row below the selected cell's row, in the same section (R1),
/// shaped by the reference row (R2). Provisional name.
export const addRowAfter: Command = insertRow("after")

/// Delete the selected cell's row. A section's last row takes the section
/// with it; the only row of the only body refuses (R3). Selection lands at
/// the same grid coordinates, clamped. Provisional name.
export const deleteRow: Command = (state, dispatch) => {
  const ctx = selectedCellContext(state)
  if (!ctx) return false
  const seat = rowSeat(ctx.table, ctx.row)
  if (!seat) return false
  const lastOfSection = seat.section.childCount === 1
  // R3 — deleting the table wholesale already lives on the Escape ladder;
  // a row verb must never do it as a side effect.
  if (lastOfSection && seat.region === "body" && bodyCount(ctx.table) === 1) return false
  if (dispatch) {
    const tr = state.tr
    if (lastOfSection) {
      const sectionPos = ctx.tablePos + 1 + seat.sectionOffset
      tr.delete(sectionPos, sectionPos + seat.section.nodeSize)
    } else {
      const rowPos = ctx.tablePos + 1 + seat.sectionOffset + 1 + seat.rowOffset
      tr.delete(rowPos, rowPos + seat.row.nodeSize)
    }
    selectClamped(tr, ctx.tablePos, ctx.row, ctx.col)
    dispatch(tr.scrollIntoView())
  }
  return true
}

function insertColumn(side: Side): Command {
  return (state, dispatch) => {
    const ctx = selectedCellContext(state)
    if (!ctx) return false
    if (dispatch) {
      const types = spreadsNodeTypes(state.schema)
      const index = ctx.col + (side === "after" ? 1 : 0)
      // Collect every insertion point in document order, then apply
      // descending so earlier positions stay valid without remapping (the
      // enforcement pass's idiom).
      const inserts: { pos: number; node: Node }[] = []
      let sectionOffset = 0
      for (let s = 0; s < ctx.table.childCount; s++) {
        const section = ctx.table.child(s)
        const role = section.type.spec.spreadsRole
        if (role === "head" || role === "body" || role === "foot") {
          let rowOffset = 0
          for (let r = 0; r < section.childCount; r++) {
            const row = section.child(r)
            if (row.type.spec.spreadsRole === "row") {
              // C2 — clamp per row: a short row takes its new cell at its
              // own end; every row grows by exactly one.
              const at = Math.min(index, row.childCount)
              // C1 — the new column arrives as data.
              const cell =
                role === "head" && types.header
                  ? types.header.createAndFill({ scope: "col" })!
                  : types.cell!.createAndFill()!
              inserts.push({
                pos: ctx.tablePos + 1 + sectionOffset + 1 + rowOffset + 1 + childOffset(row, at),
                node: cell,
              })
            }
            rowOffset += row.nodeSize
          }
        }
        sectionOffset += section.nodeSize
      }
      // Colgroup truth: splice an undeclared col at the matching index.
      const colgroup = firstColgroup(ctx.table)
      if (colgroup && types.col) {
        const at = Math.min(index, colgroup.node.childCount)
        inserts.push({
          pos: ctx.tablePos + 1 + colgroup.offset + 1 + childOffset(colgroup.node, at),
          node: types.col.create({ width: null }),
        })
      }
      inserts.sort((a, b) => b.pos - a.pos)
      const tr = state.tr
      for (const { pos, node } of inserts) tr.insert(pos, node)
      // The new cell in the reference row.
      selectClamped(tr, ctx.tablePos, ctx.row, index)
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

/// Insert a column left of the selected cell's column (C1, C2). Provisional name.
export const addColumnBefore: Command = insertColumn("before")

/// Insert a column right of the selected cell's column (C1, C2). Provisional name.
export const addColumnAfter: Command = insertColumn("after")

/// Delete the selected cell's column. Rows that don't reach the column are
/// untouched; a row whose only cell dies goes with it, cascading into R3's
/// section rules; refuses at width one, and whenever no body row would
/// survive. Keeps the colgroup true. Provisional name.
export const deleteColumn: Command = (state, dispatch) => {
  const ctx = selectedCellContext(state)
  if (!ctx) return false
  // Deleting the last column would empty every row; whole-table deletion
  // belongs to the Escape ladder.
  if (ctx.map.width <= 1) return false
  const col = ctx.col
  // Precompute the cascade (C2 + R3): if no body row would survive
  // anywhere, refuse — and the refusal must hold on the dry run.
  let survivingBodyRows = 0
  for (let s = 0; s < ctx.table.childCount; s++) {
    const section = ctx.table.child(s)
    if (section.type.spec.spreadsRole !== "body") continue
    for (let r = 0; r < section.childCount; r++) {
      const row = section.child(r)
      if (row.type.spec.spreadsRole === "row" && !(row.childCount === 1 && col === 0)) survivingBodyRows++
    }
  }
  if (survivingBodyRows === 0) return false
  if (dispatch) {
    const ranges: { from: number; to: number }[] = []
    let sectionOffset = 0
    for (let s = 0; s < ctx.table.childCount; s++) {
      const section = ctx.table.child(s)
      const role = section.type.spec.spreadsRole
      if (role === "head" || role === "body" || role === "foot") {
        const sectionPos = ctx.tablePos + 1 + sectionOffset
        const rowRanges: { from: number; to: number }[] = []
        let dying = 0
        let rowOffset = 0
        for (let r = 0; r < section.childCount; r++) {
          const row = section.child(r)
          const rowPos = sectionPos + 1 + rowOffset
          if (row.type.spec.spreadsRole === "row") {
            if (row.childCount === 1 && col === 0) {
              // The row's only cell sits in the dying column: the row has
              // no standing in the surviving columns.
              rowRanges.push({ from: rowPos, to: rowPos + row.nodeSize })
              dying++
            } else if (row.childCount > col) {
              const cellPos = rowPos + 1 + childOffset(row, col)
              rowRanges.push({ from: cellPos, to: cellPos + row.child(col).nodeSize })
            }
          }
          rowOffset += row.nodeSize
        }
        // A section losing every row goes with them (R3's cascade).
        if (dying > 0 && dying === section.childCount)
          ranges.push({ from: sectionPos, to: sectionPos + section.nodeSize })
        else ranges.push(...rowRanges)
      }
      sectionOffset += section.nodeSize
    }
    const colgroup = firstColgroup(ctx.table)
    if (colgroup && colgroup.node.childCount > col) {
      const colPos = ctx.tablePos + 1 + colgroup.offset + 1 + childOffset(colgroup.node, col)
      ranges.push({ from: colPos, to: colPos + colgroup.node.child(col).nodeSize })
    }
    ranges.sort((a, b) => b.from - a.from)
    const tr = state.tr
    for (const { from, to } of ranges) tr.delete(from, to)
    selectClamped(tr, ctx.tablePos, ctx.row, col)
    dispatch(tr.scrollIntoView())
  }
  return true
}
