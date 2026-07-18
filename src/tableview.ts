import type { Node } from "prosemirror-model"
import { NodeSelection } from "prosemirror-state"
import type { Command } from "prosemirror-state"
import type { EditorView, NodeView } from "prosemirror-view"
import { editSelectedCell, settleCell, stopEditing } from "./commands"
import { keyNameOf } from "./keys"
import { spreadsKey } from "./state"

/// C17, in code: the table is a black box to the editor view. This one
/// node view owns the entire grid DOM — no contentDOM, so ProseMirror
/// treats the inside as opaque; no contenteditable inside — native inputs
/// for buffers, roving tabindex for the grid, the ARIA grid pattern as
/// render-time costume (stage makeup, never serialized). The document
/// stays the sole truth: every interaction dispatches the same exported
/// commands; this class renders consequences and hosts inputs (C13).
/// Rows and cells re-render through a keyed-by-node-identity diff, so an
/// unchanged row is untouched DOM and an open buffer survives any change
/// elsewhere — the named bet's soul, now under our own renderer.

interface CellEntry {
  node: Node
  comp: CellComp
}

interface RowEntry {
  node: Node
  el: HTMLTableRowElement
  cells: CellEntry[]
}

interface SectionEntry {
  node: Node
  el: HTMLElement
  rows: RowEntry[]
}

const SECTION_TAGS: Record<string, string> = {
  caption: "caption",
  colgroup: "colgroup",
  head: "thead",
  body: "tbody",
  foot: "tfoot",
}

/// A cell's renderer component — the battleground-1 buffer doctrine,
/// carried whole: grid text rendered by us, edit mode hosts a native
/// input, the buffer is UI state that becomes real only through settle.
class CellComp {
  el: HTMLTableCellElement
  node: Node
  /// Absolute document position, refreshed on every table update.
  pos = -1
  input: HTMLInputElement | null = null
  private settling = false

  constructor(
    node: Node,
    private view: EditorView,
  ) {
    this.node = node
    const header = node.type.spec.spreadsRole === "header"
    this.el = document.createElement(header ? "th" : "td") as HTMLTableCellElement
    this.el.setAttribute("role", header ? "columnheader" : "gridcell")
    this.el.tabIndex = -1
    this.sync(node)
  }

  matches(node: Node): boolean {
    return node.type === this.node.type
  }

  sync(node: Node) {
    this.node = node
    if (node.type.spec.spreadsRole === "header") {
      const { scope, abbr } = node.attrs
      if (scope) this.el.setAttribute("scope", scope)
      else this.el.removeAttribute("scope")
      if (abbr) this.el.setAttribute("abbr", abbr)
      else this.el.removeAttribute("abbr")
    }
    if (!this.input) this.el.textContent = node.textContent
  }

  /// Reflect mode and selection: open/close the buffer, wear the
  /// vocabulary's attributes, hold the roving tabindex.
  applyState(selected: boolean, editingSeed: string | null | undefined, tableHasFocus: boolean) {
    if (editingSeed !== undefined && !this.input) this.openBuffer(editingSeed)
    else if (editingSeed === undefined && this.input) this.closeBuffer()
    if (selected) {
      this.el.setAttribute("data-selected", "true")
      this.el.tabIndex = 0
      if (tableHasFocus && !this.input && document.activeElement !== this.el) this.el.focus()
    } else {
      this.el.removeAttribute("data-selected")
      this.el.tabIndex = -1
    }
  }

  private openBuffer(seed: string | null) {
    const input = document.createElement("input")
    this.input = input
    input.value = seed ?? (this.node.attrs.formula as string | null) ?? this.node.textContent
    input.addEventListener("keydown", this.onKeydown)
    input.addEventListener("blur", this.onBlur)
    this.el.setAttribute("data-editing", "true")
    this.el.textContent = ""
    this.el.appendChild(input)
    // C17's promise pressed: outside contenteditable, focus needs no dance.
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)
  }

  private closeBuffer() {
    const input = this.input
    if (!input) return
    this.input = null
    input.removeEventListener("keydown", this.onKeydown)
    input.removeEventListener("blur", this.onBlur)
    input.remove()
    this.el.removeAttribute("data-editing")
    this.el.textContent = this.node.textContent
  }

  private onKeydown = (event: KeyboardEvent) => {
    // stopPropagation as well as preventDefault: inside the black box we
    // are our own stopEvent — a consumed Enter that kept bubbling would
    // reach the grid's key handler after the buffer closed and re-open
    // the edit (probe finding, battleground 3).
    if (event.key === "Enter") {
      event.preventDefault()
      event.stopPropagation()
      this.settle(0)
    } else if (event.key === "Tab") {
      event.preventDefault()
      event.stopPropagation()
      this.settle(event.shiftKey ? -1 : 1)
    } else if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      this.cancel()
    }
  }

  private onBlur = () => {
    if (!this.settling) this.settle(0, false)
  }

  private settle(advance: -1 | 0 | 1, refocus = true) {
    if (this.settling || !this.input || this.pos < 0) return
    this.settling = true
    settleCell(this.pos, this.input.value, advance)(this.view.state, this.view.dispatch)
    this.settling = false
    if (refocus) this.el.focus()
  }

  private cancel() {
    if (this.settling) return
    this.settling = true
    stopEditing(this.view.state, this.view.dispatch)
    this.settling = false
    this.el.focus()
  }

  destroy() {
    this.closeBuffer()
  }
}

