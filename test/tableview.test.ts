// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { Schema, DOMSerializer } from "prosemirror-model"
import { EditorState, NodeSelection } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { schema as base } from "prosemirror-schema-basic"
import { spreads, spreadsNodes, spreadsNodeTypes, startEditing } from "prosemirror-spreads"

// C17's headless dividend: with the box owning its DOM, the renderer's
// keyed-by-node-identity diff is testable in jsdom — §6 is no longer
// entirely browser-bound. Pins pressed here: DOM reuse across unrelated
// changes (the buffer's survival premise), the ARIA grid costume on the
// working DOM, and pristine emission from the doc.

const schema = new Schema({
  nodes: base.spec.nodes.append(spreadsNodes()),
  marks: base.spec.marks,
})

function makeView() {
  const types = spreadsNodeTypes(schema)
  const cell = (text: string) => types.cell!.create(null, text ? schema.text(text) : null)
  const rows = [
    types.row!.create(null, [cell("a"), cell("b")]),
    types.row!.create(null, [cell("c"), cell("d")]),
  ]
  const doc = schema.node("doc", null, [types.table!.create(null, [types.body!.create(null, rows)])])
  const state = EditorState.create({ schema, doc, plugins: [...spreads()] })
  const view = new EditorView(document.createElement("div"), { state })
  return view
}

describe("the black box (C17)", () => {
  it("renders the working grid with the ARIA pattern; emission stays pristine", () => {
    const view = makeView()
    const table = view.dom.querySelector("table")!
    expect(table.getAttribute("role")).toBe("grid")
    expect(table.querySelector("tbody")!.getAttribute("role")).toBe("rowgroup")
    expect(table.querySelector("tr")!.getAttribute("role")).toBe("row")
    expect(table.querySelector("td")!.getAttribute("role")).toBe("gridcell")
    expect(table.querySelector("[contenteditable]")).toBeNull()
    const out = document.createElement("div")
    out.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(view.state.doc.content))
    expect(out.innerHTML).toBe(
      "<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>",
    )
    view.destroy()
  })

  it("keyed diff: an unrelated change reuses the untouched cells' DOM", () => {
    const view = makeView()
    const before = [...view.dom.querySelectorAll("td")]
    // change cell "d" (last); cells a, b, c must keep their elements
    const dPos = (() => {
      let pos = -1
      view.state.doc.descendants((n, p) => {
        if (n.textContent === "d" && n.type.name === "table_cell") pos = p
        return true
      })
      return pos
    })()
    view.dispatch(view.state.tr.insertText("!", dPos + 2, dPos + 2))
    const after = [...view.dom.querySelectorAll("td")]
    expect(after[0]).toBe(before[0])
    expect(after[1]).toBe(before[1])
    expect(after[2]).toBe(before[2])
    expect(after[3]).toBe(before[3]) // same cell element, re-rendered in place
    expect(after[3]!.textContent).toBe("d!")
    view.destroy()
  })

  it("an open buffer survives a change elsewhere — same input element", () => {
    const view = makeView()
    const firstCell = (() => {
      let pos = -1
      view.state.doc.descendants((n, p) => {
        if (pos < 0 && n.type.name === "table_cell") pos = p
        return true
      })
      return pos
    })()
    startEditing(firstCell, "seed")(view.state, view.dispatch)
    const input = view.dom.querySelector("[data-editing] input") as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.value).toBe("seed")
    input.value = "typed by hand"
    // remote change to the LAST cell + structural insert before the table
    let lastCell = -1
    view.state.doc.descendants((n, p) => {
      if (n.type.name === "table_cell") lastCell = p
      return true
    })
    view.dispatch(view.state.tr.insertText("x", lastCell + 1, lastCell + 1))
    view.dispatch(view.state.tr.insert(0, schema.nodes.paragraph!.createAndFill()!))
    const inputAfter = view.dom.querySelector("[data-editing] input") as HTMLInputElement
    expect(inputAfter).toBe(input)
    expect(inputAfter.value).toBe("typed by hand")
    view.destroy()
  })

  it("an entry-mode buffer settles on ArrowDown and moves; an edit-mode buffer keeps its caret", () => {
    const view = makeView()
    let firstCell = -1
    view.state.doc.descendants((n, p) => {
      if (firstCell < 0 && n.type.name === "table_cell") firstCell = p
      return true
    })
    // Seeded buffer = entry mode (type-to-replace): ArrowDown settles.
    startEditing(firstCell, "4")(view.state, view.dispatch)
    const input = view.dom.querySelector("[data-editing] input") as HTMLInputElement
    input.value = "42"
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }))
    expect(view.dom.querySelector("[data-editing]")).toBeNull()
    const sel = view.state.selection
    expect(view.state.doc.nodeAt(sel.from)!.textContent).toBe("c") // moved down a row
    // Unseeded buffer = edit mode: the arrow stays the input's own.
    startEditing(sel.from)(view.state, view.dispatch)
    const editInput = view.dom.querySelector("[data-editing] input") as HTMLInputElement
    editInput.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }))
    expect(view.dom.querySelector("[data-editing] input")).toBe(editInput)
    view.destroy()
  })

  it("NodeSelection on a cell wears data-selected and the roving tabindex", () => {
    const view = makeView()
    let firstCell = -1
    view.state.doc.descendants((n, p) => {
      if (firstCell < 0 && n.type.name === "table_cell") firstCell = p
      return true
    })
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, firstCell)))
    const tds = [...view.dom.querySelectorAll("td")]
    expect(tds[0]!.hasAttribute("data-selected")).toBe(true)
    expect(tds[0]!.tabIndex).toBe(0)
    expect(tds[1]!.tabIndex).toBe(-1)
    view.destroy()
  })
})
