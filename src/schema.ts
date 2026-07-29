import type { Node, NodeSpec, NodeType, Schema } from "prosemirror-model"

/// The structural role a node type plays inside a spreads table. Roles are
/// internal discipline — plugin code locates types through them, never by
/// dispatching on names — and a discoverability hook for third-party
/// tooling. They are not a renaming feature: the node names below are part
/// of the package contract.
export type SpreadsRole =
  | "table"
  | "caption"
  | "colgroup"
  | "col"
  | "head"
  | "body"
  | "foot"
  | "row"
  | "cell"
  | "header"

/// Options accepted by [`spreadsNodes`](#spreadsNodes). Empty for now; the
/// factory posture is the point — consumers have schemas we've never seen.
export interface SpreadsNodesOptions {}

// Width from `<col style="width:96px">` — our own emission — with the
// legacy `width` attribute accepted on parse too (C14's ceiling posture:
// the wild web still writes it). Non-pixel declarations (%, em) are not
// representable and parse as null — the column stays fluid.
function parseColWidth(dom: HTMLElement): number | null {
  const style = dom.style?.width
  if (style && /^[\d.]+px$/.test(style)) return parseFloat(style)
  const legacy = dom.getAttribute("width")
  if (legacy && /^[\d.]+$/.test(legacy)) return parseFloat(legacy)
  return null
}

const cellSpec = (role: "cell" | "header"): NodeSpec => ({
  content: "text*",
  marks: "",
  atom: true,
  isolating: true,
  selectable: true,
  spreadsRole: role,
})

/// Node specs for the full table anatomy: `caption? colgroup* thead? tbody+ tfoot?`,
/// rows of `td`/`th` cells. Everything beyond `tbody+` is optional — the
/// bare-tbody table is first-class. Append the result to your schema's
/// nodes as-is: the node names are part of the contract (the incumbent's
/// decade-proven posture), not parameters. Deliberate consequence: they
/// collide with prosemirror-tables' names — one table system per schema,
/// the seat is taken.
export function spreadsNodes(_options: SpreadsNodesOptions = {}): Record<string, NodeSpec> {
  return {
    table: {
      content: "table_caption? table_colgroup* table_head? table_body+ table_foot?",
      group: "block",
      isolating: true,
      // The black box (C17), said to the schema. A generic host derives verbs
      // from nouns, and the grammar happily says a `td` may go in a `tr` — so
      // an insert-cell verb really did put a third cell into a two-column row,
      // past every structural command in this package (found in the venue,
      // 2026-07-29). `sealed` states the cause once: everything reachable only
      // through this table is ours to create, and our own commands are how.
      // `insert` stands beside it because the table itself is reachable from
      // the doc and so is not interior to itself — we declare that one.
      //
      // Not to be read as a cousin of `isolating` two lines up: that governs
      // whether selection and deletion cross a boundary, and says nothing
      // about who may create what.
      authoring: { sealed: true, insert: false },
      spreadsRole: "table",
      parseDOM: [{ tag: "table" }],
      toDOM: () => ["table", 0],
    },
    table_caption: {
      content: "inline*",
      isolating: true,
      spreadsRole: "caption",
      parseDOM: [{ tag: "caption" }],
      toDOM: () => ["caption", 0],
    },
    table_colgroup: {
      content: "table_col*",
      spreadsRole: "colgroup",
      parseDOM: [{ tag: "colgroup" }],
      toDOM: () => ["colgroup", 0],
    },
    table_col: {
      attrs: {
        // The column's declared width in CSS pixels — document data, the
        // presentation register's seat in the document (the width undoes;
        // ruling in architecture §7). Null: no declaration, fluid column.
        width: { default: null },
      },
      spreadsRole: "col",
      parseDOM: [
        {
          tag: "col",
          getAttrs: (dom: HTMLElement) => ({ width: parseColWidth(dom) }),
        },
      ],
      toDOM: (node: Node) => {
        const width = node.attrs.width as number | null
        return width != null ? ["col", { style: `width:${width}px` }] : ["col"]
      },
    },
    table_head: {
      content: "table_row+",
      isolating: true,
      spreadsRole: "head",
      parseDOM: [{ tag: "thead" }],
      toDOM: () => ["thead", 0],
    },
    table_body: {
      content: "table_row+",
      isolating: true,
      spreadsRole: "body",
      parseDOM: [{ tag: "tbody" }],
      toDOM: () => ["tbody", 0],
    },
    table_foot: {
      content: "table_row+",
      isolating: true,
      spreadsRole: "foot",
      parseDOM: [{ tag: "tfoot" }],
      toDOM: () => ["tfoot", 0],
    },
    table_row: {
      // Mixed rows: a scope="row" th lives inside body rows.
      content: "(table_cell | table_header)+",
      spreadsRole: "row",
      parseDOM: [{ tag: "tr" }],
      toDOM: () => ["tr", 0],
    },
    table_cell: {
      ...cellSpec("cell"),
      attrs: {
        // Automation in attributes (P3): the formula is provenance, the
        // content is the computed value. Standing cells stay pristine.
        formula: { default: null },
      },
      parseDOM: [
        {
          tag: "td",
          getAttrs: (dom: HTMLElement) => ({ formula: dom.getAttribute("data-formula") }),
        },
      ],
      toDOM: (node: Node) => {
        const formula = node.attrs.formula as string | null
        return formula ? ["td", { "data-formula": formula }, 0] : ["td", 0]
      },
    },
    table_header: {
      ...cellSpec("header"),
      attrs: {
        scope: { default: null },
        abbr: { default: null },
      },
      parseDOM: [
        {
          tag: "th",
          getAttrs: (dom: HTMLElement) => ({
            scope: dom.getAttribute("scope"),
            abbr: dom.getAttribute("abbr"),
          }),
        },
      ],
      toDOM: (node: Node) => {
        const attrs: Record<string, string> = {}
        if (node.attrs.scope) attrs.scope = node.attrs.scope
        if (node.attrs.abbr) attrs.abbr = node.attrs.abbr
        return ["th", attrs, 0]
      },
    },
  }
}

/// Look up a schema's spreads node types by role. Cached on the schema.
export function spreadsNodeTypes(schema: Schema): Partial<Record<SpreadsRole, NodeType>> {
  let cached = schema.cached.spreadsNodeTypes as Partial<Record<SpreadsRole, NodeType>> | undefined
  if (!cached) {
    cached = {}
    for (const name in schema.nodes) {
      const type = schema.nodes[name]
      const role = type?.spec.spreadsRole as SpreadsRole | undefined
      if (type && role) cached[role] = type
    }
    schema.cached.spreadsNodeTypes = cached
  }
  return cached
}

/// Whether a node type is a spreads cell (`td` or `th`).
export function isCellType(type: NodeType): boolean {
  const role = type.spec.spreadsRole
  return role === "cell" || role === "header"
}
