import type { Node } from "prosemirror-model"
import type { EditorView, NodeView } from "prosemirror-view"
import { settleCell, stopEditing } from "./commands"
import type { EditingState } from "./state"
import { spreadsKey } from "./state"

/// The named bet, in code: a cell is an atom whose node view owns the edit
/// buffer. In grid mode the view renders the cell's content as plain text;
/// in edit mode it hosts a native `<input>` — IME, spellcheck, autocorrect
/// all belong to the platform. The buffer is UI state: it becomes real only
/// through the settle command, and Escape means the document never knew.
export class CellView implements NodeView {
  dom: HTMLTableCellElement
  private input: HTMLInputElement | null = null
  private settling = false

  constructor(
    private node: Node,
    private view: EditorView,
    private getPos: () => number | undefined,
  ) {
    this.dom = document.createElement(node.type.spec.spreadsRole === "header" ? "th" : "td") as HTMLTableCellElement
    this.syncAttrs()
    this.renderContent()
    // A view constructed while its cell is being edited means ProseMirror
    // destroyed the previous view mid-edit — the dragon the probe watches
    // for. Reopen the buffer from the document so the editor stays usable,
    // but the unsettled keystrokes are gone and the failure is observable.
    const editing = this.editingHere()
    if (editing) this.openBuffer(editing.seed)
  }

  private editingHere(): EditingState | null {
    const editing = spreadsKey.getState(this.view.state)?.editing
    return editing && editing.pos === this.getPos() ? editing : null
  }

  private syncAttrs() {
    if (this.node.type.spec.spreadsRole !== "header") return
    const { scope, abbr } = this.node.attrs
    if (scope) this.dom.setAttribute("scope", scope)
    else this.dom.removeAttribute("scope")
    if (abbr) this.dom.setAttribute("abbr", abbr)
    else this.dom.removeAttribute("abbr")
  }

  private renderContent() {
    this.dom.textContent = this.node.textContent
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.syncAttrs()
    const editing = this.editingHere()
    if (editing && !this.input) this.openBuffer(editing.seed)
    else if (!editing && this.input) this.closeBuffer()
    if (!this.input) this.renderContent()
    return true
  }

  private openBuffer(seed: string | null) {
    const input = document.createElement("input")
    this.input = input
    // The buffer shows the formula for formula cells, the lexical value
    // for standing cells — the grid shows the computed, formatted content.
    input.value = seed ?? (this.node.attrs.formula as string | null) ?? this.node.textContent
    input.addEventListener("keydown", this.onKeydown)
    input.addEventListener("blur", this.onBlur)
    this.dom.textContent = ""
    this.dom.appendChild(input)
    // The focus dance: this runs during ProseMirror's DOM sync; claim the
    // focus once the update has fully landed.
    queueMicrotask(() => {
      if (this.input !== input) return
      input.focus()
      const end = input.value.length
      input.setSelectionRange(end, end)
    })
  }

  private closeBuffer() {
    const input = this.input
    if (!input) return
    this.input = null
    input.removeEventListener("keydown", this.onKeydown)
    input.removeEventListener("blur", this.onBlur)
    input.remove()
    this.renderContent()
  }

  private onKeydown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault()
      this.settle(0)
    } else if (event.key === "Tab") {
      event.preventDefault()
      this.settle(event.shiftKey ? -1 : 1)
    } else if (event.key === "Escape") {
      event.preventDefault()
      this.cancel()
    }
  }

  private onBlur = () => {
    // Focus left the buffer without Enter/Tab/Escape — a click elsewhere.
    // Clicking away settles, like every spreadsheet.
    if (!this.settling) this.settle(0, false)
  }

  private settle(advance: -1 | 0 | 1, refocus = true) {
    if (this.settling || !this.input) return
    this.settling = true
    const pos = this.getPos()
    const value = this.input.value
    if (pos != null) settleCell(pos, value, advance)(this.view.state, this.view.dispatch)
    this.settling = false
    if (refocus) this.view.focus()
  }

  private cancel() {
    if (this.settling) return
    this.settling = true
    stopEditing(this.view.state, this.view.dispatch)
    this.settling = false
    this.view.focus()
  }

  // Events inside the buffer are the buffer's business; ProseMirror never
  // sees a keystroke of the unsettled edit.
  stopEvent(event: Event): boolean {
    return this.input != null && event.target === this.input
  }

  // The view owns this subtree entirely; no mutation in it concerns the editor.
  ignoreMutation(): boolean {
    return true
  }

  destroy() {
    this.closeBuffer()
  }
}
