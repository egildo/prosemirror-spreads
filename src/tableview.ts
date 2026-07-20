import type { Node } from "prosemirror-model"
import { NodeSelection } from "prosemirror-state"
import type { Command } from "prosemirror-state"
import type { EditorView, NodeView } from "prosemirror-view"
import { editSelectedCell, setColumnWidths, settleCell, stopEditing } from "./commands"
import type { SettleAdvance } from "./commands"
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
      // The spreadsheet's directions: Enter lands the value and moves down.
      this.settle(event.shiftKey ? "up" : "down")
    } else if (event.key === "Tab") {
      event.preventDefault()
      event.stopPropagation()
      this.settle(event.shiftKey ? "prev" : "next")
    } else if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      this.cancel()
    }
  }

  private onBlur = () => {
    if (!this.settling) this.settle(null, false)
  }

  private settle(advance: SettleAdvance, refocus = true) {
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

/// A live column-resize drag: the gesture law's ephemeral half. Preview
/// streams as inline styles ProseMirror never sees; one settle at pointerup.
interface ResizeDrag {
  pointerId: number
  col: number
  startX: number
  startWidth: number
  /// Live widths of every column, target updated as the pointer moves.
  widths: number[]
  /// The doc's declared widths at drag start ([] when no colgroup) — at
  /// settle, columns with a standing declaration keep it untouched.
  docWidths: (number | null)[]
  /// The col elements carrying the preview.
  cols: HTMLTableColElement[]
  /// A stage-makeup colgroup conjured for the preview when the doc has
  /// none; removed at drag end (the settle carves the real one).
  makeupGroup: HTMLElement | null
}

const RESIZE_ZONE = 4
const MIN_COL_WIDTH = 32

/// The black box itself: one NodeView for the whole table.
export class TableView implements NodeView {
  dom: HTMLTableElement
  private node: Node
  private sections: SectionEntry[] = []
  private resize: ResizeDrag | null = null

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
    this.dom.addEventListener("pointermove", this.onPointerMove)
    this.dom.addEventListener("pointerup", this.onPointerUp)
    this.dom.addEventListener("pointercancel", this.onPointerCancel)
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
            entry.node = sectionNode
            this.syncColgroupEl(entry)
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

    this.applyLayout()
    this.applyState()
  }

  /// A colgroup's element mirrors its node: one col per table_col, widths
  /// as inline styles (the same styles the doc serializes — here they are
  /// the working copy the resize preview writes over).
  private syncColgroupEl(entry: SectionEntry) {
    entry.el.textContent = ""
    entry.node.forEach((colNode) => {
      const col = document.createElement("col")
      const width = colNode.attrs.width as number | null
      if (width != null) col.style.width = width + "px"
      entry.el.appendChild(col)
    })
  }

  /// Fixed layout is the colgroup's consequence, worn as stage makeup on
  /// the working table (inline style, never serialized): declared widths
  /// mean nothing breathes while typing. No colgroup, no declared widths —
  /// a fluid document table.
  private applyLayout() {
    if (this.resize) return // the drag owns the inline styles until it ends
    const entry = this.sections.find((s) => s.node.type.spec.spreadsRole === "colgroup")
    const widths: (number | null)[] = []
    entry?.node.forEach((colNode) => widths.push((colNode.attrs.width as number | null) ?? null))
    const defined = widths.filter((w): w is number => w != null)
    if (!defined.length) {
      this.dom.style.removeProperty("table-layout")
      this.dom.style.removeProperty("width")
      return
    }
    this.dom.style.tableLayout = "fixed"
    if (defined.length === widths.length) this.dom.style.width = defined.reduce((a, b) => a + b, 0) + "px"
    else this.dom.style.removeProperty("width")
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

  // ── The resize gesture (C7, verbatim): continuous in the ephemeral
  // layer — preview via inline styles the box owns — atomic at pointerup:
  // one setColumnWidths transaction, one undo step.

  /// The widest rendered row: the reference geometry for column edges.
  private referenceCells(): HTMLTableCellElement[] {
    let best: CellEntry[] = []
    for (const section of this.sections)
      for (const row of section.rows) if (row.cells.length > best.length) best = row.cells
    return best.map((cell) => cell.comp.el)
  }

  /// Which column's right edge the pointer stands on, if any.
  private colBoundaryAt(event: PointerEvent): number | null {
    const cells = this.referenceCells()
    for (let i = 0; i < cells.length; i++) {
      if (Math.abs(event.clientX - cells[i]!.getBoundingClientRect().right) <= RESIZE_ZONE) return i
    }
    return null
  }

  private startResize(col: number, event: PointerEvent) {
    const cells = this.referenceCells()
    const widths = cells.map((el) => el.getBoundingClientRect().width)
    const groupEntry = this.sections.find((s) => s.node.type.spec.spreadsRole === "colgroup")
    const docWidths: (number | null)[] = []
    groupEntry?.node.forEach((colNode) => docWidths.push((colNode.attrs.width as number | null) ?? null))
    let makeupGroup: HTMLElement | null = null
    let cols: HTMLTableColElement[]
    if (groupEntry) {
      while (groupEntry.el.children.length < widths.length) groupEntry.el.appendChild(document.createElement("col"))
      cols = [...groupEntry.el.children] as HTMLTableColElement[]
    } else {
      makeupGroup = document.createElement("colgroup")
      cols = widths.map(() => document.createElement("col"))
      for (const colEl of cols) makeupGroup.appendChild(colEl)
      const firstRowgroup =
        [...this.dom.children].find((el) => el.tagName === "THEAD" || el.tagName === "TBODY" || el.tagName === "TFOOT") ??
        null
      this.dom.insertBefore(makeupGroup, firstRowgroup)
    }
    cols.forEach((colEl, i) => (colEl.style.width = widths[i] + "px"))
    this.dom.style.tableLayout = "fixed"
    this.dom.style.width = widths.reduce((a, b) => a + b, 0) + "px"
    // Capture is best-effort: synthetic pointers (probes) and capture-less
    // environments (jsdom) have no active pointer to capture.
    try {
      this.dom.setPointerCapture(event.pointerId)
    } catch {
      /* the drag still works for events that reach the table */
    }
    this.resize = {
      pointerId: event.pointerId,
      col,
      startX: event.clientX,
      startWidth: widths[col]!,
      widths,
      docWidths,
      cols,
      makeupGroup,
    }
  }

  private endResize(settle: boolean) {
    const drag = this.resize
    if (!drag) return
    this.resize = null
    if (this.dom.hasPointerCapture?.(drag.pointerId)) this.dom.releasePointerCapture(drag.pointerId)
    drag.makeupGroup?.remove()
    this.dom.removeAttribute("data-purpose")
    const tablePos = this.getPos()
    if (settle && tablePos != null) {
      // Columns with a standing declaration keep it (undefined = untouched);
      // undeclared ones get their measured width — the first resize carves
      // the whole colgroup so nothing jumps when fixed layout lands.
      const widths = drag.widths.map((w, i) =>
        i === drag.col ? Math.round(w) : drag.docWidths[i] != null ? undefined : Math.round(w),
      )
      setColumnWidths(tablePos, widths)(this.view.state, this.view.dispatch)
    }
    // Re-derive presentation from the doc (dispatch re-rendered already;
    // a cancelled drag restores the pre-drag truth).
    const groupEntry = this.sections.find((s) => s.node.type.spec.spreadsRole === "colgroup")
    if (groupEntry) this.syncColgroupEl(groupEntry)
    this.applyLayout()
  }

  private onPointerDown = (event: PointerEvent) => {
    const boundary = this.colBoundaryAt(event)
    if (boundary != null) {
      event.preventDefault()
      this.startResize(boundary, event)
      return
    }
    const comp = this.compAt(event.target)
    if (!comp || comp.input || comp.pos < 0) return
    event.preventDefault()
    const tr = this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, comp.pos))
    this.view.dispatch(tr)
    comp.el.focus()
  }

  private onPointerMove = (event: PointerEvent) => {
    const drag = this.resize
    if (drag) {
      if (event.pointerId !== drag.pointerId) return
      const width = Math.max(MIN_COL_WIDTH, drag.startWidth + (event.clientX - drag.startX))
      drag.widths[drag.col] = width
      drag.cols[drag.col]!.style.width = width + "px"
      this.dom.style.width = drag.widths.reduce((a, b) => a + b, 0) + "px"
      return
    }
    // The purpose model in miniature: a pointer near a column edge wears
    // col-resize; the attribute is the costume, the stylesheet the paint.
    if (this.colBoundaryAt(event) != null) this.dom.setAttribute("data-purpose", "col-resize")
    else this.dom.removeAttribute("data-purpose")
  }

  private onPointerUp = (event: PointerEvent) => {
    if (this.resize && event.pointerId === this.resize.pointerId) this.endResize(true)
  }

  private onPointerCancel = (event: PointerEvent) => {
    if (this.resize && event.pointerId === this.resize.pointerId) this.endResize(false)
  }

  private onDblClick = (event: MouseEvent) => {
    const comp = this.compAt(event.target)
    if (!comp || comp.input) return
    event.preventDefault()
    editSelectedCell()(this.view.state, this.view.dispatch)
  }

  private onKeydown = (event: KeyboardEvent) => {
    if (this.resize && event.key === "Escape") {
      // The gesture law's abort: the drag dissolves, no transaction happened.
      event.preventDefault()
      event.stopPropagation()
      this.endResize(false)
      return
    }
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
