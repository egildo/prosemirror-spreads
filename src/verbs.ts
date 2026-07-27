import type { Schema } from "prosemirror-model"
import type { Command, EditorState } from "prosemirror-state"
import { NodeSelection } from "prosemirror-state"
import {
  clearSelectedCells,
  editSelectedCell,
  insertTable,
  selectEnclosingTable,
  writeSelectedCell,
} from "./commands"
import { spreadsNodeTypes } from "./schema"
import { spreadsKey } from "./state"
import { addColumnAfter, addColumnBefore, addRowAfter, addRowBefore, deleteColumn, deleteRow } from "./structure"

/// An argument a collecting host must gather before running an arg-verb.
/// The `type` vocabulary belongs to whoever collects.
export interface SpreadsVerbArg {
  name: string
  label: string
  type?: string
}

/// A verb entry in prosemirror-verbs' structural contract — declared here
/// as our own type on purpose: the contract is plain data (id, label,
/// command, faces, chords), so a plugin declares verbs by exporting
/// objects, paying zero dependency on the registry — not even a type
/// import. Only hosts, which compose and project, depend on that package.
/// Extra properties are preserved by the registry, never refused.
/// An entry with `args` carries a command *factory* (give it the collected
/// args, it gives you the Command) and, since a factory can't be dry-run
/// without args, an `enabled` gate for its availability.
export interface SpreadsVerb {
  id: string
  label: string
  command: Command | ((args: Record<string, unknown>) => Command)
  short?: string
  read?: (state: EditorState) => unknown
  enabled?: (state: EditorState) => boolean
  keys?: string[]
  keywords?: string[]
  args?: SpreadsVerbArg[]
  group?: string
}

// Collectors hand back what they gathered — often strings from a prompt.
// A table dimension coerces to a positive integer or falls back.
const dimension = (value: unknown, fallback: number): number => {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/// The spreads verb set — the selection-driven public verbs as declarations
/// a verbs host composes (`composeVerbs(basicVerbs(schema), spreadsVerbs(schema), …)`).
/// A set guards its nouns: without our node types in the schema it yields
/// nothing. Every id, label, and glyph here is provisional — christening
/// cargo. No chords are declared — the grid's keys are a *policy*, not
/// chords: seat `{ name: "grid", bindings: gridKeys }` before your base
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
      args: [
        { name: "rows", label: "Rows" },
        { name: "cols", label: "Columns" },
      ],
      command: (args: Record<string, unknown>) =>
        insertTable(dimension(args.rows, 3), dimension(args.cols, 3), {
          headerRow: !!(types.head && types.header),
        }),
      // A factory can't dry-run; availability is the default insert's.
      enabled: (state: EditorState) => insertTable()(state),
      keywords: ["table", "grid", "spreadsheet"],
      group: "table",
    },
    {
      id: "table:add-row-before",
      label: "Add row before",
      short: "⊕↑",
      command: addRowBefore,
      keywords: ["row", "insert", "add", "above", "before"],
      group: "table",
    },
    {
      id: "table:add-row-after",
      label: "Add row after",
      short: "⊕↓",
      command: addRowAfter,
      keywords: ["row", "insert", "add", "below", "after"],
      group: "table",
    },
    {
      id: "table:add-column-before",
      label: "Add column before",
      short: "⊕←",
      command: addColumnBefore,
      keywords: ["column", "insert", "add", "left", "before"],
      group: "table",
    },
    {
      id: "table:add-column-after",
      label: "Add column after",
      short: "⊕→",
      command: addColumnAfter,
      keywords: ["column", "insert", "add", "right", "after"],
      group: "table",
    },
    {
      id: "table:delete-row",
      label: "Delete row",
      short: "⊖─",
      command: deleteRow,
      keywords: ["row", "delete", "remove"],
      group: "table",
    },
    {
      id: "table:delete-column",
      label: "Delete column",
      short: "⊖│",
      command: deleteColumn,
      keywords: ["column", "delete", "remove"],
      group: "table",
    },
    {
      id: "table:formula",
      label: "Formula",
      args: [{ name: "formula", label: "Formula" }],
      command: (args: Record<string, unknown>) => writeSelectedCell(String(args.formula ?? "")),
      // The formula-bar seed: the readback is the formula you stand on
      // (the link verb's href rhyme) — null on standing values and on
      // headers, so a collecting host prefills exactly the source you'd
      // edit, and a surface lights only on declared formulas.
      read: (state: EditorState) => {
        const sel = state.selection
        return sel instanceof NodeSelection && sel.node.type.spec.spreadsRole === "cell"
          ? ((sel.node.attrs.formula as string | null) ?? null)
          : null
      },
      enabled: (state: EditorState) => writeSelectedCell("")(state),
      keywords: ["formula", "function", "compute", "cell"],
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
    {
      id: "table:select",
      label: "Select table",
      command: selectEnclosingTable,
      // The whole-table selection is nameable state: lit exactly when the
      // Escape rung has been climbed.
      read: (state: EditorState) =>
        state.selection instanceof NodeSelection && state.selection.node.type.spec.spreadsRole === "table",
      keywords: ["table", "select", "escape"],
      group: "table",
    },
  ]
}
