import type { Node } from "prosemirror-model"
import type { Command, EditorState } from "prosemirror-state"
import { NodeSelection } from "prosemirror-state"
import type { Region } from "./gridmap"
import { spreadsNodeTypes } from "./schema"
import type { RowSeat } from "./structure"
import { bodyCount, childOffset, rowSeat, selectedCellContext } from "./structure"

/// The regions and partition family. Regions are a *kind* — {head, body,
/// foot}, the row-region verb's enumerable domain; partitions are a
/// *boundary* — multiple tbodies split and joined, structure not kind.
/// All names provisional — christening cargo. The carved rules:
///
/// - Scope is a consequence, never a dial (Egildo's ruling): promotion to
///   the head mints th scope="col", the row-header column mints
///   scope="row"; no verb sets scope directly, so no illegal state is
///   reachable.
/// - Settle-and-demote (Egildo's ruling): a formula cell converted to a
///   header keeps its computed content as standing text; the automation
///   is honestly dropped. Content is already the computed value (P3), so
///   the demotion is exactly "drop the attribute".
/// - Adjacency decides the landing: a promoted row crosses the nearest
///   boundary and lands against it — to head: at its end; to foot: at its
///   start; back to body: at the edge nearest where it came from.
/// - Demotion is never a side effect (R3's instinct): making a column the
///   row headers refuses while another column holds the seat.
/// - The partition is invisible to the resolver (the spanning ruling):
///   names denote body cells across every tbody; split and join change
///   grouping, never arithmetic.

/// The region of the selected cell's row, or null off-grid — the
/// row-region verb's readback.
export function selectedRowRegion(state: EditorState): Region | null {
  const ctx = selectedCellContext(state)
  if (!ctx) return null
  return ctx.map.rowsMeta[ctx.row]?.region ?? null
}

/// The column currently serving as row headers: the first column holding a
/// scope="row" th in a body row, or null.
function rowHeaderColumn(state: EditorState, table: Node, map: { width: number; height: number; rowsMeta: readonly { region: Region }[]; headerAt(r: number, c: number): boolean; cellAt(r: number, c: number): number | null }): number | null {
  for (let col = 0; col < map.width; col++) {
    for (let row = 0; row < map.height; row++) {
      if (map.rowsMeta[row]?.region !== "body" || !map.headerAt(row, col)) continue
      const off = map.cellAt(row, col)
      const th = off != null ? table.nodeAt(off) : null
      if (th?.attrs.scope === "row") return col
    }
  }
  return null
}

/// Whether the selected cell's column is the row-header column — the
/// toggle's boolean readback.
export function selectedColumnIsRowHeaders(state: EditorState): boolean {
  const ctx = selectedCellContext(state)
  if (!ctx) return false
  return rowHeaderColumn(state, ctx.table, ctx.map) === ctx.col
}

/// Convert a moving row for its destination region. To the head every cell
/// becomes a th scope="col" (settle-and-demote: content — already the
/// computed value — survives, the formula attribute does not; a th's abbr
/// rides along). Leaving the head, cells become data — except where the
/// destination's adjacent row holds a scope="row" th at that column, which
/// the arriving row copies (R2's rhyme: rows entering a region take the
/// region's shape). Between body and foot the row moves unchanged.
function convertedRow(
  types: ReturnType<typeof spreadsNodeTypes>,
  seat: RowSeat,
  target: Region,
  adjacent: Node | null,
): Node {
  if (target !== "head" && seat.region !== "head") return seat.row
  const cells: Node[] = []
  for (let i = 0; i < seat.row.childCount; i++) {
    const cell = seat.row.child(i)
    const wasHeader = cell.type.spec.spreadsRole === "header"
    if (target === "head") {
      cells.push(types.header!.create({ scope: "col", abbr: wasHeader ? cell.attrs.abbr : null }, cell.content))
    } else {
      const ref = adjacent && i < adjacent.childCount ? adjacent.child(i) : null
      if (ref && ref.type.spec.spreadsRole === "header" && ref.attrs.scope === "row")
        cells.push(types.header!.create({ scope: "row", abbr: wasHeader ? cell.attrs.abbr : null }, cell.content))
      else cells.push(types.cell!.create(null, cell.content))
    }
  }
  return types.row!.create(null, cells)
}

