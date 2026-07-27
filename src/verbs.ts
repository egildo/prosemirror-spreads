import type { Schema } from "prosemirror-model"
import type { Command, EditorState } from "prosemirror-state"
import { NodeSelection } from "prosemirror-state"
import {
  clearSelectedCells,
  demoteSelectedFormula,
  editSelectedCell,
  insertTable,
  selectEnclosingTable,
  writeSelectedAbbr,
  writeSelectedCell,
  writeSelectedColumnWidth,
} from "./commands"
import { canWriteCaption, selectedCaption, writeSelectedCaption } from "./caption"
import type { Region } from "./gridmap"
import {
  joinBodies,
  selectedColumnIsRowHeaders,
  selectedRowRegion,
  setRowRegion,
  splitBody,
  toggleRowHeaderColumn,
} from "./regions"
import { spreadsNodeTypes } from "./schema"
import { spreadsKey } from "./state"
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  firstColgroup,
  selectedCellContext,
} from "./structure"

/// One member of an enumerable domain — the registry's DomainMember shape,
/// declared locally like everything else here.
export interface SpreadsDomainMember {
  value: string
  label: string
  short?: string
  keys?: string[]
}

/// An argument a collecting host must gather before running an arg-verb.
/// The `type` vocabulary belongs to whoever collects; a `domain` makes the
/// verb expandable into per-member forms (the registry's `expand`). Between
/// them, `type` and `domain` are also what lets a host choose a *control*
/// rather than a modal ask — a domain is a select, a lone typed argument
/// with a readback is a field. Nothing here knows that; it is the shape
/// being honest, and a surface reading it.
export interface SpreadsVerbArg {
  name: string
  label: string
  type?: string
  domain?: SpreadsDomainMember[]
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
      // One verb over the {head, body, foot} domain — the blocktype rhyme
      // at the row scale. Hosts expand() it into three radio-lit forms; the
      // base form stays palette material (no short).
      id: "table:row-region",
      label: "Row region",
      args: [
        {
          name: "region",
          label: "Region",
          domain: [
            { value: "head", label: "Header rows", short: "⊤" },
            { value: "body", label: "Data rows", short: "≣" },
            { value: "foot", label: "Footer rows", short: "⊥" },
          ],
        },
      ],
      command: (args: Record<string, unknown>) => setRowRegion(args.region as Region),
      read: (state: EditorState) => selectedRowRegion(state),
      enabled: (state: EditorState) => !!selectedCellContext(state),
      keywords: ["row", "region", "thead", "tbody", "tfoot", "promote", "demote"],
      group: "table",
    },
    {
      id: "table:row-header-column",
      label: "Row headers",
      short: "◧",
      command: toggleRowHeaderColumn,
      read: selectedColumnIsRowHeaders,
      keywords: ["column", "header", "row", "scope"],
      group: "table",
    },
    {
      // The partition pair wears the structural family's ⊕/⊖ idiom over the
      // double rule a tbody boundary draws — provisional glyphs, like all of them.
      id: "table:split-body",
      label: "Split body",
      short: "⊕═",
      command: splitBody,
      keywords: ["body", "tbody", "split", "group", "partition"],
      group: "table",
    },
    {
      id: "table:join-bodies",
      label: "Join bodies",
      short: "⊖═",
      command: joinBodies,
      keywords: ["body", "tbody", "join", "merge", "group"],
      group: "table",
    },
    {
      // The table's own accessible name — the one node in the anatomy no
      // verb could reach. Table-scoped, so it answers from any cell (and
      // from the whole-table selection the Escape rung climbs to); blank
      // removes the node.
      id: "table:caption",
      label: "Caption",
      args: [{ name: "caption", label: "Caption", type: "text" }],
      command: (args: Record<string, unknown>) => writeSelectedCaption(String(args.caption ?? "")),
      read: (state: EditorState) => selectedCaption(state),
      enabled: canWriteCaption,
      keywords: ["caption", "title", "name", "table", "summary"],
      group: "table",
    },
    {
      // The naming register's twin: the readback is the reference name you
      // stand on (the resolver prefers abbr over the visible text), the
      // collector prefills from it, blank demotes.
      id: "table:abbr",
      label: "Reference name",
      args: [{ name: "abbr", label: "Reference name", type: "text" }],
      command: (args: Record<string, unknown>) => writeSelectedAbbr(String(args.abbr ?? "")),
      read: (state: EditorState) => {
        const sel = state.selection
        return sel instanceof NodeSelection && sel.node.type.spec.spreadsRole === "header"
          ? ((sel.node.attrs.abbr as string | null) ?? null)
          : null
      },
      enabled: (state: EditorState) => writeSelectedAbbr(null)(state),
      keywords: ["abbr", "abbreviation", "name", "reference", "header"],
      group: "table",
    },
    {
      // The presentation register's twin: readback the standing width of
      // the column you stand on, blank demotes the column to fluid.
      id: "table:column-width",
      label: "Column width",
      args: [{ name: "width", label: "px", type: "number" }],
      command: (args: Record<string, unknown>) => {
        const raw = String(args.width ?? "").trim()
        if (raw === "") return writeSelectedColumnWidth(null)
        const width = Number(raw)
        return Number.isFinite(width) && width > 0 ? writeSelectedColumnWidth(width) : () => false
      },
      read: (state: EditorState) => {
        const ctx = selectedCellContext(state)
        if (!ctx) return null
        const colgroup = firstColgroup(ctx.table)
        const col = colgroup && ctx.col < colgroup.node.childCount ? colgroup.node.child(ctx.col) : null
        return (col?.attrs.width as number | null) ?? null
      },
      enabled: (state: EditorState) => writeSelectedColumnWidth(1)(state),
      keywords: ["column", "width", "resize", "pixels"],
      group: "table",
    },
    {
      id: "table:formula",
      label: "Formula",
      short: "ƒ",
      args: [{ name: "formula", label: "Formula", type: "text" }],
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
      // Gated to data cells, matching the readback exactly. `th` has no
      // formula attribute, so a formula settled into a header degrades
      // silently to its own text — the verb must not offer what the
      // schema cannot hold. (Whether the *seam* should refuse a leading
      // `=` on a header, closing the same hole for the edit buffer, is
      // open — venue finding, 2026-07-27.)
      enabled: (state: EditorState) => {
        const sel = state.selection
        return sel instanceof NodeSelection && sel.node.type.spec.spreadsRole === "cell" && writeSelectedCell("")(state)
      },
      keywords: ["formula", "function", "compute", "cell"],
      group: "table",
    },
    {
      id: "table:demote-formula",
      label: "To value",
      short: "ƒ−",
      command: demoteSelectedFormula,
      keywords: ["formula", "value", "demote", "freeze"],
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
