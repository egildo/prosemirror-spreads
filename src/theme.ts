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
/* ── The anatomy, made readable ──────────────────────────────────────────
   The regions are already in the document — thead, tbody+, tfoot, and the
   scope="row" column — and until now they all looked alike. These rules
   read the document's own structure (never a class), so a table gains them
   by *being* well-formed: nothing here is applied by the editor, and a
   serialized table dropped into any page with this sheet reads the same. */

/* The caption is the table's name: it sits above the grid and says so. */
.ProseMirror caption {
  caption-side: top;
  text-align: left;
  padding: 0 0 0.4em;
  font-weight: 600;
  color: var(--spreads-caption-color, inherit);
}
/* A firm rule closes the header band — the strongest line in the table,
   because it is the one boundary a reader must never lose. */
.ProseMirror thead > tr:last-child > th,
.ProseMirror thead > tr:last-child > td {
  border-bottom: var(--spreads-band-rule, 2px solid #9aa4b2);
}
/* The footer wears the accounting convention: a double rule above the
   totals, which is what centuries of printed ledgers settled on. */
.ProseMirror tfoot > tr:first-child > th,
.ProseMirror tfoot > tr:first-child > td {
  border-top: var(--spreads-total-rule, 3px double #9aa4b2);
}
.ProseMirror tfoot {
  background: var(--spreads-foot-bg, #f8f9fb);
  font-weight: 600;
}
/* The partition, at last visible: every tbody after the first opens with
   its own rule. Until this line, splitting a body changed the document's
   grouping and nothing on the screen — the verb was real and invisible. */
.ProseMirror tbody + tbody > tr:first-child > td,
.ProseMirror tbody + tbody > tr:first-child > th {
  border-top: var(--spreads-group-rule, 2px solid #9aa4b2);
}
/* The row-header column is the thead's vertical twin, and it gets the
   twin's treatment: the band rule, turned on its side. */
.ProseMirror tbody th[scope="row"],
.ProseMirror tfoot th[scope="row"] {
  border-right: var(--spreads-band-rule, 2px solid #9aa4b2);
  background: var(--spreads-row-header-bg, #f8f9fb);
}
/* Column groups. CSS grants column boxes only four properties — border,
   background, width, visibility — and the border counts only under
   border-collapse, where it also loses every tie to the cell's own. So a
   group boundary must out-weigh the 1px grid line to appear at all, which
   is why this rule is deliberately wider rather than merely darker. This
   is the honest ceiling: a colgroup cannot tint its cells' text, align
   them, or carry any other readability affordance, whatever we wish.
   Today only pasted or hand-authored tables carry more than one colgroup
   (ours are created for widths and there is exactly one), so this rule is
   the anatomy being served faithfully rather than a feature in daily use. */
.ProseMirror colgroup + colgroup {
  border-left: var(--spreads-group-rule, 2px solid #9aa4b2);
}
/* Off by default: a stripe is a taste, not a structure. One variable
   turns it on for a whole document, and it rides td alone so it never
   fights a header's or a footer's own band. */
.ProseMirror tbody > tr:nth-child(even) > td {
  background: var(--spreads-row-stripe, transparent);
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
