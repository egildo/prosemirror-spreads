import { EditorState } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { schema } from "prosemirror-schema-basic"
import { keymap } from "prosemirror-keymap"
import { baseKeymap } from "prosemirror-commands"
import { history, undo, redo } from "prosemirror-history"
import { spreads, spreadsKey } from "prosemirror-spreads"
import "prosemirror-view/style/prosemirror.css"
import "./style.css"

const state = EditorState.create({
  schema,
  plugins: [
    history(),
    keymap({ "Mod-z": undo, "Mod-y": redo, "Mod-Shift-z": redo }),
    keymap(baseKeymap),
    spreads(),
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