/// The black box itself: one NodeView for the whole table.
export class TableView implements NodeView {
  dom: HTMLTableElement
  private node: Node
  private sections: SectionEntry[] = []

  constructor(
    node: Node,
    private view: EditorView,
    private getPos: () => number | undefined,
    private bindings: Record<string, Command> | null,
  ) {
    this.node = node
    this.dom = document.createElement("table")
    // Stage makeup: the working grid is an interactive ARIA grid; the
    // serialized table (from the doc, never this DOM) carries no role.
    this.dom.setAttribute("role", "grid")
    this.dom.addEventListener("pointerdown", this.onPointerDown)
    this.dom.addEventListener("dblclick", this.onDblClick)
    this.dom.addEventListener("keydown", this.onKeydown)
    this.render()
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.render()
    return true
  }

  /// Keyed-by-node-identity diff. An unchanged section/row/cell keeps its
  /// DOM element (and any open buffer) untouched; changed nodes re-render
  /// in place; removed ones are dropped.
  private render() {
    const tablePos = this.getPos()
    const contentStart = tablePos == null ? -1 : tablePos + 1
    const oldSections = this.sections
    const next: SectionEntry[] = []
    let offset = 0

    this.node.forEach((sectionNode) => {
      const role = sectionNode.type.spec.spreadsRole as string
      const tag = SECTION_TAGS[role]
      if (!tag) {
        offset += sectionNode.nodeSize
        return
      }
      let entry = oldSections.find((s) => s.node === sectionNode || s.el.tagName.toLowerCase() === tag)
      if (entry && oldSections.includes(entry)) oldSections.splice(oldSections.indexOf(entry), 1)
      if (!entry || entry.el.tagName.toLowerCase() !== tag) {
        entry = { node: sectionNode, el: document.createElement(tag), rows: [] }
        if (role === "head" || role === "body" || role === "foot") entry.el.setAttribute("role", "rowgroup")
      }
      if (role === "caption" || role === "colgroup") {
        if (entry.node !== sectionNode || entry.el.childNodes.length === 0) {
          if (role === "caption") entry.el.textContent = sectionNode.textContent
          else {
            entry.el.textContent = ""
            sectionNode.forEach(() => entry!.el.appendChild(document.createElement("col")))
          }
        }
      } else {
        this.renderRows(entry, sectionNode, contentStart + offset + 1)
      }
      entry.node = sectionNode
      next.push(entry)
      offset += sectionNode.nodeSize
    })

    for (const gone of oldSections) for (const row of gone.rows) for (const cell of row.cells) cell.comp.destroy()

    // Sync DOM order.
    next.forEach((entry, i) => {
      if (this.dom.children[i] !== entry.el) this.dom.insertBefore(entry.el, this.dom.children[i] ?? null)
    })
    while (this.dom.children.length > next.length) this.dom.lastChild!.remove()
    this.sections = next

    this.applyState()
  }

  private renderRows(section: SectionEntry, sectionNode: Node, rowsStart: number) {
    const oldRows = section.rows
    const next: RowEntry[] = []
    let offset = 0
    sectionNode.forEach((rowNode) => {
      let entry = oldRows.find((r) => r.node === rowNode)
      if (entry) oldRows.splice(oldRows.indexOf(entry), 1)
      else {
        const reuse = oldRows.length > 0 ? oldRows.splice(0, 1)[0] : undefined
        if (reuse) entry = reuse
        else {
          entry = { node: rowNode, el: document.createElement("tr"), cells: [] }
          entry.el.setAttribute("role", "row")
        }
      }
      this.renderCells(entry, rowNode, rowsStart + offset + 1)
      entry.node = rowNode
      next.push(entry)
      offset += rowNode.nodeSize
    })
    for (const gone of oldRows) for (const cell of gone.cells) cell.comp.destroy()
    next.forEach((entry, i) => {
      if (section.el.children[i] !== entry.el) section.el.insertBefore(entry.el, section.el.children[i] ?? null)
    })
    while (section.el.children.length > next.length) section.el.lastChild!.remove()
    section.rows = next
  }

