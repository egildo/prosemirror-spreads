import { describe, it, expect } from "vitest"
import { EditorState } from "prosemirror-state"
import { schema } from "prosemirror-schema-basic"
import { spreads, spreadsKey } from "prosemirror-spreads"

function createState() {
  return EditorState.create({ schema, plugins: [spreads()] })
}

describe("spreads", () => {
  it("installs and exposes its state through the key", () => {
    const state = createState()
    expect(spreadsKey.getState(state)).toBeDefined()
  })

  it("carries its state across transactions", () => {
    const state = createState()
    const next = state.apply(state.tr.insertText("hello"))
    expect(next.doc.textContent).toBe("hello")
    expect(spreadsKey.getState(next)).toBeDefined()
  })
})
