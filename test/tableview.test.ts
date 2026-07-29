// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { Schema, DOMSerializer } from "prosemirror-model"
import { EditorState, NodeSelection } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { schema as base } from "prosemirror-schema-basic"
import { spreads, spreadsNodes, spreadsNodeTypes, startEditing, stopEditing } from "prosemirror-spreads"

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

  it("while a buffer is open the box claims every key — stopEvent, not stopPropagation", () => {
    // The regression that ate the second character of every typed value
    // (Egildo's hands, 2026-07-29). The buffer stopped propagation of its
    // keys, which stops DOM listeners — but ProseMirror decides whether an
    // event inside a node view is its business by asking stopEvent, and that
    // was still answering "keys are yours". The editor's own input machinery
    // then replaced the node-selected cell with the keystroke: "12" landed as
    // "2", the cell node deleted under the open buffer.
    const view = makeView()
    let tablePos = -1
    let tableNode: ReturnType<typeof view.state.doc.nodeAt> = null
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === "table") {
        tablePos = pos
        tableNode = node
      }
      return false
    })
    const nodeViews = view.someProp("nodeViews") as Record<string, any>
    const box = nodeViews.table!(tableNode!, view, () => tablePos, [])
    const key = new KeyboardEvent("keydown", { key: "2" })

    // Non-key events are always the box's — unchanged.
    expect(box.stopEvent(new Event("beforeinput"))).toBe(true)
    // Idle, an unclaimed key belongs to the editor's courts — the reflection
    // round's ruling, which this fix must not undo (undo inside the grid).
    expect(box.stopEvent(key)).toBe(false)

    let firstCell = -1
    view.state.doc.descendants((n, p) => {
      if (firstCell < 0 && n.type.name === "table_cell") firstCell = p
      return true
    })
    startEditing(firstCell, "1")(view.state, view.dispatch)
    // Editing: every key is the buffer's, and this is the only place the
    // editor asks.
    expect(box.stopEvent(key)).toBe(true)

    stopEditing(view.state, view.dispatch)
    expect(box.stopEvent(key)).toBe(false) // and the courts get them back
    box.destroy()
    view.destroy()
  })

  it("a blur that hands focus to someone still settles — §5's law, untouched", () => {
    const view = makeView()
    document.body.appendChild(view.dom.parentElement ?? view.dom)
    let firstCell = -1
    view.state.doc.descendants((n, p) => {
      if (firstCell < 0 && n.type.name === "table_cell") firstCell = p
      return true
    })
    startEditing(firstCell, "42")(view.state, view.dispatch)
    const input = view.dom.querySelector("[data-editing] input") as HTMLInputElement
    input.value = "42"
    // Someone on the other side: a real departure, and it commits as it always has.
    const elsewhere = document.createElement("button")
    document.body.appendChild(elsewhere)
    input.dispatchEvent(new FocusEvent("blur", { relatedTarget: elsewhere }))
    expect(view.dom.querySelector("[data-editing]")).toBeNull()
    expect(view.state.doc.nodeAt(firstCell)!.textContent).toBe("42")
    elsewhere.remove()
    view.destroy()
  })

  it("a blur nobody took does not commit — the DOM moved, not the user", () => {
    // Chrome that resizes or hides while you type blurs the buffer with no one
    // on the other side. Committing there ate the first character: typing "12"
    // settled "1" and re-seeded with "2" (Egildo's hands, 2026-07-28). No
    // browser tool reaches this path — CDP typing fires no keydown — so the
    // regression is pinned here or nowhere.
    const view = makeView()
    document.body.appendChild(view.dom.parentElement ?? view.dom)
    let firstCell = -1
    view.state.doc.descendants((n, p) => {
      if (firstCell < 0 && n.type.name === "table_cell") firstCell = p
      return true
    })
    startEditing(firstCell, "1")(view.state, view.dispatch)
    const input = view.dom.querySelector("[data-editing] input") as HTMLInputElement
    input.value = "1"
    input.dispatchEvent(new FocusEvent("blur", { relatedTarget: null }))
    // The edit is still open, its text intact, and nothing reached the document.
    expect(view.dom.querySelector("[data-editing]")).not.toBeNull()
    expect((view.dom.querySelector("[data-editing] input") as HTMLInputElement).value).toBe("1")
    expect(view.state.doc.nodeAt(firstCell)!.textContent).toBe("a") // the standing value, uncommitted
    expect(document.activeElement).toBe(input) // the buffer took its focus back
    view.destroy()
  })

  it("the buffer hovers: the standing text keeps the cell's layout while editing", () => {
    const view = makeView()
    let firstCell = -1
    view.state.doc.descendants((n, p) => {
      if (firstCell < 0 && n.type.name === "table_cell") firstCell = p
      return true
    })
    startEditing(firstCell)(view.state, view.dispatch)
    const td = view.dom.querySelector("[data-editing]")!
    // The cell's content is still its standing text — the input floats
    // above it, so a formula longer than its result never reflows the row.
    expect(td.textContent).toBe("a")
    expect(td.querySelector("input")).toBeTruthy()
    view.destroy()
  })

  it("a formula cell wears data-formula on the working grid — the hint's hook", () => {
    const view = makeView()
    let firstCell = -1
    view.state.doc.descendants((n, p) => {
      if (firstCell < 0 && n.type.name === "table_cell") firstCell = p
      return true
    })
    const cell = view.state.doc.nodeAt(firstCell)!
    view.dispatch(view.state.tr.setNodeMarkup(firstCell, null, { ...cell.attrs, formula: "=1+2" }))
    expect(view.dom.querySelector("td")!.getAttribute("data-formula")).toBe("=1+2")
    view.dispatch(
      view.state.tr.setNodeMarkup(firstCell, null, { ...view.state.doc.nodeAt(firstCell)!.attrs, formula: null }),
    )
    expect(view.dom.querySelector("td")!.hasAttribute("data-formula")).toBe(false)
    view.destroy()
  })

  it("keydown-less input seeds the buffer — the box's own beforeinput seam", () => {
    // IME commits, autofill, and synthetic typing arrive as beforeinput
    // with no keydown; stopEvent keeps non-key events inside the box, so
    // the box must claim them itself (venue finding, 2026-07-27).
    const view = makeView()
    let firstCell = -1
    view.state.doc.descendants((n, p) => {
      if (firstCell < 0 && n.type.name === "table_cell") firstCell = p
      return true
    })
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, firstCell)))
    const td = view.dom.querySelector("td")!
    const event = new InputEvent("beforeinput", { inputType: "insertText", data: "7", bubbles: true, cancelable: true })
    td.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    const input = view.dom.querySelector("[data-editing] input") as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.value).toBe("7")
    view.destroy()
  })

  it("a pointerdown claims the caret seat with the focus — no stale caret keeps trusted input", () => {
    const view = makeView()
    document.body.appendChild(view.dom.parentElement ?? view.dom)
    // Park a caret outside the table, as a surrounding document would.
    const outside = document.createElement("p")
    outside.textContent = "prose"
    document.body.appendChild(outside)
    document.getSelection()!.collapse(outside.firstChild!, 2)
    const td = view.dom.querySelector("td")!
    td.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }))
    const selection = document.getSelection()!
    expect(selection.anchorNode).toBe(td)
    outside.remove()
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
