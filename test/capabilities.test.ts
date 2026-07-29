import { describe, it, expect } from "vitest"
import { Schema } from "prosemirror-model"
import { EditorState, NodeSelection } from "prosemirror-state"
import type { Command } from "prosemirror-state"
import { schema as base } from "prosemirror-schema-basic"
import { spreads, spreadsNodes, spreadsCapabilities, spreadsTaste, isCellType } from "prosemirror-spreads"
import type { SpreadsCapability } from "prosemirror-spreads"

// The capability set is plain data in prosemirror-verbs' structural contract —
// declared without depending on the registry. Pins: the set guards its nouns,
// every entry is a *bare* capability (no name, no glyph, no category — the
// doctrine's line, mechanically enforced), the suggested taste covers it from
// outside, and the commands dry-run the way a composing host expects.

const schema = new Schema({
  nodes: base.spec.nodes.append(spreadsNodes()),
  marks: base.spec.marks,
})

function apply(state: EditorState, command: Command): EditorState {
  let next = state
  expect(command(state, (tr) => (next = state.apply(tr)))).toBe(true)
  return next
}

describe("spreadsCapabilities", () => {
  it("guards its nouns: a schema without our types yields nothing", () => {
    expect(spreadsCapabilities(base)).toEqual([])
  })

  it("declares an id and a command, with unique ids", () => {
    const verbs = spreadsCapabilities(schema)
    expect(verbs.length).toBeGreaterThan(0)
    const ids = verbs.map((verb) => verb.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const verb of verbs) {
      expect(verb.id).toBeTruthy()
      expect(typeof verb.command).toBe("function")
    }
  })

  it("ships capabilities and nothing else — the doctrine, mechanically", () => {
    // A capability is what we can do and what we can tell you: id, command,
    // read, enabled, args. A name, a glyph, a chord, a category are the host's,
    // and this pin is what would catch one drifting back in. Its argument
    // declarations carry no labels either: what to call a box is the asker's.
    const allowed = new Set(["id", "command", "read", "enabled", "args"])
    for (const verb of spreadsCapabilities(schema)) {
      for (const key of Object.keys(verb)) expect(allowed).toContain(key)
      for (const arg of verb.args ?? []) {
        for (const key of Object.keys(arg)) expect(["name", "type", "domain"]).toContain(key)
        for (const member of arg.domain ?? []) expect(Object.keys(member)).toEqual(["value"])
      }
    }
  })

  it("the suggested taste covers every capability, and its conjugated forms", () => {
    // Shipping the taste separately only pays if it is complete: a host that
    // seats it gets a dressed strip, and a capability added without a name
    // here would come up spelled by the id-humanizer. The three region forms
    // are ids a host's `expand` produces, dressed here like anything else.
    for (const verb of spreadsCapabilities(schema)) {
      expect(spreadsTaste[verb.id]?.label, verb.id).toBeTruthy()
    }
    // Names, never glyphs. A character standing in for a picture is the thing
    // this file stopped doing (Egildo's ruling, 2026-07-29): it renders as
    // mojibake wherever the font disagrees, and leaves an icon-only control
    // with nothing for a screen reader to say.
    for (const [id, entry] of Object.entries(spreadsTaste)) {
      if (entry.icon) expect(entry.icon, id).toMatch(/^[a-z][a-z0-9-]*$/)
    }
    for (const member of ["head", "body", "foot"]) {
      expect(spreadsTaste[`table:row-region:${member}`]?.icon).toBeTruthy()
    }
    // Faces are curation: a picture means a button, its absence means none. The
    // fields wear words, and the three keyboard rungs wear nothing at all.
    for (const id of ["table:formula", "table:abbr", "table:caption", "table:column-width"]) {
      expect(spreadsTaste[id]!.icon, id).toBeUndefined()
    }
    for (const id of ["table:edit", "table:clear", "table:select"]) {
      expect(spreadsTaste[id]!.icon, id).toBeUndefined()
    }
    for (const id of ["table:split-body", "table:join-bodies"]) {
      expect(spreadsTaste[id]!.icon, id).toBeTruthy()
    }
  })

  it("table:insert is an arg-verb: enabled gates it, the factory coerces its dimensions", () => {
    const insert = spreadsCapabilities(schema).find((verb) => verb.id === "table:insert")!
    const state = EditorState.create({ schema, plugins: [...spreads()] })
    expect(insert.args!.map((arg) => arg.name)).toEqual(["rows", "cols"])
    expect(insert.enabled!(state)).toBe(true)
    const factory = insert.command as (args: Record<string, unknown>) => Command
    const inserted = apply(state, factory({ rows: "2", cols: "4" }))
    const table = inserted.doc.firstChild!
    expect(table.type.name).toBe("table")
    expect(table.firstChild!.type.name).toBe("table_head")
    expect(table.firstChild!.firstChild!.childCount).toBe(4)
    const body = table.child(1)
    expect(body.childCount).toBe(2)
    expect(body.firstChild!.childCount).toBe(4)
    // A blank or garbled answer falls back to the default 3.
    const defaulted = apply(state, factory({ rows: "", cols: "seven" }))
    expect(defaulted.doc.firstChild!.child(1).childCount).toBe(3)
    expect(defaulted.doc.firstChild!.child(1).firstChild!.childCount).toBe(3)
  })

  it("table:edit dry-runs false without a cell selection, true with one — and its readback follows the seam", () => {
    const verbs = spreadsCapabilities(schema)
    const edit = verbs.find((verb) => verb.id === "table:edit")!
    let state = withInserted()
    const command = edit.command as Command
    expect(command(state, undefined)).toBe(true)
    const editing = apply(state, command)
    expect(edit.read!(editing)).toBe(true)
    const blank = EditorState.create({ schema, plugins: [...spreads()] })
    expect(command(blank, undefined)).toBe(false)
    expect(edit.read!(blank)).toBe(false)
  })

  it("the structure family dry-runs false without a cell selection, true with one", () => {
    const verbs = spreadsCapabilities(schema)
    const ids = [
      "table:add-row-before",
      "table:add-row-after",
      "table:add-column-before",
      "table:add-column-after",
      "table:delete-row",
      "table:delete-column",
    ]
    const blank = EditorState.create({ schema, plugins: [...spreads()] })
    const onCell = withInserted()
    for (const id of ids) {
      const command = verbs.find((verb) => verb.id === id)!.command as Command
      expect(command(blank, undefined)).toBe(false)
      expect(command(onCell, undefined)).toBe(true)
    }
  })

  it("table:formula reads the formula you stand on and writes through the seam", () => {
    const formula = spreadsCapabilities(schema).find((verb) => verb.id === "table:formula")!
    const blank = EditorState.create({ schema, plugins: [...spreads()] })
    expect(formula.read!(blank)).toBeNull()
    expect(formula.enabled!(blank)).toBe(false)
    const onCell = withInserted()
    expect(formula.enabled!(onCell)).toBe(true)
    expect(formula.read!(onCell)).toBeNull() // a standing value has no formula
    const factory = formula.command as (args: Record<string, unknown>) => Command
    const declared = apply(onCell, factory({ formula: "=1+2" }))
    const cell = declared.doc.nodeAt(declared.selection.from)!
    expect(cell.attrs.formula).toBe("=1+2")
    expect(cell.textContent).toBe("3") // the recompute rode the dispatch
    expect(formula.read!(declared)).toBe("=1+2")
    // Plain text demotes — the seam's own law, inherited.
    const demoted = apply(declared, factory({ formula: "plain" }))
    expect(demoted.doc.nodeAt(demoted.selection.from)!.attrs.formula).toBeNull()
    expect(formula.read!(demoted)).toBeNull()
  })

  it("table:row-region declares the {head, body, foot} domain and reads the member you stand on", () => {
    const region = spreadsCapabilities(schema).find((verb) => verb.id === "table:row-region")!
    expect(region.args![0]!.domain!.map((member) => member.value)).toEqual(["head", "body", "foot"])
    const blank = EditorState.create({ schema, plugins: [...spreads()] })
    expect(region.read!(blank)).toBeNull()
    expect(region.enabled!(blank)).toBe(false)
    const onCell = withInserted()
    expect(region.read!(onCell)).toBe("body")
    expect(region.enabled!(onCell)).toBe(true)
    const factory = region.command as (args: Record<string, unknown>) => Command
    expect(factory({ region: "body" })(onCell, undefined)).toBe(false) // already the member
    const promoted = apply(onCell, factory({ region: "foot" }))
    expect(region.read!(promoted)).toBe("foot") // the readback follows the moved row
  })

  it("the new entries dry-run honestly without a cell selection", () => {
    const verbs = spreadsCapabilities(schema)
    const blank = EditorState.create({ schema, plugins: [...spreads()] })
    for (const id of ["table:row-header-column", "table:split-body", "table:join-bodies"]) {
      expect((verbs.find((verb) => verb.id === id)!.command as Command)(blank, undefined)).toBe(false)
    }
    for (const id of ["table:abbr", "table:column-width", "table:caption"]) {
      const verb = verbs.find((entry) => entry.id === id)!
      expect(verb.enabled!(blank)).toBe(false)
      expect(verb.read!(blank)).toBeNull()
    }
  })

  it("the three value-verbs declare a control's whole specification", () => {
    // One argument, no domain, a typed name and a readback that answers a
    // value: that is a field, and a host reads it off the declaration alone.
    const verbs = spreadsCapabilities(schema)
    for (const [id, type] of [
      ["table:formula", "text"],
      ["table:abbr", "text"],
      ["table:column-width", "number"],
      ["table:caption", "text"],
    ] as const) {
      const verb = verbs.find((entry) => entry.id === id)!
      expect(verb.args).toHaveLength(1)
      expect(verb.args![0]!.domain).toBeUndefined()
      expect(verb.args![0]!.type).toBe(type)
      expect(typeof verb.read).toBe("function")
      expect(typeof verb.enabled).toBe("function")
    }
  })

  it("table:caption reads the table's name from any cell, and blank removes it", () => {
    const caption = spreadsCapabilities(schema).find((verb) => verb.id === "table:caption")!
    const onCell = withInserted()
    expect(caption.enabled!(onCell)).toBe(true)
    expect(caption.read!(onCell)).toBeNull()
    const factory = caption.command as (args: Record<string, unknown>) => Command
    const named = apply(onCell, factory({ caption: "Listino" }))
    expect(caption.read!(named)).toBe("Listino")
    expect(caption.enabled!(named)).toBe(true) // a standing caption is still writable
    const cleared = apply(named, factory({ caption: "" }))
    expect(caption.read!(cleared)).toBeNull()
  })

  it("table:formula is offered only where the schema can hold one", () => {
    // A header has no formula attribute: a formula settled there would
    // degrade to its own text, silently renaming the column. The gate
    // matches the readback — data cells, nothing else.
    const formula = spreadsCapabilities(schema).find((verb) => verb.id === "table:formula")!
    const onCell = withInserted()
    expect(formula.enabled!(onCell)).toBe(true)
    let headerPos = -1
    onCell.doc.descendants((node, pos) => {
      if (headerPos < 0 && node.type.name === "table_header") headerPos = pos
      return true
    })
    const onHeader = onCell.apply(onCell.tr.setSelection(NodeSelection.create(onCell.doc, headerPos)))
    expect(formula.enabled!(onHeader)).toBe(false)
    expect(formula.read!(onHeader)).toBeNull()
    // The seam refuses the same thing, so the gate is honesty rather than
    // safety: even driven past the greyed field, nothing lands.
    const factory = formula.command as (args: Record<string, unknown>) => Command
    expect(factory({ formula: "=1+1" })(onHeader, undefined)).toBe(false)
    expect(onHeader.doc.nodeAt(headerPos)!.textContent).toBe(
      onCell.doc.nodeAt(headerPos)!.textContent,
    )
    // The abbr verb is the header's twin, and mirrors the gate.
    const abbr = spreadsCapabilities(schema).find((verb) => verb.id === "table:abbr")!
    expect(abbr.enabled!(onHeader)).toBe(true)
    expect(abbr.enabled!(onCell)).toBe(false)
  })

  it("table:demote-formula freezes the computed value and drops the automation", () => {
    const verbs = spreadsCapabilities(schema)
    const formula = verbs.find((verb) => verb.id === "table:formula")!
    const demote = verbs.find((verb) => verb.id === "table:demote-formula")!
    const command = demote.command as Command
    const onCell = withInserted()
    expect(command(onCell, undefined)).toBe(false) // a standing value has nothing to demote
    const factory = formula.command as (args: Record<string, unknown>) => Command
    const declared = apply(onCell, factory({ formula: "=2*4" }))
    expect(command(declared, undefined)).toBe(true)
    const demoted = apply(declared, command)
    const cell = demoted.doc.nodeAt(demoted.selection.from)!
    expect(cell.attrs.formula).toBeNull()
    expect(cell.textContent).toBe("8")
  })

  it("table:select climbs the Escape rung, and its readback names the state", () => {
    const selectVerb = spreadsCapabilities(schema).find((verb) => verb.id === "table:select")!
    const onCell = withInserted()
    const command = selectVerb.command as Command
    expect(selectVerb.read!(onCell)).toBe(false)
    const onTable = apply(onCell, command)
    expect(selectVerb.read!(onTable)).toBe(true)
    expect(command(onTable, undefined)).toBe(false) // the rung climbs once
  })
})

// A state holding a fresh default table with its first data cell selected.
function withInserted(): EditorState {
  const insert = spreadsCapabilities(schema).find((verb) => verb.id === "table:insert")! as SpreadsCapability
  const factory = insert.command as (args: Record<string, unknown>) => Command
  let state = EditorState.create({ schema, plugins: [...spreads()] })
  state = apply(state, factory({}))
  let cellPos = -1
  state.doc.descendants((node, pos) => {
    if (cellPos < 0 && node.type.name === "table_cell" && isCellType(node.type)) cellPos = pos
    return true
  })
  return state.apply(state.tr.setSelection(NodeSelection.create(state.doc, cellPos)))
}
