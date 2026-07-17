# prosemirror-spreads

A ProseMirror plugin that makes tables two things at once: beautiful semantic HTML table markup, and a lil spreadsheet. In active development — pre-release, pre-christening; APIs and names are proposals until they survive.

The document is the sole truth: cells are atoms with node-view-owned edit buffers, every mutation is a ProseMirror command, and the emitted markup is the product — real `thead`/`tbody`/`tfoot`, scoped headers, formulas riding as `data-formula` attributes over computed values in content, zero presentational junk. Styling arrives only through a constructed stylesheet the plugin owns.

## What works today

- **The grid**: insert tables (bare tbody, or with a `scope="col"` header row), click-select cells, type-to-replace, Enter/double-click to edit in a native input, Enter/Tab/Escape/blur seams, arrow and Tab walking, one undo step per settle.
- **Formulas**: `=SUM(Prezzo)` over named columns and rows (names come from `th scope` + `abbr`, per the HTML spec's header-association algorithm), intersections (`Prezzo[Q1]`), arithmetic, `SUM/AVG/MIN/MAX/COUNT`. A name denotes its tbody cells — the tfoot total never contains itself. Recompute rides the same transaction as the change that dirtied it; errors are values (`#NAME?`, `#CYCLE!`, `#DIV/0!`, `#VALUE!`) that occupy cells and serialize honestly.
- **Emission**: serialized tables carry no plugin fingerprints — a standing cell is `<td>42</td>`, a computed cell is `<td data-formula="=SUM(Prezzo)">40</td>`, and that's all.

## The documents

The venue runs on working documents, not memory: [method.md](method.md) is the process; [tablet.md](tablet.md) holds the founding principles; [architecture.md](architecture.md) the design decisions with their marks (settled / pinned / open); [manual.md](manual.md) the mock manual — the software described as if shipped, so reality has something precise to disagree with; [CHANGELOG.md](CHANGELOG.md) the past (what / because / instead-of). Read them in that order to understand anything here.

## Layout

- `src/index.ts` — the plugin. This is the package: what `prosemirror-spreads` exports is exactly what this file exports.
- `playground/` — a Vite app for poking at the plugin in a real editor. It imports `prosemirror-spreads` by name, aliased to `src/`, so playground code reads like a consumer's and edits to the plugin hot-reload instantly. The right panel shows the live editor state (selection, plugin state, doc) after every transaction.
- `test/` — Vitest suite. Headless against `EditorState`; parse/serialize round-trip tests opt into jsdom per file. Same alias, so tests import the package by name too.
- `dist/` — build output (generated, ignored).

## Commands

- `pnpm dev` — playground at http://localhost:5173
- `pnpm test` / `pnpm test:watch` — run the suite
- `pnpm typecheck` — `tsc --noEmit` over src, playground, and tests
- `pnpm build` — bundle the library to `dist/` with tsdown (ESM + type declarations)

## Notes

- **Plugin order matters**: `...spreads()` goes before any keymap that binds keys meaningful in grid mode (Enter, Tab, Backspace, arrows) — plugin order is ProseMirror's priority system, and a preceding `baseKeymap` will delete a selected cell instead of clearing it. The manual's setup shows the safe order.
- ProseMirror core packages (`prosemirror-model`, `prosemirror-state`, `prosemirror-view`) are peer dependencies; the consumer's editor owns them. They are also dev dependencies so the playground and tests run here.
- TypeScript 7 (the native compiler) does the typechecking; tsdown builds the bundle because tsup's d.ts generation needs the old TS 5 JS API.
- Development happens in battlegrounds — branches where the design meets reality; lessons reconcile into the documents and main. See method.md.
