import type { Schema } from "prosemirror-model"
import type { Command, EditorState } from "prosemirror-state"
import { clearSelectedCells, editSelectedCell, insertTable } from "./commands"
import { spreadsNodeTypes } from "./schema"
import { spreadsKey } from "./state"

/// A verb entry in prosemirror-verbs' structural contract — declared here
/// as our own type on purpose: the contract is plain data (id, label,
/// command, faces, chords), so a plugin declares verbs by exporting
/// objects, paying zero dependency on the registry — not even a type
/// import. Only hosts, which compose and project, depend on that package.
/// Extra properties are preserved by the registry, never refused.
export interface SpreadsVerb {
  id: string
  label: string
  command: Command
  short?: string
  read?: (state: EditorState) => unknown
  keys?: string[]
  keywords?: string[]
  group?: string
}

/// The spreads verb set — the selection-driven public verbs as declarations
/// a verbs host composes (`composeVerbs(basicVerbs(schema), spreadsVerbs(schema), …)`).
/// A set guards its nouns: without our node types in the schema it yields
/// nothing. No chords are declared here — the grid's keys are a *policy*,
/// not chords: seat `{ name: "grid", bindings: gridKeys }` before your base
/// keymap, and remember the split: verbs governs the keyboard outside the
/// black box; inside it the box routes its own keys.
export function spreadsVerbs(schema: Schema): SpreadsVerb[] {
  const types = spreadsNodeTypes(schema)
  if (!types.table || !types.body || !types.row || !types.cell) return []
  return [
    {
      id: "table:insert",
      label: "Insert table",
      short: "⊞",
      command: insertTable(3, 3, { headerRow: !!(types.head && types.header) }),
      keywords: ["table", "grid", "spreadsheet"],
      group: "table",
    },
    {
      id: "table:edit",
      label: "Edit cell",
      command: editSelectedCell(),
      // The readback reads plugin state (the edit seam): is a buffer open?
      read: (state: EditorState) => !!spreadsKey.getState(state)?.editing,
      keywords: ["cell", "edit", "formula"],
      group: "table",
    },
    {
      id: "table:clear",
      label: "Clear cell",
      command: clearSelectedCells,
      keywords: ["cell", "clear", "empty"],
      group: "table",
    },
  ]
}