/// Move the selected cell's row to `region` — the boundary-crossing verb
/// R1 deferred, one row per invocation, one transaction, one undo step.
/// Creates the destination section when the table lacks it; a section's
/// last row takes the emptying section with it (R3's cascade); the only
/// row of the only body refuses to leave. Refuses when the row is already
/// in `region` — the readback names the current member; the command moves.
export function setRowRegion(region: Region): Command {
  return (state, dispatch) => {
    const ctx = selectedCellContext(state)
    if (!ctx) return false
    const seat = rowSeat(ctx.table, ctx.row)
    if (!seat || seat.region === region) return false
    const lastOfSection = seat.section.childCount === 1
    if (seat.region === "body" && lastOfSection && bodyCount(ctx.table) === 1) return false
    const types = spreadsNodeTypes(state.schema)
    if (region === "head" && (!types.head || !types.header)) return false
    if (region === "foot" && !types.foot) return false
    if (dispatch) {
      const tr = state.tr
      if (lastOfSection) {
        const sectionPos = ctx.tablePos + 1 + seat.sectionOffset
        tr.delete(sectionPos, sectionPos + seat.section.nodeSize)
      } else {
        const rowPos = ctx.tablePos + 1 + seat.sectionOffset + 1 + seat.rowOffset
        tr.delete(rowPos, rowPos + seat.row.nodeSize)
      }
      // Re-survey the table after the lift: sections may have shifted or
      // vanished; the landing is computed against what actually stands.
      const table = tr.doc.nodeAt(ctx.tablePos)!
      let head: { node: Node; offset: number } | null = null
      let foot: { node: Node; offset: number } | null = null
      let firstBody: { node: Node; offset: number } | null = null
      let lastBody: { node: Node; offset: number } | null = null
      let afterFurniture = 0
      let offset = 0
      for (let i = 0; i < table.childCount; i++) {
        const child = table.child(i)
        const role = child.type.spec.spreadsRole
        if (role === "caption" || role === "colgroup") afterFurniture = offset + child.nodeSize
        else if (role === "head") head = { node: child, offset }
        else if (role === "foot") foot = { node: child, offset }
        else if (role === "body") {
          if (!firstBody) firstBody = { node: child, offset }
          lastBody = { node: child, offset }
        }
        offset += child.nodeSize
      }
      let insertPos: number
      let wrap: "head" | "foot" | null = null
      let adjacent: Node | null = null
      if (region === "head") {
        insertPos = head ? ctx.tablePos + 1 + head.offset + 1 + head.node.content.size : ctx.tablePos + 1 + afterFurniture
        if (!head) wrap = "head"
      } else if (region === "foot") {
        insertPos = foot ? ctx.tablePos + 1 + foot.offset + 1 : ctx.tablePos + 1 + table.content.size
        if (!foot) wrap = "foot"
        adjacent = foot?.node.firstChild ?? null
      } else {
        // Adjacency decides: from the head, land at the top of the first
        // body; from the foot, at the bottom of the last.
        const target = seat.region === "head" ? firstBody! : lastBody!
        insertPos =
          seat.region === "head"
            ? ctx.tablePos + 1 + target.offset + 1
            : ctx.tablePos + 1 + target.offset + 1 + target.node.content.size
        adjacent = seat.region === "head" ? target.node.firstChild : target.node.lastChild
      }
      const moved = convertedRow(types, seat, region, adjacent)
      if (wrap === "head") tr.insert(insertPos, types.head!.create(null, [moved]))
      else if (wrap === "foot") tr.insert(insertPos, types.foot!.create(null, [moved]))
      else tr.insert(insertPos, moved)
      const base = wrap ? insertPos + 2 : insertPos + 1
      const col = Math.min(ctx.col, moved.childCount - 1)
      tr.setSelection(NodeSelection.create(tr.doc, base + childOffset(moved, col)))
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

/// Toggle the selected cell's column as the table's row headers. Promotion
/// mints th scope="row" down the body and foot (settle-and-demote on
/// formula cells; ragged rows convert where they reach the column, C2);
/// demotion returns the column to data, its abbrs dying with the
/// header-ness. Refuses while a *different* column holds the seat —
/// demotion is never a side effect. Head rows are untouched.
export const toggleRowHeaderColumn: Command = (state, dispatch) => {
  const ctx = selectedCellContext(state)
  if (!ctx) return false
  const types = spreadsNodeTypes(state.schema)
  if (!types.header || !types.cell) return false
  const current = rowHeaderColumn(state, ctx.table, ctx.map)
  if (current != null && current !== ctx.col) return false
  const promote = current == null
  if (dispatch) {
    const edits: { pos: number; end: number; cell: Node }[] = []
    let sectionOffset = 0
    for (let s = 0; s < ctx.table.childCount; s++) {
      const section = ctx.table.child(s)
      const role = section.type.spec.spreadsRole
      if (role === "body" || role === "foot") {
        let rowOffset = 0
        for (let r = 0; r < section.childCount; r++) {
          const row = section.child(r)
          if (row.type.spec.spreadsRole === "row" && row.childCount > ctx.col) {
            const cell = row.child(ctx.col)
            const cellRole = cell.type.spec.spreadsRole
            const pos = ctx.tablePos + 1 + sectionOffset + 1 + rowOffset + 1 + childOffset(row, ctx.col)
            const end = pos + cell.nodeSize
            if (promote && cellRole === "cell")
              edits.push({ pos, end, cell: types.header.create({ scope: "row" }, cell.content) })
            else if (promote && cellRole === "header" && cell.attrs.scope !== "row")
              edits.push({ pos, end, cell: types.header.create({ ...cell.attrs, scope: "row" }, cell.content) })
            else if (!promote && cellRole === "header" && cell.attrs.scope === "row")
              edits.push({ pos, end, cell: types.cell.create(null, cell.content) })
          }
          rowOffset += row.nodeSize
        }
      }
      sectionOffset += section.nodeSize
    }
    const tr = state.tr
    for (let i = edits.length - 1; i >= 0; i--) {
      const { pos, end, cell } = edits[i]!
      tr.replaceWith(pos, end, cell)
    }
    // Converted cells keep their content, so every position stands.
    tr.setSelection(NodeSelection.create(tr.doc, state.selection.from))
    dispatch(tr.scrollIntoView())
  }
  return true
}

/// Split the selected cell's tbody above its row — Enter at the row-group
/// scale: the row becomes the first row of a new tbody. Refuses outside a
/// body and on a row already first in its body (the boundary is already
/// there). The partition is invisible to the resolver: names keep
/// spanning; grouping changes, arithmetic does not.
export const splitBody: Command = (state, dispatch) => {
  const ctx = selectedCellContext(state)
  if (!ctx) return false
  const seat = rowSeat(ctx.table, ctx.row)
  if (!seat || seat.region !== "body" || seat.rowOffset === 0) return false
  if (dispatch) {
    const rowPos = ctx.tablePos + 1 + seat.sectionOffset + 1 + seat.rowOffset
    dispatch(state.tr.split(rowPos).scrollIntoView())
  }
  return true
}

/// Join the selected cell's tbody with the one before it — Backspace at
/// the row-group scale. Refuses when no tbody stands immediately before
/// this one (the head is not a group; a partition dissolves only into its
/// own kind).
export const joinBodies: Command = (state, dispatch) => {
  const ctx = selectedCellContext(state)
  if (!ctx) return false
  const seat = rowSeat(ctx.table, ctx.row)
  if (!seat || seat.region !== "body") return false
  let previous: Node | null = null
  let offset = 0
  for (let i = 0; i < ctx.table.childCount; i++) {
    const child = ctx.table.child(i)
    if (offset === seat.sectionOffset) break
    previous = child
    offset += child.nodeSize
  }
  if (previous?.type.spec.spreadsRole !== "body") return false
  if (dispatch) {
    dispatch(state.tr.join(ctx.tablePos + 1 + seat.sectionOffset).scrollIntoView())
  }
  return true
}
