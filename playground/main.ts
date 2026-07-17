import { Schema } from "prosemirror-model"
import { EditorState } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { schema as base } from "prosemirror-schema-basic"
import { keymap } from "prosemirror-keymap"
import { baseKeymap } from "prosemirror-commands"
import { history, undo, redo } from "prosemirror-history"
import * as spreadsLib from "prosemirror-spreads"
import { spreads, spreadsNodes, spreadsKey, insertTable } from "prosemirror-spreads"
import "prosemirror-view/style/prosemirror.css"
import "./style.css"

const schema = new Schema({
  nodes: base.spec.nodes.append(spreadsNodes()),
  marks: base.spec.marks,
})

const state = EditorState.create({
  schema,
  plugins: [
    // The ordering contract (§5, interim law): spreads() before any keymap
    // that binds grid-meaningful keys — plugin order is PM's priority system.
    ...spreads(),
    history(),
    keymap({ "Mod-z": undo, "Mod-y": redo, "Mod-Shift-z": redo }),
    keymap(baseKeymap),
  ],
})

const view = new EditorView(document.querySelector("#editor")!, {
  state,
  dispatchTransaction(tr) {
    const next = view.state.apply(tr)
    view.updateState(next)
    renderInspector(next)
  },
})

// Exposed for probing from the console: dispatching "remote" transactions
// against an open edit buffer is exactly the dragon the first probe hunts.
Object.assign(window as object, { view, spreadsLib })

document.querySelector("#insert-table")!.addEventListener("click", () => {
  insertTable()(view.state, view.dispatch)
  view.focus()
})

document.querySelector("#insert-named-table")!.addEventListener("click", () => {
  insertTable(3, 3, { headerRow: true })(view.state, view.dispatch)
  view.focus()
})

const inspector = document.querySelector("#inspector")!

function renderInspector(state: EditorState) {
  inspector.textContent = JSON.stringify(
    {
      selection: state.selection.toJSON(),
      pluginState: spreadsKey.getState(state),
      doc: state.doc.toJSON(),
    },
    null,
    2,
  )
}

renderInspector(view.state)
view.focus()
