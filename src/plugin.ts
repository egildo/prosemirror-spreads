import { NodeSelection, Plugin } from "prosemirror-state"
import type { Transaction } from "prosemirror-state"
import type { ResolvedPos } from "prosemirror-model"
import type { EditorView } from "prosemirror-view"
import { Decoration, DecorationSet } from "prosemirror-view"
import { CellView } from "./cellview"
import { clearSelectedCells, selectRelativeCell, startEditing } from "./commands"
import { isCellType } from "./schema"
import type { SpreadsMeta, SpreadsState } from "./state"
import { spreadsKey } from "./state"
import { baseTheme } from "./theme"

/// Options accepted by [`spreads`](#spreads).
export interface SpreadsOptions {}

function applyMeta(tr: Transaction, value: SpreadsState): SpreadsState {
  const meta = tr.getMeta(spreadsKey) as SpreadsMeta | undefined
  if (meta?.type === "startEditing") return { editing: { pos: meta.pos, seed: meta.seed } }
  if (meta?.type === "stopEditing") return { editing: null }
  if (value.editing && tr.docChanged) {
    // A remote or unrelated change while a buffer is open: the edit seam
    // follows its cell through the mapping and dies with it if deleted.
    const mapped = tr.mapping.mapResult(value.editing.pos)
    if (mapped.deleted) return { editing: null }
    if (mapped.pos !== value.editing.pos) return { editing: { pos: mapped.pos, seed: value.editing.seed } }
  }
  return value
}

function cellAround($pos: ResolvedPos): number | null {
  for (let d = $pos.depth; d > 0; d--) if (isCellType($pos.node(d).type)) return $pos.before(d)
  return null
}

function adoptStylesheet(view: EditorView): () => void {
  const root = view.root as Document | ShadowRoot
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(baseTheme)
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]
  return () => {
    root.adoptedStyleSheets = root.adoptedStyleSheets.filter((s) => s !== sheet)
  }
}

/// The core plugin: mode state, cell node views, grid-mode keys, and the
/// constructed stylesheet.
export function spreadsPlugin(_options: SpreadsOptions = {}): Plugin<SpreadsState> {
  return new Plugin<SpreadsState>({
    key: spreadsKey,
    state: {
      init: () => ({ editing: null }),
      apply: (tr, value) => applyMeta(tr, value),
    },
    // Selection legality is part of the shape duty (C8): a caret inside an
    // atom cell must be unrepresentable, or ProseMirror's DOM reader ends up
    // parsing node-view-owned DOM it cannot understand (probe finding: a
    // double-click's second click, and undo restoring a mapped text
    // selection, both put the caret inside a cell — and the next DOM read
    // mangled the table). Any selection landing inside a cell is coerced to
    // the cell's node selection.
    appendTransaction(_trs, _old, state) {
      const sel = state.selection
      if (sel instanceof NodeSelection && isCellType(sel.node.type)) return null
      const cellPos = cellAround(sel.$head)
      if (cellPos == null) return null
      return state.tr.setSelection(NodeSelection.create(state.doc, cellPos))
    },
    props: {
      // The view-side entrance of the same law: selections ProseMirror
      // derives from the DOM never land inside a cell.
      createSelectionBetween(view, _anchor, $head) {
        const cellPos = cellAround($head)
        if (cellPos == null) return null
        return NodeSelection.create(view.state.doc, cellPos)
      },
      nodeViews: {
        table_cell: (node, view, getPos) => new CellView(node, view, getPos),
        table_header: (node, view, getPos) => new CellView(node, view, getPos),
      },
      decorations(state) {
        const editing = spreadsKey.getState(state)?.editing
        if (!editing) return null
        const node = state.doc.nodeAt(editing.pos)
        if (!node || !isCellType(node.type)) return null
        return DecorationSet.create(state.doc, [
          Decoration.node(editing.pos, editing.pos + node.nodeSize, { "data-editing": "true" }),
        ])
      },
      handleDoubleClickOn(view, _pos, node, nodePos) {
        if (!isCellType(node.type)) return false
        return startEditing(nodePos)(view.state, view.dispatch)
      },
      handleKeyDown(view, event) {
        const state = view.state
        // An open buffer owns its keys entirely (stopEvent); nothing to do here.
        if (spreadsKey.getState(state)?.editing) return false
        const sel = state.selection
        if (!(sel instanceof NodeSelection) || !isCellType(sel.node.type)) return false
        switch (event.key) {
          case "Enter":
            return startEditing(sel.from)(state, view.dispatch)
          case "Tab":
            return selectRelativeCell(event.shiftKey ? -1 : 1)(state, view.dispatch)
          case "ArrowRight":
            return selectRelativeCell(1)(state, view.dispatch)
          case "ArrowLeft":
            return selectRelativeCell(-1)(state, view.dispatch)
          case "Backspace":
          case "Delete":
            return clearSelectedCells(state, view.dispatch)
        }
        // Type to replace: a printable character opens the buffer seeded
        // with itself, discarding the standing content — spreadsheet law.
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey)
          return startEditing(sel.from, event.key)(state, view.dispatch)
        return false
      },
      handleDOMEvents: {
        // All input paths converge on beforeinput — keydown-less typing
        // (IME, autofill, synthetic input) included. Probe finding: without
        // this, text over a selected atom cell falls through to
        // ProseMirror's node replacement and the parse splits the table.
        beforeinput(view, event) {
          const state = view.state
          if (spreadsKey.getState(state)?.editing) return false
          const sel = state.selection
          if (!(sel instanceof NodeSelection) || !isCellType(sel.node.type)) return false
          if (event.inputType === "insertText" && event.data) {
            event.preventDefault()
            return startEditing(sel.from, event.data)(state, view.dispatch)
          }
          if (event.inputType === "deleteContentBackward" || event.inputType === "deleteContentForward") {
            event.preventDefault()
            return clearSelectedCells(state, view.dispatch)
          }
          return false
        },
      },
    },
    view(editorView) {
      const dropStylesheet = adoptStylesheet(editorView)
      return { destroy: dropStylesheet }
    },
  })
}

/// Create the spreads plugin set. Spread it into your plugin list:
/// `plugins: [...spreads(), ...]`.
export function spreads(options: SpreadsOptions = {}): Plugin[] {
  return [spreadsPlugin(options)]
}
