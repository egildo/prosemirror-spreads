import { describe, it, expect } from "vitest"
import { Schema } from "prosemirror-model"
import type { Node } from "prosemirror-model"
import { EditorState, NodeSelection } from "prosemirror-state"
import type { Plugin } from "prosemirror-state"
import { schema as base } from "prosemirror-schema-basic"
import { keymap } from "prosemirror-keymap"
import { baseKeymap } from "prosemirror-commands"
import { spreads, spreadsNodes, spreadsNodeTypes, isCellType } from "prosemirror-spreads"

// The ordering contract (§5, interim law until C17's black box dissolves
// it): spreads() precedes any keymap binding grid-meaningful keys, because
// plugin order is ProseMirror's only priority system. These tests pin both
// sides of that reality: the documented order protects the cell, and the
// violated order loses it to baseKeymap's deleteSelection — so if
// prosemirror-commands ever changes the premise, the suite says so.

const schema = new Schema({
  nodes: base.spec.nodes.append(spreadsNodes()),
  marks: base.spec.marks,
})

function tableDoc(): Node {
  const types = spreadsNodeTypes(schema)
  const cell = (text?: string) =>
    text ? types.cell!.create(null, schema.text(text)) : types.cell!.createAndFill()!
  const row = types.row!.create(null, [cell("uno"), cell("due"), cell("tre")])
  return schema.node("doc", null, [types.table!.create(null, [types.body!.create(null, [row])])])
}

function firstCellPos(doc: Node): number {
  let found = -1
  doc.descendants((node, pos) => {
    if (found < 0 && isCellType(node.type)) {
      found = pos
      return false
    }
    return true
  })
  return found
}

// Route a keydown the way EditorView does: each plugin's handleKeyDown in
// plugin order until one claims it.
function pressKey(state: EditorState, key: string): EditorState {
  let current = state
  const event = {
    key,
    keyCode: key === "Backspace" ? 8 : 0,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    preventDefault() {},
    stopPropagation() {},
  } as unknown as KeyboardEvent
  const view = {
    get state() {
      return current
    },
    dispatch(tr: Parameters<EditorState["apply"]>[0]) {
      current = current.apply(tr)
    },
  }
  for (const plugin of state.plugins as readonly Plugin[]) {
    const handler = plugin.props.handleKeyDown
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    if (handler && (handler as Function).call(plugin, view, event)) break
  }
  return current
}

function stateWith(plugins: Plugin[]): EditorState {
  const doc = tableDoc()
  const state = EditorState.create({ schema, doc, plugins })
  const pos = firstCellPos(doc)
  return state.apply(state.tr.setSelection(NodeSelection.create(state.doc, pos)))
}

describe("the keymap-ordering contract", () => {
  it("documented order — Backspace clears the cell's content, never the cell", () => {
    const state = stateWith([...spreads(), keymap(baseKeymap)])
    const after = pressKey(state, "Backspace")
    const row = after.doc.firstChild!.firstChild!.firstChild! // table > tbody > tr
    expect(row.childCount).toBe(3)
    expect(row.child(0).textContent).toBe("")
    expect(row.child(1).textContent).toBe("due")
  })

  it("violated order — baseKeymap's deleteSelection removes the cell node (the contract's premise)", () => {
    const state = stateWith([keymap(baseKeymap), ...spreads()])
    const after = pressKey(state, "Backspace")
    const row = after.doc.firstChild!.firstChild!.firstChild! // table > tbody > tr
    // If this ever fails, prosemirror-commands changed the behavior the
    // ordering contract defends against — revisit §5's interim law.
    expect(row.childCount).toBe(2)
    expect(row.child(0).textContent).toBe("due")
  })
})
