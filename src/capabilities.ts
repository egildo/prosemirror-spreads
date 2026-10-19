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

/// One member of an enumerable domain: the value, and nothing else. What the
/// members are called and which glyph each wears is the host's — see
/// [taste.ts](./taste.ts) for the set this package suggests.
export interface SpreadsDomainMember {
  value: string
}

/// An argument a collecting host must gather before running an arg-capability.
/// The `type` vocabulary belongs to whoever collects; a `domain` makes the
/// capability expandable into per-member forms. Between them, `type` and
/// `domain` are also what lets a host choose a *control* rather than a modal
/// ask — a domain is a select, a lone typed argument with a readback is a
/// field. Nothing here knows that; it is the shape being honest, and a surface
/// reading it. No label: what to call the box is not ours to say.
export interface SpreadsArg {
  name: string
  type?: string
  domain?: SpreadsDomainMember[]
}

/// **What this plugin can do, and what it can tell you.** Nothing else — no
/// name, no glyph, no chord, no category. This plugin does not know it is
/// being called a verb and does not know a surface exists (Egildo's ruling,
/// 2026-07-28, amending V12: plugins ship *capabilities*, hosts ship verbs and
/// chrome). The cut is not arbitrary: only we can know that a formula lives on
/// a `td` and not a `th`; only the host can know what to call it, where to put
/// it, or which chord answers to it.
///
/// Declared here as our own type on purpose: the contract is plain data, so a
/// plugin declares capabilities by exporting objects, paying zero dependency
/// on prosemirror-verbs — not even a type import. Only hosts, which compose
/// and project, depend on that package. An entry with `args` carries a command
/// *factory* (give it the collected args, it gives you the Command) and, since
/// a factory can't be dry-run without args, an `enabled` gate.
export interface SpreadsCapability {
  id: string
  command: Command | ((args: Record<string, unknown>) => Command)
  read?: (state: EditorState) => unknown
  enabled?: (state: EditorState) => boolean
  args?: SpreadsArg[]
}

// Collectors hand back what they gathered — often strings from a prompt.
// A table dimension coerces to a positive integer or falls back.
const dimension = (value: unknown, fallback: number): number => {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/// The spreads capability set — the selection-driven public doings, as
/// declarations a verbs host composes
/// (`compose([basicVerbs(schema), fromCommands(spreadsCapabilities(schema)), …])`).
/// A set guards its nouns: without our node types in the schema it yields
/// nothing. Every id here is provisional — christening cargo. No chords are
/// declared: the grid's keys are a *policy*, not chords — seat
/// `{ name: "grid", bindings: gridKeys }` before your base keymap, and
/// remember the split: verbs governs the keyboard outside the black box;
/// inside it the box routes its own keys.
export function spreadsCapabilities(schema: Schema): SpreadsCapability[] {
  const types = spreadsNodeTypes(schema)
  if (!types.table || !types.body || !types.row || !types.cell) return []
  return [
    {
      id: "table:insert",
      args: [{ name: "rows" }, { name: "cols" }],
      command: (args: Record<string, unknown>) =>
        insertTable(dimension(args.rows, 3), dimension(args.cols, 3), {
          headerRow: !!(types.head && types.header),
        }),
      // A factory can't dry-run; availability is the default insert's.
      enabled: (state: EditorState) => insertTable()(state),
    },
    { id: "table:add-row-before", command: addRowBefore },
    { id: "table:add-row-after", command: addRowAfter },
    { id: "table:add-column-before", command: addColumnBefore },
    { id: "table:add-column-after", command: addColumnAfter },
    { id: "table:delete-row", command: deleteRow },
    { id: "table:delete-column", command: deleteColumn },
    {
      // One capability over the {head, body, foot} domain — the blocktype
      // rhyme at the row scale. Hosts expand() it into three conjugated forms
      // or render it as a select; both are honest renderings of one declaration.
      id: "table:row-region",
      args: [
        {
          name: "region",
          domain: [{ value: "head" }, { value: "body" }, { value: "foot" }],
        },
      ],
      command: (args: Record<string, unknown>) => setRowRegion(args.region as Region),
      read: (state: EditorState) => selectedRowRegion(state),
      enabled: (state: EditorState) => !!selectedCellContext(state),
    },
    {
      id: "table:row-header-column",
      command: toggleRowHeaderColumn,
      read: selectedColumnIsRowHeaders,
    },
    { id: "table:split-body", command: splitBody },
    { id: "table:join-bodies", command: joinBodies },
    {
      // The table's own accessible name — the one node in the anatomy no
      // capability could reach. Table-scoped, so it answers from any cell (and
      // from the whole-table selection the Escape rung climbs to); blank
      // removes the node.
      id: "table:caption",
      args: [{ name: "caption", type: "text" }],
      command: (args: Record<string, unknown>) => writeSelectedCaption(String(args.caption ?? "")),
      read: (state: EditorState) => selectedCaption(state),
      enabled: canWriteCaption,
    },
    {
      // The naming register's twin: the readback is the reference name you
      // stand on (the resolver prefers abbr over the visible text), the
      // collector prefills from it, blank demotes.
      id: "table:abbr",
      args: [{ name: "abbr", type: "text" }],
      command: (args: Record<string, unknown>) => writeSelectedAbbr(String(args.abbr ?? "")),
      read: (state: EditorState) => {
        const sel = state.selection
        return sel instanceof NodeSelection && sel.node.type.spec.spreadsRole === "header"
          ? ((sel.node.attrs.abbr as string | null) ?? null)
          : null
      },
      enabled: (state: EditorState) => writeSelectedAbbr(null)(state),
    },
    {
      // The presentation register's twin: readback the standing width of
      // the column you stand on, blank demotes the column to fluid.
      id: "table:column-width",
      args: [{ name: "width", type: "number" }],
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
    },
    {
      id: "table:formula",
      args: [{ name: "formula", type: "text" }],
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
      // Gated to data cells, matching the readback exactly: `th` has no
      // formula attribute, so this must not offer what the schema cannot
      // hold. The seam refuses the same thing (Egildo's ruling, 2026-07-27),
      // which makes this gate redundant as a safety and load-bearing as
      // *honesty* — the field greys out instead of accepting a value it
      // would then reject.
      enabled: (state: EditorState) => {
        const sel = state.selection
        return sel instanceof NodeSelection && sel.node.type.spec.spreadsRole === "cell" && writeSelectedCell("")(state)
      },
    },
    { id: "table:demote-formula", command: demoteSelectedFormula },
    {
      id: "table:edit",
      command: editSelectedCell(),
      // The readback reads plugin state (the edit seam): is a buffer open?
      read: (state: EditorState) => !!spreadsKey.getState(state)?.editing,
    },
    { id: "table:clear", command: clearSelectedCells },
    {
      id: "table:select",
      command: selectEnclosingTable,
      // The whole-table selection is nameable state: lit exactly when the
      // Escape rung has been climbed.
      read: (state: EditorState) =>
        state.selection instanceof NodeSelection && state.selection.node.type.spec.spreadsRole === "table",
    },
  ]
}
