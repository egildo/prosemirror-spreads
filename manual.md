# prosemirror-spreads — The Manual

*The venue's genre note: this is the mock manual — the confident description of the software as if it already existed, written before it does so reality has something precise to disagree with. Every sentence is a claim; every "how cool" is concrete enough to lose. Names spoken here (commands, attributes, variables) are proposals until the christening round confirms them.*

## What this is

prosemirror-spreads turns tables in your ProseMirror editor into two things at once: the best HTML table markup you've ever shipped, and a little spreadsheet. You edit cells like a spreadsheet — grid selection, fill handle, formulas — and the document underneath stays a semantic HTML table a careful hand would have written: real `thead` and `tfoot`, scoped headers, machine-readable values, zero presentational junk. Copy a table out of your editor and paste it anywhere: the markup carries its own meaning.

Requisites: a ProseMirror editor (the core packages are peer dependencies — your editor owns them) and a modern browser. Nothing else; there are no runtime dependencies.

## Setup

The schema is a factory, because your schema is yours:

```js
import { Schema } from "prosemirror-model"
import { schema as base } from "prosemirror-schema-basic"
import { spreadsNodes, spreads } from "prosemirror-spreads"

const schema = new Schema({
  nodes: base.spec.nodes.append(spreadsNodes()),
  marks: base.spec.marks,
})

const state = EditorState.create({ schema, plugins: [...spreads(), ...yourPlugins] })
```