  private renderCells(row: RowEntry, rowNode: Node, cellsStart: number) {
    const oldCells = row.cells
    const next: CellEntry[] = []
    let offset = 0
    rowNode.forEach((cellNode) => {
      let entry = oldCells.find((c) => c.node === cellNode)
      if (entry) oldCells.splice(oldCells.indexOf(entry), 1)
      else {
        const reuseIdx = oldCells.findIndex((c) => c.comp.matches(cellNode))
        const reuse = reuseIdx >= 0 ? oldCells.splice(reuseIdx, 1)[0] : undefined
        entry = reuse ?? { node: cellNode, comp: new CellComp(cellNode, this.view) }
      }
      entry.comp.sync(cellNode)
      entry.comp.pos = cellsStart + offset
      entry.node = cellNode
      next.push(entry)
      offset += cellNode.nodeSize
    })
    for (const gone of oldCells) gone.comp.destroy()
    next.forEach((entry, i) => {
      if (row.el.children[i] !== entry.comp.el) row.el.insertBefore(entry.comp.el, row.el.children[i] ?? null)
    })
    while (row.el.children.length > next.length) row.el.lastChild!.remove()
    row.cells = next
  }

  /// Reflect selection and edit mode onto the grid (called after every
  /// render; the plugin's decorations exist to force update on state-only
  /// changes — the truth is read here, from the state).
  private applyState() {
    const state = this.view.state
    const sel = state.selection
    const selectedPos = sel instanceof NodeSelection && sel.node.type.spec.spreadsRole ? sel.from : null
    const editing = spreadsKey.getState(state)?.editing ?? null
    const hasFocus = this.dom.contains(document.activeElement) || this.view.hasFocus()
    for (const section of this.sections)
      for (const row of section.rows)
        for (const cell of row.cells) {
          const isEditing = editing != null && editing.pos === cell.comp.pos
          cell.comp.applyState(selectedPos === cell.comp.pos, isEditing ? editing.seed : undefined, hasFocus)
        }
  }

  private compAt(target: EventTarget | null): CellComp | null {
    if (!(target instanceof globalThis.Node)) return null
    for (const section of this.sections)
      for (const row of section.rows)
        for (const cell of row.cells) if (cell.comp.el.contains(target)) return cell.comp
    return null
  }

  private onPointerDown = (event: PointerEvent) => {
    const comp = this.compAt(event.target)
    if (!comp || comp.input || comp.pos < 0) return
    event.preventDefault()
    const tr = this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, comp.pos))
    this.view.dispatch(tr)
    comp.el.focus()
  }

  private onDblClick = (event: MouseEvent) => {
    const comp = this.compAt(event.target)
    if (!comp || comp.input) return
    event.preventDefault()
    editSelectedCell()(this.view.state, this.view.dispatch)
  }

  private onKeydown = (event: KeyboardEvent) => {
    const comp = this.compAt(event.target)
    if (comp?.input) return // the buffer's own listeners rule there
    const state = this.view.state
    if (spreadsKey.getState(state)?.editing) return
    const sel = state.selection
    if (!(sel instanceof NodeSelection) || !sel.node.type.spec.spreadsRole) return
    if (this.bindings) {
      const bound = this.bindings[keyNameOf(event)]
      if (bound && bound(state, this.view.dispatch)) {
        event.preventDefault()
        return
      }
    }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault()
      editSelectedCell(event.key)(state, this.view.dispatch)
    }
  }

  /// ProseMirror routes selections that fall inside the black box here.
  setSelection() {
    this.applyState()
  }

  selectNode() {
    this.dom.classList.add("ProseMirror-selectednode")
  }

  deselectNode() {
    this.dom.classList.remove("ProseMirror-selectednode")
  }

  // Everything inside the box is the box's business.
  stopEvent(): boolean {
    return true
  }

  ignoreMutation(): boolean {
    return true
  }

  destroy() {
    for (const section of this.sections) for (const row of section.rows) for (const cell of row.cells) cell.comp.destroy()
  }
}
