import { Fragment } from "prosemirror-model"
import type { EditorState, Transaction } from "prosemirror-state"
import { displayText, evaluateTable } from "./evaluate"

/// C8's second duty, working: keep the declarations true. After any
/// document change, every table's formula cells are evaluated (memoized
/// descent over the name graph, each cell visited once) and any cell whose
/// content disagrees with its formula is rewritten — in the same dispatch
/// as the change that dirtied it, so no observable editor state ever shows
/// a formula cell disagreeing with its inputs. Idempotent by construction:
/// a second pass finds nothing to change, which is what stops
/// appendTransaction's re-entry.
export function enforceDeclarations(state: EditorState): Transaction | null {
  const edits: { from: number; to: number; text: string }[] = []

  state.doc.descendants((node, pos) => {
    if (node.type.spec.spreadsRole !== "table") return true
    const results = evaluateTable(node)
    for (const [off, value] of results) {
      const cell = node.nodeAt(off)
      if (!cell) continue
      const text = displayText(value)
      if (text !== cell.textContent) {
        const cellPos = pos + 1 + off
        edits.push({ from: cellPos + 1, to: cellPos + cell.nodeSize - 1, text })
      }
    }
    return false
  })

  if (edits.length === 0) return null
  const tr = state.tr
  // Descending order: earlier positions stay valid without remapping.
  edits.sort((a, b) => b.from - a.from)
  for (const edit of edits)
    tr.replaceWith(edit.from, edit.to, edit.text ? state.schema.text(edit.text) : Fragment.empty)
  return tr
}
