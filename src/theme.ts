/// The base theme, delivered as a constructed stylesheet — the one
/// presentation channel (C3). Everything themable rides a custom property;
/// selectors read the document's own structure and the interface's
/// data-attributes, never presentational classes in content.
/// `.ProseMirror-selectednode` is ProseMirror's own render-time mark on a
/// selected atom — stage makeup, never serialized.
export const baseTheme = `
.ProseMirror table {
  border-collapse: collapse;
  margin: 1em 0;
}
.ProseMirror td, .ProseMirror th {
  border: 1px solid var(--spreads-grid-line, #cbd1d8);
  padding: 0.2em 0.55em;
  min-width: 4em;
  height: 1.9em;
  vertical-align: middle;
  cursor: cell;
  box-sizing: border-box;
  /* The seat for overlays: the hovering buffer and the formula mark. */
  position: relative;
}
.ProseMirror th {
  background: var(--spreads-header-bg, #f2f4f7);
  font-weight: 600;
  text-align: left;
}
.ProseMirror td:focus, .ProseMirror th:focus {
  outline: none;
}
.ProseMirror table[data-purpose="col-resize"] td,
.ProseMirror table[data-purpose="col-resize"] th {
  cursor: col-resize;
}
/* A formula cell wears a quiet corner mark — the automation made visible. */
.ProseMirror td[data-formula]::after {
  content: "";
  position: absolute;
  top: 0;
  right: 0;
  border: 3px solid var(--spreads-formula-mark, #2563eb);
  border-left-color: transparent;
  border-bottom-color: transparent;
}
.ProseMirror td[data-selected], .ProseMirror th[data-selected] {
  outline: 2px solid var(--spreads-selection, #2563eb);
  outline-offset: -2px;
  background: var(--spreads-selection-fill, rgb(37 99 235 / 8%));
}
.ProseMirror td[data-editing], .ProseMirror th[data-editing] {
  outline: 2px solid var(--spreads-editing-glow, #2563eb);
  outline-offset: -2px;
}
/* The hovering buffer: the cell's own box never changes — the standing
   text keeps the layout, and the editor floats above it, growing over the
   neighbors like a real spreadsheet's editor. The box sizes it to its
   text (ephemeral geometry, no transactions). */
.ProseMirror td[data-editing] input, .ProseMirror th[data-editing] input {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  min-width: 100%;
  z-index: 2;
  font: inherit;
  color: inherit;
  background: var(--spreads-editing-bg, #fff);
  border: 0;
  outline: 2px solid var(--spreads-editing-glow, #2563eb);
  outline-offset: -2px;
  margin: 0;
  padding: 0.2em 0.55em;
  box-sizing: border-box;
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.15);
}
`
