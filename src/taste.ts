// The suggested taste — what we would call these things, if asked.
//
// [capabilities.ts](./capabilities.ts) ships what this plugin can do and says
// nothing about what to call it. That is the doctrine (plugins ship
// capabilities, hosts ship verbs and chrome), and taken alone it hands every
// host a bare register and a bill for eighteen names and an icon set.
//
// So the taste ships too — separately, as inert data keyed by id, which the
// host *seats* or ignores. The difference between this and the taste that used
// to ride on the entries is the whole difference the doctrine cares about:
//
//   - a host that wants it writes one line and gets a dressed strip;
//   - a host that disagrees overrides any key from its own layer, and wins,
//     because this is seated below the host's layers, not baked into the verb;
//   - `describe(id)` names this layer as the claimant, so the provenance of
//     every face on screen is answerable.
//
// Nothing here knows a surface exists. There is no `group` — a category name
// only means something against the host's own list of sections — no `manner`,
// no `room`, no chords: the keyboard is the host's court, and the grid's own
// keys travel as a policy (`gridKeys`), not as chords on these.
//
// Every name and word below is provisional — christening cargo, like the ids.
//
// The icon names are the softest suggestion here, and knowingly so: a name
// means nothing except against the host's own icon set, which is the very
// argument that kept `group` out of this file. They are offered because a name
// costs nothing to ignore and saves a host inventing eighteen of its own — but
// a host that resolves none of them still gets a working, readable strip,
// because a default rendering draws the words and ignores the names entirely.

/// What a host may seat for one id. All optional; a missing key falls through
/// to whatever the host's registry does by default (prosemirror-verbs derives
/// a label from the id, so an unseated register is still usable).
export interface SpreadsTasteEntry {
  /** The human name — menu, palette, tooltip, a field's tag. */
  label?: string
  /** The **name** of a picture — never a glyph. A character pressed into
   *  service as an icon is text pretending to be one, and it leaves an
   *  icon-only control with no accessible name. What the name draws is the
   *  host's stylesheet's business: an SVG mask, an icon font, a letter.
   *  Its absence is curation: no picture, no button. */
  icon?: string
  /** Extra search terms, for palette-grade consumers. */
  keywords?: string[]
}

/// Keyed by capability id — including the conjugated forms a host's `expand`
/// produces from `table:row-region`, which are ordinary entries with ordinary
/// ids and are dressed here like anything else.
///
/// Seating it, in a verbs host:
///
/// ```js
/// import { spreadsTaste } from "prosemirror-spreads"
/// const suggested = { name: "spreads", attrs: (verb) => spreadsTaste[verb.id] ?? {} }
/// applyAttrs(register(schema), [suggested, ...yourLayers])
/// ```
export const spreadsTaste: Record<string, SpreadsTasteEntry> = {
  "table:insert": { label: "Insert table", icon: "table-insert", keywords: ["table", "grid", "spreadsheet"] },

  // The structural family names itself in one idiom: subject, verb, and where.
  "table:add-row-before": { label: "Add row before", icon: "row-add-before", keywords: ["row", "insert", "add", "above", "before"] },
  "table:add-row-after": { label: "Add row after", icon: "row-add-after", keywords: ["row", "insert", "add", "below", "after"] },
  "table:add-column-before": { label: "Add column before", icon: "column-add-before", keywords: ["column", "insert", "add", "left", "before"] },
  "table:add-column-after": { label: "Add column after", icon: "column-add-after", keywords: ["column", "insert", "add", "right", "after"] },
  "table:delete-row": { label: "Delete row", icon: "row-delete", keywords: ["row", "delete", "remove"] },
  "table:delete-column": { label: "Delete column", icon: "column-delete", keywords: ["column", "delete", "remove"] },

  // The region capability and its three conjugated forms. The base carries no
  // picture — as a select it wears its label; as a palette entry it wears it too.
  "table:row-region": { label: "Row region", keywords: ["row", "region", "thead", "tbody", "tfoot", "promote", "demote"] },
  "table:row-region:head": { label: "Header rows", icon: "region-head" },
  "table:row-region:body": { label: "Data rows", icon: "region-body" },
  "table:row-region:foot": { label: "Footer rows", icon: "region-foot" },

  "table:row-header-column": { label: "Row headers", icon: "row-headers", keywords: ["column", "header", "row", "scope"] },
  // The partition pair: what a tbody boundary's double rule is doing, named.
  "table:split-body": { label: "Split body", icon: "body-split", keywords: ["body", "tbody", "split", "group", "partition"] },
  "table:join-bodies": { label: "Join bodies", icon: "body-join", keywords: ["body", "tbody", "join", "merge", "group"] },

  // The three value capabilities. No pictures: each is a field, and a field's
  // face is a word. `abbr` gets the HTML attribute's own name — a host whose
  // users say "reference name" is expected to override exactly this.
  "table:caption": { label: "Caption", keywords: ["caption", "title", "name", "table", "summary"] },
  "table:abbr": { label: "Abbreviation", keywords: ["abbr", "abbreviation", "name", "reference", "header"] },
  "table:column-width": { label: "Column width", keywords: ["column", "width", "resize", "pixels"] },

  "table:formula": { label: "Formula", keywords: ["formula", "function", "compute", "cell"] },
  "table:demote-formula": { label: "To value", icon: "formula-demote", keywords: ["formula", "value", "demote", "freeze"] },

  // The keyboard rungs. Named, so a palette can reach them; pictureless, because
  // Escape, Enter and Delete are how anyone actually reaches them.
  "table:edit": { label: "Edit cell", keywords: ["cell", "edit", "formula"] },
  "table:clear": { label: "Clear cell", keywords: ["cell", "clear", "empty"] },
  "table:select": { label: "Select table", keywords: ["table", "select", "escape"] },
}
