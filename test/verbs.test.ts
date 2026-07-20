import { describe, it, expect } from "vitest"
import { Schema } from "prosemirror-model"
import { EditorState, NodeSelection } from "prosemirror-state"
import type { Command } from "prosemirror-state"
import { schema as base } from "prosemirror-schema-basic"
import { spreads, spreadsNodes, spreadsVerbs, isCellType } from "prosemirror-spreads"

// The verb set is plain data in prosemirror-verbs' structural contract —
// declared without depending on the registry. Pins: the set guards its
// nouns, entries carry the required trio, and the commands dry-run the way
// a composing host expects.

const schema = new Schema({
  nodes: base.spec.nodes.append(spreadsNodes()),
  marks: base.spec.marks,
})

function apply(state: EditorState, command: Command): EditorState {
  let next = state
  expect(command(state, (tr) => (next = state.apply(tr)))).toBe(true)
  return next
}

describe("spreadsVerbs", () => {
  it("guards its nouns: a schema without our types yields nothing", () => {
    expect(spreadsVerbs(base)).toEqual([])
  })

  it("declares the required trio with unique ids", () => {
    const verbs = spreadsVerbs(schema)
    expect(verbs.length).toBeGreaterThan(0)
    const ids = verbs.map((verb) => verb.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const verb of verbs) {
      expect(verb.id).toBeTruthy()
      expect(verb.label).toBeTruthy()
      expect(typeof verb.command).toBe("function")
    }
  })

  it("table:insert dry-runs and inserts a table with a header row", () => {
    const verbs = spreadsVerbs(schema)
    const insert = verbs.find((verb) => verb.id === "table:insert")!
    const state = EditorState.create({ schema, plugins: [...spreads()] })
    expect(insert.command(state, undefined)).toBe(true)
    const inserted = apply(state, insert.command)
    const table = inserted.doc.firstChild!
    expect(table.type.name).toBe("table")
    expect(table.firstChild!.type.name).toBe("table_head")
  })

  it("table:edit dry-runs false without a cell selection, true with one — and its readback follows the seam", () => {
    const verbs = spreadsVerbs(schema)
    const edit = verbs.find((verb) => verb.id === "table:edit")!
    const insert = verbs.find((verb) => verb.id === "table:insert")!
    let state = EditorState.create({ schema, plugins: [...spreads()] })
    expect(edit.command(state, undefined)).toBe(false)
    expect(edit.read!(state)).toBe(false)
    state = apply(state, insert.command)
    let cellPos = -1
    state.doc.descendants((node, pos) => {
      if (cellPos < 0 && isCellType(node.type)) cellPos = pos
      return true
    })
    state = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, cellPos)))
    expect(edit.command(state, undefined)).toBe(true)
    const editing = apply(state, edit.command)
    expect(edit.read!(editing)).toBe(true)
  })
})
