import { NodeSelection, Plugin } from "prosemirror-state"
import type { Command, Transaction } from "prosemirror-state"
import type { ResolvedPos } from "prosemirror-model"
import type { EditorView } from "prosemirror-view"
import { Decoration, DecorationSet } from "prosemirror-view"
import { clearSelectedCells, startEditing } from "./commands"
import { enforceDeclarations } from "./enforce"
import { gridKeys, keyNameOf } from "./keys"
import { TableView } from "./tableview"
import { isCellType } from "./schema"
import type { SpreadsMeta, SpreadsState } from "./state"
import { spreadsKey } from "./state"
import { baseTheme } from "./theme"

/// Options accepted by [`spreads`](#spreads).
export interface SpreadsOptions {
  /// Grid-mode key bindings. Defaults to [`gridKeys`](#gridKeys); pass a
  /// custom map to replace them, or `false` to install none and bind
  /// `gridKeys` through your own keymap instead. Intrinsic input handling
  /// (type-to-replace, the beforeinput interception) is not affected —
  /// it is shape protection, not a binding.
  keys?: false | Record<string, Command>
}

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
  // Environments without constructable-stylesheet support (jsdom, old
  // engines) get an unstyled but functional grid — presentation is the
  // one layer allowed to degrade.
  if (!("adoptedStyleSheets" in root) || typeof CSSStyleSheet !== "function") return () => {}
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(baseTheme)
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]
  return () => {
    root.adoptedStyleSheets = root.adoptedStyleSheets.filter((s) => s !== sheet)
  }
}

/// The core plugin: mode state, cell node views, grid-mode keys, and the
/// constructed stylesheet.
export function spreadsPlugin(options: SpreadsOptions = {}): Plugin<SpreadsState> {
  const bindings = options.keys === false ? null : (options.keys ?? gridKeys)
  return new Plugin<SpreadsState>({
    key: spreadsKey,
    state: {
      init: () => ({ editing: null }),
      apply: (tr, value) => applyMeta(tr, value),
    },
    // The enforcement seat (C8), both working pieces so far. First duty
    // fragment — selection legality: a caret inside an atom cell must be
    // unrepresentable, or ProseMirror's DOM reader ends up parsing
    // node-view-owned DOM it cannot understand (probe finding: a
    // double-click's second click, and undo restoring a mapped text
    // selection, both put the caret inside a cell — and the next DOM read
    // mangled the table). Second duty — declarations kept true: formula
    // cells recompute in the same dispatch that dirtied them (the cascade
    // rides the settle; remote transactions arrive already-consistent
    // because only the originating client appends the recompute).
    appendTransaction(trs, _old, state) {
      const enforced = trs.some((t) => t.docChanged) ? enforceDeclarations(state) : null
      const sel = state.selection
      if (!(sel instanceof NodeSelection && isCellType(sel.node.type))) {
        const tr = enforced ?? state.tr
        const $head = tr.doc.resolve(tr.mapping.map(sel.head))
        const cellPos = cellAround($head)
        if (cellPos != null) return tr.setSelection(NodeSelection.create(tr.doc, cellPos))
      }
      return enforced
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
        // C17: the table is the black box; cells are its internal components.
        table: (node, view, getPos) => new TableView(node, view, getPos, bindings),
      },
      decorations(state) {
        // Probe finding (battleground 3): inner decorations of a
        // contentDOM-less node view are ignored entirely — they can't
        // trigger update. The trigger must be the table's OUTER
        // decoration: a signature attribute that changes whenever the
        // edit seam or the cell selection inside that table moves. The
        // attribute is stage makeup on the working DOM; the view reads
        // the truth from the state.
        const editing = spreadsKey.getState(state)?.editing ?? null
        const sel = state.selection
        const selPos = sel instanceof NodeSelection && isCellType(sel.node.type) ? sel.from : null
        if (editing == null && selPos == null) return null
        const decos: Decoration[] = []
        state.doc.descendants((node, pos) => {
          if (node.type.spec.spreadsRole !== "table") return true
          const end = pos + node.nodeSize
          const parts = [
            editing != null && editing.pos > pos && editing.pos < end ? `e${editing.pos}:${editing.seed ?? ""}` : "",
            selPos != null && selPos > pos && selPos < end ? `s${selPos}` : "",
          ]
          const sig = parts.filter(Boolean).join("/")
          if (sig) decos.push(Decoration.node(pos, end, { "data-grid-state": sig }))
          return false
        })
        return decos.length ? DecorationSet.create(state.doc, decos) : null
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
        // Rebindable vocabulary first: the effective bindings map.
        if (bindings) {
          const bound = bindings[keyNameOf(event)]
          if (bound && bound(state, view.dispatch)) return true
        }
        // Type to replace: a printable character opens the buffer seeded
        // with itself, discarding the standing content — spreadsheet law.
        // Intrinsic, not a binding: it guards the document's shape.
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
      // The stale-value rule (§3): a cold-parsed value disagreeing with its
      // formula loses — the value is cache. Runs once on mount, outside
      // history (undo must not restore staleness).
      queueMicrotask(() => {
        if (editorView.isDestroyed) return
        const tr = enforceDeclarations(editorView.state)
        if (tr) editorView.dispatch(tr.setMeta("addToHistory", false))
      })
      return { destroy: dropStylesheet }
    },
  })
}

/// Create the spreads plugin set. Spread it into your plugin list:
/// `plugins: [...spreads(), ...]`.
export function spreads(options: SpreadsOptions = {}): Plugin[] {
  return [spreadsPlugin(options)]
}
