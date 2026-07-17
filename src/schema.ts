import type { Node, NodeSpec, NodeType, Schema } from "prosemirror-model"

/// The structural role a node type plays inside a spreads table. The plugin
/// locates node types by role, never by name, so consumers can rename the
/// types when appending them to their own schema.
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
/// bare-tbody table is first-class. Append the result to your schema's nodes.
export function spreadsNodes(_options: SpreadsNodesOptions = {}): Record<string, NodeSpec> {
  return {
    table: {
      content: "table_caption? table_colgroup* table_head? table_body+ table_foot?",
      group: "block",
      isolating: true,
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
      spreadsRole: "col",
      parseDOM: [{ tag: "col" }],
      toDOM: () => ["col"],
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
