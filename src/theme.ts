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
.ProseMirror td[data-selected], .ProseMirror th[data-selected] {
  outline: 2px solid var(--spreads-selection, #2563eb);
  outline-offset: -2px;
  background: var(--spreads-selection-fill, rgb(37 99 235 / 8%));
}
.ProseMirror td[data-editing], .ProseMirror th[data-editing] {
  padding: 0;
  outline: 2px solid var(--spreads-editing-glow, #2563eb);
  outline-offset: -2px;
}
.ProseMirror td[data-editing] input, .ProseMirror th[data-editing] input {
  font: inherit;
  color: inherit;
  background: var(--spreads-editing-bg, #fff);
  border: 0;
  outline: 0;
  margin: 0;
  padding: 0.2em 0.55em;
  width: 100%;
  height: 100%;
  min-width: 4em;
  display: block;
  box-sizing: border-box;
}
`
