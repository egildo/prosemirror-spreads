import { describe, it, expect } from "vitest"
import { Schema } from "prosemirror-model"
import type { Node } from "prosemirror-model"
import { EditorState, NodeSelection } from "prosemirror-state"
import type { Command, Plugin } from "prosemirror-state"
import { schema as base } from "prosemirror-schema-basic"
import { keymap } from "prosemirror-keymap"
import {
  spreads,
  spreadsKey,
  spreadsNodes,
  spreadsNodeTypes,
  isCellType,
  gridKeys,
  selectRelativeCell,
} from "prosemirror-spreads"

// Finding 3's landing: grid keys are a rebindable vocabulary. The plugin
// installs gridKeys by default; `keys: false` uninstalls them (a consumer
// binds gridKeys through their own keymap); a custom map replaces them.
// Type-to-replace stays intrinsic under every configuration.

const schema = new Schema({
  nodes: base.spec.nodes.append(spreadsNodes()),
  marks: base.spec.marks,
})

function tableDoc(): Node {
  const types = spreadsNodeTypes(schema)
  const cell = (text: string) => types.cell!.create(null, text ? schema.text(text) : null)
  const row = types.row!.create(null, [cell("uno"), cell("due"), cell("tre")])
  return schema.node("doc", null, [types.table!.create(null, [types.body!.create(null, [row])])])
}

function stateWith(plugins: Plugin[]): EditorState {
  const doc = tableDoc()
  const state = EditorState.create({ schema, doc, plugins })
  let pos = -1
  doc.descendants((node, p) => {
    if (pos < 0 && isCellType(node.type)) {
      pos = p
      return false
    }
    return true
  })
  return state.apply(state.tr.setSelection(NodeSelection.create(state.doc, pos)))
}

function pressKey(state: EditorState, key: string, mods: Partial<KeyboardEvent> = {}): EditorState {
  let current = state
  const event = {
    key,
    keyCode: 0,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    ...mods,
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
    if (handler && (handler as (v: unknown, e: KeyboardEvent) => boolean).call(plugin, view, event)) break
  }
  return current
}

describe("gridKeys — the rebindable vocabulary", () => {
  it("installs by default: Tab walks, Shift-Tab walks back", () => {
    const state = stateWith([...spreads()])
    const walked = pressKey(state, "Tab")
    expect(walked.selection.from).toBeGreaterThan(state.selection.from)
    const back = pressKey(walked, "Tab", { shiftKey: true })
    expect(back.selection.from).toBe(state.selection.from)
  })

  it("keys: false uninstalls the bindings but keeps type-to-replace intrinsic", () => {
    const state = stateWith([...spreads({ keys: false })])
    const afterTab = pressKey(state, "Tab")
    expect(afterTab.selection.from).toBe(state.selection.from) // nothing bound
    const afterBackspace = pressKey(state, "Backspace")
    expect(afterBackspace.doc.eq(state.doc)).toBe(true) // no clearing either
    const typed = pressKey(state, "9")
    expect(spreadsKey.getState(typed)!.editing).toEqual({ pos: state.selection.from, seed: "9" }) // intrinsic survives
  })

  it("a consumer binds gridKeys through their own keymap when uninstalled", () => {
    const state = stateWith([...spreads({ keys: false }), keymap(gridKeys)])
    const walked = pressKey(state, "Tab")
    expect(walked.selection.from).toBeGreaterThan(state.selection.from)
  })

  it("a custom map replaces the defaults", () => {
    const jumpTwice: Command = (s, dispatch) => {
      let mid = s
      if (!selectRelativeCell(1)(s, (tr) => (mid = s.apply(tr)))) return false
      return selectRelativeCell(1)(mid, dispatch)
    }
    const state = stateWith([...spreads({ keys: { Tab: jumpTwice } })])
    const walked = pressKey(state, "Tab")
    // two cells forward, not one
    const oneStep = pressKey(stateWith([...spreads()]), "Tab")
    expect(walked.selection.from).toBeGreaterThan(oneStep.selection.from)
    // and the removed default does nothing
    const arrow = pressKey(state, "ArrowRight")
    expect(arrow.selection.from).toBe(state.selection.from)
  })
})
