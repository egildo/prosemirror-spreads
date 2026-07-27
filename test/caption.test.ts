// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { Schema, DOMSerializer } from "prosemirror-model"
import type { Node } from "prosemirror-model"
import { EditorState, NodeSelection } from "prosemirror-state"
import type { Command } from "prosemirror-state"
import { schema as base } from "prosemirror-schema-basic"
import { history, undo } from "prosemirror-history"
import {
  spreads,
  spreadsNodes,
  spreadsNodeTypes,
  isCellType,
  canWriteCaption,
  selectedCaption,
  selectedTable,
  writeSelectedCaption,
  startEditing,
  setColumnWidths,
} from "prosemirror-spreads"

// The caption — the one node in the anatomy no command could reach until
// now. Pins: it resolves from the table you stand *in* (a cell, or the
// whole-table rung), blank removes the node, the anatomy's order holds
// against the colgroup, and no undo step is ever spent on a no-op.

const schema = new Schema({
  nodes: base.spec.nodes.append(spreadsNodes()),
  marks: base.spec.marks,
})

const types = spreadsNodeTypes(schema)

function apply(state: EditorState, command: Command): EditorState {
  let next = state
  expect(command(state, (tr) => (next = state.apply(tr)))).toBe(true)
  return next
}

// A 2×2 table with a header row, no caption.
function table(): EditorState {
  const cell = (text: string) => types.cell!.create(null, text ? schema.text(text) : null)
  const header = (text: string) => types.header!.create({ scope: "col" }, schema.text(text))
  const doc = schema.node("doc", null, [
    types.table!.create(null, [
      types.head!.create(null, [types.row!.create(null, [header("Voce"), header("Prezzo")])]),
      types.body!.create(null, [types.row!.create(null, [cell("Ravioli"), cell("12")])]),
    ]),
  ])
  return EditorState.create({ schema, doc, plugins: [history(), ...spreads()] })
}

function firstCell(state: EditorState): number {
  let pos = -1
  state.doc.descendants((node, at) => {
    if (pos < 0 && node.type.name === "table_cell" && isCellType(node.type)) pos = at
    return true
  })
  return pos
}

function onCell(state = table()): EditorState {
  return state.apply(state.tr.setSelection(NodeSelection.create(state.doc, firstCell(state))))
}

function html(doc: Node): string {
  const out = document.createElement("div")
  out.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(doc.content))
  return out.innerHTML
}

describe("the caption", () => {
  it("resolves the table from a cell, and refuses outside one", () => {
    const state = onCell()
    expect(selectedTable(state)!.tablePos).toBe(0)
    expect(canWriteCaption(state)).toBe(true)
    const blank = EditorState.create({ schema, plugins: [...spreads()] })
    expect(selectedTable(blank)).toBeNull()
    expect(canWriteCaption(blank)).toBe(false)
    expect(writeSelectedCaption("x")(blank)).toBe(false)
  })

  it("resolves from the whole-table selection too — the Escape rung's own seat", () => {
    let state = table()
    state = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, 0)))
    expect(selectedTable(state)!.table.type.name).toBe("table")
    expect(canWriteCaption(state)).toBe(true)
    const captioned = apply(state, writeSelectedCaption("Menu"))
    expect(selectedCaption(captioned)).toBe("Menu")
  })

  it("writes a caption at the head of the anatomy, and reads it back", () => {
    const state = onCell()
    expect(selectedCaption(state)).toBeNull()
    const captioned = apply(state, writeSelectedCaption("Listino"))
    expect(captioned.doc.firstChild!.firstChild!.type.name).toBe("table_caption")
    expect(selectedCaption(captioned)).toBe("Listino")
    expect(html(captioned.doc)).toContain("<caption>Listino</caption>")
  })

  it("keeps the cell you stood on — the selection rides the mapping", () => {
    const state = onCell()
    const before = state.doc.nodeAt(state.selection.from)!.textContent
    const captioned = apply(state, writeSelectedCaption("Listino"))
    expect(captioned.selection).toBeInstanceOf(NodeSelection)
    expect(captioned.doc.nodeAt(captioned.selection.from)!.textContent).toBe(before)
  })

  it("replaces a standing caption in place", () => {
    const first = apply(onCell(), writeSelectedCaption("Uno"))
    const second = apply(first, writeSelectedCaption("Due"))
    expect(selectedCaption(second)).toBe("Due")
    expect(second.doc.firstChild!.childCount).toBe(3) // caption, head, body — not four
  })

  it("blank removes the node: an empty declaration is no declaration", () => {
    const captioned = apply(onCell(), writeSelectedCaption("Listino"))
    const cleared = apply(captioned, writeSelectedCaption(""))
    expect(selectedCaption(cleared)).toBeNull()
    expect(cleared.doc.firstChild!.firstChild!.type.name).toBe("table_head")
    expect(html(cleared.doc)).not.toContain("caption")
  })

  it("spends no undo step on a no-op — nothing to remove, or the text already standing", () => {
    const state = onCell()
    expect(writeSelectedCaption("")(state)).toBe(false)
    expect(writeSelectedCaption(null)(state)).toBe(false)
    const captioned = apply(state, writeSelectedCaption("Listino"))
    expect(writeSelectedCaption("Listino")(captioned)).toBe(false)
    expect(writeSelectedCaption("  Listino  ")(captioned)).toBe(false) // trimmed first
  })

  it("is one undo step", () => {
    const state = onCell()
    const captioned = apply(state, writeSelectedCaption("Listino"))
    const back = apply(captioned, undo)
    expect(selectedCaption(back)).toBeNull()
    expect(back.doc.firstChild!.childCount).toBe(2)
  })

  it("holds the anatomy's order against a colgroup, whichever lands first", () => {
    // Caption first, then a width declaration.
    const a = apply(apply(onCell(), writeSelectedCaption("Listino")), setColumnWidths(0, [96]))
    expect([...Array(a.doc.firstChild!.childCount)].map((_, i) => a.doc.firstChild!.child(i).type.name)).toEqual([
      "table_caption",
      "table_colgroup",
      "table_head",
      "table_body",
    ])
    // The other order lands the same anatomy.
    const b = apply(apply(onCell(), setColumnWidths(0, [96])), writeSelectedCaption("Listino"))
    expect(html(b.doc).indexOf("<caption>")).toBeLessThan(html(b.doc).indexOf("<colgroup>"))
  })

  it("holds still under a live buffer — the structure family's rule", () => {
    const state = onCell()
    const editing = apply(state, startEditing(state.selection.from))
    expect(canWriteCaption(editing)).toBe(false)
    expect(writeSelectedCaption("Listino")(editing)).toBe(false)
  })
})
