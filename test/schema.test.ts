// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { DOMParser, DOMSerializer, Schema } from "prosemirror-model"
import { schema as base } from "prosemirror-schema-basic"
import { spreadsNodes, spreadsNodeTypes } from "prosemirror-spreads"

const schema = new Schema({
  nodes: base.spec.nodes.append(spreadsNodes()),
  marks: base.spec.marks,
})

function parseHTML(html: string) {
  const container = document.createElement("div")
  container.innerHTML = html
  return DOMParser.fromSchema(schema).parse(container)
}

function serialize(doc: ReturnType<typeof parseHTML>) {
  const container = document.createElement("div")
  container.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(doc.content))
  return container.innerHTML
}

describe("spreadsNodes", () => {
  it("appends to a host schema and is found by role, not name", () => {
    const types = spreadsNodeTypes(schema)
    for (const role of ["table", "caption", "colgroup", "col", "head", "body", "foot", "row", "cell", "header"])
      expect(types[role as keyof typeof types], role).toBeDefined()
  })

  it("round-trips a bare-tbody table — the first-class floor", () => {
    const html = "<table><tbody><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></tbody></table>"
    expect(serialize(parseHTML(html))).toBe(html)
  })

  it("round-trips the full anatomy with scope and abbr intact", () => {
    const html =
      "<table><caption>Vendite</caption><thead><tr>" +
      '<th scope="col">Trimestre</th><th scope="col" abbr="Prezzo">Prezzo unitario</th>' +
      "</tr></thead><tbody><tr>" +
      '<th scope="row">Q1</th><td>1234</td>' +
      "</tr></tbody><tfoot><tr>" +
      '<th scope="row">Totale</th><td>1234</td>' +
      "</tr></tfoot></table>"
    expect(serialize(parseHTML(html))).toBe(html)
  })

  it("emits zero plugin fingerprints on plain cells", () => {
    const html = "<table><tbody><tr><td>solo</td></tr></tbody></table>"
    const out = serialize(parseHTML(html))
    expect(out).not.toMatch(/class=|style=|data-/)
  })

  it("round-trips column widths on col — the one presentational fact in output", () => {
    // jsdom normalizes the style attribute's spacing on serialization, so
    // the pin is attribute-value equality across a full round trip, plus
    // the emission wearing the width.
    const html =
      '<table><colgroup><col style="width:96px"><col></colgroup>' +
      "<tbody><tr><td>a</td><td>b</td></tr></tbody></table>"
    const once = serialize(parseHTML(html))
    expect(once).toMatch(/<col style="width:\s*96px;?">/)
    expect(serialize(parseHTML(once))).toBe(once)
  })

  it("accepts the legacy width attribute on parse, emits the style form", () => {
    const doc = parseHTML('<table><colgroup><col width="120"></colgroup><tbody><tr><td>a</td></tr></tbody></table>')
    expect(serialize(doc)).toMatch(/<col style="width:\s*120px;?">/)
  })

  it("a non-pixel width declaration parses as null — the column stays fluid", () => {
    const doc = parseHTML('<table><colgroup><col style="width:50%"></colgroup><tbody><tr><td>a</td></tr></tbody></table>')
    expect(serialize(doc)).toContain("<col></colgroup>")
  })
})