`spreads()` returns the plugin set; styling arrives automatically as a constructed stylesheet the plugin owns — you ship no CSS file. Insert your first table with the `insertTable` command (it's in the exported command set, along with everything else in this manual — every mutation the plugin can make is a plain ProseMirror command you can bind, invoke, or dry-run).

## Your first table

A fresh table is three-by-three, empty, and honest: under the hood it is `<table><tbody>…</tbody></table>` and nothing more. Around it you see the classic rulers — A B C across the top, 1 2 3 down the side — and moving over the grid you get the fat spreadsheet cross.

Click a cell: it's selected, as a unit. Type: your text replaces the cell's content and you're editing. Double-click or press Enter instead to edit what's already there. Inside a cell you have a plain, native input — your IME, your spellcheck, your autocorrect all just work. Press Enter or Tab, or click elsewhere, and the cell **settles**: one atomic document change, one undo step. Escape abandons the edit; the cell is as it was, and the document never knew.

Arrow keys walk cells. Click a ruler number to select a row, a ruler letter to select a column, drag across cells for a rectangle. Hover a column border and the cursor becomes a resize grip; hover the edge of a selection and you'll find the little fill square — drag it and the selection's values copy along your drag, numbers continuing their sequence. Undo after any of this and exactly one gesture unwinds.

Add and remove rows and columns from the ruler's handles or the exported commands (`addRowAfter`, `addColumnBefore`, `deleteColumn`, and friends). Drag a ruler handle to move a whole row or column; every formula that mentions them still works afterwards, because nothing in this plugin ever refers to anything by position.

## Naming the table

The fat top ruler carries one special affordance: **make this the header row**. Use it on your first row and three things happen in one stroke: the row slides into a real `<thead>`, its cells become `<th scope="col">`, and the A B C ruler shrinks to a slim handle strip — the letters retire because your own words now name the columns. The same works sideways: mark a column as the row headers and its cells become `<th scope="row">`, the 1 2 3 numbers giving way to your row names.

Headers edit like any cell — click selects the column, Enter dives into the text. A header's context menu offers **Short name**: a compact label (stored as the standard `abbr` attribute) that formulas use when the full header is long. Screen readers announce the same short name at every cell — what a formula calls your column and what a blind reader hears are the same word, from the same attribute.

Rename a header at any time. Every formula referencing it rewrites itself in the same undo step — rename in a table works the way rename works in an IDE, not the way it breaks in a spreadsheet.

## Formulas

Type `=` as a cell's first character and you're writing a formula: `=SUM(Price)`. Settle it, and the cell shows `42` — the computed value, recomputed automatically whenever any Price cell changes, always in the same transaction that changed it. The document is never observably stale, and undoing a price change un-computes the sum with it, atomically.

References are names, never coordinates: a column (`Price`), a row (`Q1`), an intersection (`Price[Q1]`), a slice (`Price[Q1:Q3]`). Group headers name unions — a spanning `2025` over Jan/Feb/Mar makes `=SUM(2025)` legal — and if your table has several `<tbody>` sections, each section's header names a partition: `=SUM(Price[Archived])`. Insert rows, move columns, sort by hand: every reference survives, because names don't live at addresses.

Editing a formula cell shows you the formula; the grid shows the value. Typing plain text over a formula cell replaces the formula — a cell is a standing value or a formula, never confusingly both. When a formula can't deliver — an unknown name, a deleted column, division by zero, a circular reference — the cell holds a frank error value (`#NAME?`, `#REF?`, `#DIV/0!`, `#CYCLE!`) that propagates to its dependents and serializes honestly: even your broken tables tell the truth.

The function set is small and pure: `SUM`, `AVG`, `MIN`, `MAX`, `COUNT` to start. No `NOW()`, no `RAND()` — nothing whose value changes behind your document's back.

## Values and formats

Give a column a type from its header menu: number, currency, date, text. Typed cells parse what you write — type `1234,56` in an Italian document's currency column and settle: the cell reads `€ 1.234,56`. The number you meant is stored on the cell, machine-readable; the text your readers see is real content. Formatting follows your document's `lang` and the platform's own `Intl` — no locale tables ship with this plugin.

What refuses to parse is refused at the seam: settle "abc" into a number column and you're told, not silently miscounted. Formulas always compute on the stored values — never on the display text — so `SUM` over a currency column is exact regardless of how it's dressed.

## The markup you get

Copy any table from your editor, or serialize your document, and this is what leaves:

```html
<table lang="it">
  <caption>Vendite 2025</caption>
  <thead>
    <tr><th scope="col">Trimestre</th><th scope="col" abbr="Prezzo">Prezzo unitario</th></tr>
  </thead>
  <tbody>
    <tr><th scope="row">Q1</th><td><data value="1234.56">€ 1.234,56</data></td></tr>
    <tr><th scope="row">Q2</th><td><data value="2311.00">€ 2.311,00</data></td></tr>
  </tbody>
  <tfoot>
    <tr><th scope="row">Totale</th><td data-formula="=SUM(Prezzo)"><data value="3545.56">€ 3.545,56</data></td></tr>
  </tfoot>
</table>
```

Read it slowly, because everything is there: regions that mean something, headers that govern their cells, dates wrapped in `<time>` and numbers in `<data>` so scrapers get machine values while humans get prose, formulas riding as provenance on the totals row — and not one style attribute, not one presentational class, not one plugin fingerprint on any plain cell. A screen reader, a search engine, and this plugin's own evaluator all read this table the same way. This markup *is* the product; the editor is how you make it.

## Theming

All presentation lives in one constructed stylesheet, and it's yours to bend with CSS custom properties: `--spreads-selection`, `--spreads-grid-line`, `--spreads-editing-glow`, and one `--spreads-icon-*` variable per glyph (the default icons are embedded; swap any of them by setting a variable to your own data-URI). The interface's states are ordinary attributes — `[data-selected]`, `[data-editing]`, `[data-purpose]` — so a theme is just CSS: set variables, or select the states directly. A theme that only sets variables restyles everything.

## What's deliberately not here

No merged data cells (spanning *headers* are on the roadmap; merged `td`s are a word-processor habit data tables are better without). No volatile functions. No cross-table references yet. Real-time collaboration is untested territory in this version — single-author documents are the supported case. And positional references like `A1:B3` exist only if you install the optional scaffolding add-on, which upgrades them to real names the moment you name your headers — they're training wheels, and the whole design conspires to take them off.

## What you didn't write

You wrote no CSS, no `role` attributes, no ARIA repair layer, no column-letter bookkeeping, no recalculation ordering, no undo grouping. You typed a table, named its headers because the interface made it the path of least resistance, and shipped markup that passes an accessibility audit, feeds a scraper, and sums its own totals. The good boy's reward turned out to be superpowers.
