import type { Node } from "prosemirror-model"
import type { Command, EditorState } from "prosemirror-state"
import { NodeSelection } from "prosemirror-state"
import { tableAround } from "./commands"
import { spreadsNodeTypes } from "./schema"
import { spreadsKey } from "./state"

/// The caption: the one node in the anatomy the editor could never reach.
/// `table_caption` has been in the content expression since the schema was
/// written — it parses from `<caption>`, it serializes back — but nothing
/// could create or remove one, so a caption could only ever arrive by paste.
/// This file is the missing half. Names here are provisional, like every
/// other name in the package.
///
/// Its register is the table's, not a cell's: a caption is the table's own
/// accessible name, the thing a screen reader announces before the grid.
/// So it resolves from the table you stand *in* — through a cell, or from
/// the whole-table selection the Escape rung climbs to.

/// The table you stand in — from a cell (or any selection inside one) or
/// from a whole-table node selection. Null while an edit buffer is open:
/// the anatomy holds still under a live buffer, the structure family's
/// own rule.
export function selectedTable(state: EditorState): { table: Node; tablePos: number } | null {
  if (spreadsKey.getState(state)?.editing) return null
  const sel = state.selection
  if (sel instanceof NodeSelection && sel.node.type.spec.spreadsRole === "table")
    return { table: sel.node, tablePos: sel.from }
  return tableAround(state.doc, sel.from)
}

// The caption node standing at the head of a table, if any. The schema puts
// it first or nowhere — `table_caption? table_colgroup* …` — so one look.
function standingCaption(table: Node): Node | null {
  const first = table.firstChild
  return first && first.type.spec.spreadsRole === "caption" ? first : null
}

/// The caption's text, or null when the table carries none. The readback a
/// collecting surface prefills from.
export function selectedCaption(state: EditorState): string | null {
  const at = selectedTable(state)
  return at ? (standingCaption(at.table)?.textContent ?? null) : null
}

/// Whether a caption can be written here at all — a table around, and the
/// node type in the schema. The availability gate, separate from the
/// command's dry run because writing the text already standing is honestly
/// a no-op and must not read as "unavailable".
export function canWriteCaption(state: EditorState): boolean {
  return !!selectedTable(state) && !!spreadsNodeTypes(state.schema).caption
}

/// Write the table's caption. Blank removes the caption node — the abbr
/// twin's law at the table's scale: an empty declaration is no declaration,
/// and an empty `<caption>` left standing is markup that announces nothing.
/// One transaction, one undo step; the selection rides the mapping, so the
/// cell you stood on is still the cell you stand on.
export function writeSelectedCaption(text: string | null): Command {
  return (state, dispatch) => {
    const at = selectedTable(state)
    if (!at) return false
    const types = spreadsNodeTypes(state.schema)
    if (!types.caption) return false
    const standing = standingCaption(at.table)
    const next = (text ?? "").trim()
    // Nothing to add and nothing to remove; writing what already stands is
    // the same no-op. Both refuse, so an undo step is never spent on nothing.
    if (!standing && !next) return false
    if (standing && standing.textContent === next) return false
    if (dispatch) {
      const start = at.tablePos + 1
      const tr = state.tr
      if (!next) tr.delete(start, start + standing!.nodeSize)
      else if (standing) tr.replaceWith(start + 1, start + standing.nodeSize - 1, state.schema.text(next))
      else tr.insert(start, types.caption.create(null, state.schema.text(next)))
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}
