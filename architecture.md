# The Architecture

Design decisions descending from [the Tablet](tablet.md). Two layers: **the consequential choices** — the spine, each choice naming its parent principles — and the **working sections** beneath, structured as the complete implementation description even where content is still stub. A stub section states what will live there and holds only its marks; no answer appears before its round has run. Marks: settled / pinned / open, per the Tablet.

## The consequential choices

Carved 2026-07-15, condensing the circled rounds of 2026-07-14/15; the layer's ordering and C2, C5, C11 (and the Tablet's P4) are ratified on briefing — direction, not gospel. The parentage rule is self-auditing: a choice that cannot name its parents is either unjustified or reveals a missing principle. It already found one (P4, the interaction stone). Parent numbers follow the Tablet's 2026-07-15 reorganization.

- **C1 — The document is the sole truth; ProseMirror is the transactional store** (P1) · settled — Everything the table *is* lives in the doc; everything ephemeral — buffers, hovers, drags, selections — lives in the view layer and dies there. Inside tables, ProseMirror is our document engine, not our text editor: cells are atoms with node-view surfaces. The named bet, accepted.
- **C2 — The anatomy is structural** (P2) · settled, ratified on briefing — `thead`, `tbody`, `tfoot`, `caption` are node types, not serialization garnish. Boundaries have editing meaning: moving a row into thead is a promotion, not a reorder. Residue open in the schema section.
- **C3 — Every fact sits in its register's seat** (P3) · settled — Value in element content, automation in attributes, presentation in constructed stylesheets. `<td data-formula="=SUM(Price)">42</td>`; standing cells pristine; the stylesheet is the only presentation channel.
- **C4 — Names come from the content** (P2, P3) · pinned — Scope'd headers name columns and rows; formulas and slices speak those names (`Price[Q1:Q3]`); automation borrows names the content earned, never invents its own. No positional notation exists above the engine room. Test: `=SUM(Price)` resolvable from standard, valid markup alone.
- **C5 — Positions live below deck** (corollary of C4) · settled — Geometry machinery (the map, hit-testing, rectangle resolution) is internal; positions never appear in notation, document, or the user's vocabulary. The resolver translates gestures (positions) into sentences (names).
- **C6 — Two modes, one seam** (P4, C1) · pinned — Grid mode: cells as units, custom selection, the cross cursor. Edit mode: one cell's buffer. Commit is the seam, doing three jobs — mode boundary, evaluation trigger, undo grouping.
- **C7 — The gesture law** (P4; generalizes C6) · pinned — Everything continuous streams in the ephemeral layer; state changes atomically at seams. Cell edits settle as one transaction; drags stream into stylesheet or highlight and settle at pointerup; the pointer's purpose is computed state, the cursor its costume.
- **C8 — Enforcement is declaration-keeping** (P3, P5) · settled — The engine makes the document's declarations true: on settle, dirty-mark from the changed cell, evaluate topologically over a graph whose nodes include the names, all in one dispatch. Synchronous, bounded, no volatiles, cycles are errors. The cascade rides the settle — one atomic state event, side effects included (Egildo's economy ruling).
- **C9 — Errors are values** (P2, C8) · settled — Failure occupies the cell, propagates through dependents, and serializes: the markup admits what broke. Two validation species kept apart: resolution errors (automation failing) and data validation (content violating declared expectations).
- **C10 — Collab bends, doctrine doesn't** (C8) · settled as ruling — Cell-wise atomicity is accepted over collaborative perfection; the mitigation — recompute rides the originating transaction — stays pinned until proven.
- **C11 — Semantics are rewarded, not required** (P2, P5) · proposed, unruled — An anonymous table is a fine table; it simply has no names, so no formulas. Mark your headers and a spreadsheet wakes up inside. Awaiting Egildo's ruling.
- **C12 — Everything is a command** (P1) · settled (Egildo, 2026-07-15) — Every mutation — add/delete rows and columns, promote/demote across regions, settle a cell, rename — is a ProseMirror command: `(state, dispatch) => boolean`, composable, keybindable, dry-runnable (call without dispatch to ask "would this apply?" — menu enabling for free), testable headless. UI never mutates; buttons, gestures, and keys only *invoke* commands. The command vocabulary is the plugin's verb list — the manual's chapters will speak these names.
- **C13 — The view is downstream** (C1, C12) · settled (Egildo, 2026-07-15) — Everything is a consequence of document changes: command → transaction → doc → derived indexes → node views. Node views are renderers and input surfaces, never truth-holders: their ephemeral state (edit buffers, hover purpose) becomes real only by dispatching through the front door. A node view that makes decisions is a smell; all intelligence lives in plugin state and pure functions, so the rich node-view complexity ahead (Egildo's sense, shared) stays bounded by thinness.

## 1 · Document schema

What a table *is* in the ProseMirror document: node types, content expressions, attributes.

- **Schema anatomy, the residue** · open — The headline settled as C2: anatomy is structural. Remaining: `colgroup`/`col` handling, `caption` details, exact content expressions, and how much the incumbent's flat machinery (`prosemirror-tables`: `table > table_row > table_cell/table_header`) teaches us about commands over region-aware structure. The spec is kind in one place: cells cannot span across row-group boundaries, so the nastiest geometry case is illegal by definition.
- **Computed-cell serialization** · settled as shape, open in detail — `<td data-formula="=SUM(Price)">42</td>`. Standing cells stay pristine — `<td>12</td>`, zero plugin fingerprints; automation markup appears only where automation exists. Open in detail: the attribute's name (one `data-formula`, or a family of automation attributes as P5 grows), and the parked `<output for>` glimpse (§7).
- **Cell content: scalar vs inline markup** · open — Settle-on-commit (§8) pins to scalar cells (text / number / formula, one line). P2's beautiful `<td>` sometimes carries a link, `<code>`, `<abbr>`; the day a cell legitimately needs inline markup, the settle-on-commit design comes back up rather than getting a workaround.
- **Merged cells** · open, instinct recorded — v1 forbids merged data cells (data tables barely need them); spanning headers (`scope="colgroup"`/`"rowgroup"`) wait for their own round.

## 2 · The engine room — derived indexes

No stored model, ever (C1 descended): the node tree is the structure; the engine room holds **indexes — derived, disposable, rebuilt on demand**. A stored cell-object model would recreate the two-truths problem inside the plugin.

- **The grid map** · pinned — A flat array of width × height slots, each holding the document position of the covering cell; a spanning cell occupies multiple slots. Every 2D question becomes index arithmetic: cell at (r,c), the cells of a column, rectangle resolution. This is the incumbent's `TableMap` shape — proven furniture, stolen whole. Test: map answers are correct on tables with spanning header cells.
- **Memoized by node identity** · pinned — ProseMirror nodes are persistent: an unchanged table is the same object across doc versions, so indexes cache in a WeakMap keyed by the table node. No invalidation logic; every historical doc version can produce its correct map, so undo/redo/collab work on indexes for free. Rebuild is O(cells) — nothing at data-table scale; incremental maps are a deferred optimization with a known shape (same posture as Excel's chain reordering).
- **The name table and dependency graph** · pinned — Names → cell sets (from scope'd headers); formula cells → name nodes (§5). Derived and memoized the same way.
- **Structural operations are document surgery** · settled — Insert row/column: a transaction inserting nodes (references survive by C4 — no formula rewrites; the range node's membership grows). Promotion into thead/tfoot: move the `tr` across the boundary, retype `td ↔ th` with scope, one transaction. Indexes never participate; they rebuild after. The hard consequences are semantic (names minted or orphaned), not structural — seated in the naming round (§7).

## 3 · Plugin state

What the plugin's own state holds — and what it refuses to hold (anything derivable belongs to §2; anything ephemeral belongs to the view layer).

- **Formula as attribute, value as content** · settled (2026-07-14, circled) — The formula is automation (Tablet P3) and lives in an attribute; the `<td>` contains the computed value as real content. The document tells the truth twice: content is the data — readers, scrapers, screen readers get `42` — and the attribute is the provenance. Supersedes the coach's decoration-based cut (formula as content, value doc-external), which lost because serialized output would have shown formulas where readers wanted data. Rhyme, read as evidence: XLSX stores formula plus cached value for the same reasons.
- **Enforcement seats in `appendTransaction`** · pinned — The plugin's job is to make the document's declarations true: any transaction touching cells that others depend on gets its dependents recomputed in the same dispatch. Test: after any single user action, no observable editor state shows a formula cell disagreeing with its inputs.
- **Stale-value rule** · pinned — When a document parses cold and a value disagrees with its formula, the formula wins; the value is cache. Test: loading fixture HTML with a stale cached value recomputes it without touching anything else.
- **The state model: cell-wise atomic updates with cascade** · settled (2026-07-15, Egildo's ruling) — The unit of state change is the settle: one cell's atomic update plus the side effects on cells affected by the automations it triggers, all in one dispatch. Collaborative-editing complications accepted as a known cost (§11).
- **To verify — unverified, nothing may lean on these yet** · open — (a) prosemirror-history groups appended transactions with their trigger into one undo event (undoing a price change must un-recompute the dependent SUM in the same undo); (b) recompute cascade edges: transitive dependents, cycle detection; (c) paste into a computed cell.
- **Stub** — grid-selection state (custom selection class vs plugin state), mode field, dirty bookkeeping: seated here when the first probe and the selection round land.

## 4 · Commands — the verb list

Every mutation is a command (C12); this list is the plugin's public verbs and the manual's future vocabulary. Sketch, unbaptized — names await their christening round:

- Structure: add/delete row and column (before/after), move row/column.
- Regions: promote row to thead / demote; promote to tfoot; make a column the row headers.
- Cells: settle (the one seam); demote formula cell to standing value; merge/split (deferred with §1's merged-cells question).
- Selection & navigation: select row / column / table; arrow-walk in grid mode; enter/leave edit mode.
- **Stub** — signatures, applicability rules (dry-run semantics), and keymap live here after the schema residue round.

## 5 · Evaluation & validation

How declarations become true, and what happens when they can't. Surveyed 2026-07-15 — sources read, not remembered: Microsoft's Excel recalculation documentation; HyperFormula's dependency-graph model.

- **The evaluation model** · pinned — A dependency graph built from formulas' resolved references, with named ranges (columns, rows) as first-class graph nodes — HyperFormula's range-node insight, which our semantic addressing makes natural: a formula depends on the *name*, member cells feed the name, and membership changes (a row inserted) dirty the range node while references stay whole under reorder. On settle: mark dirty from the settled cell, evaluate dirty cells in topological order, within the settle's dispatch. Excel's three stages (dependency tree → calculation chain → dirty marking → recalc in chain order) confirm the shape; its lazy chain reordering is an optimization deferred until a real table needs it. Test: a settle leaves no observable inconsistency, and evaluation visits each dirty cell exactly once.
- **Cycles are errors, not iterations** · settled — Circular dependency detected at settle produces an error value; no iterative-calculation mode. Excel ships one, deliberately; economy says no.
- **No volatile functions in v1** · settled — Functions are pure over cell values. Volatiles (NOW, RAND, OFFSET…) are poison under settle-only recompute — nothing would ever re-trigger them. Reopening this requires designing a recompute trigger first.
- **Evaluation is synchronous and bounded** · settled — It runs in the dispatch path (`appendTransaction`); no async automations in the enforcement path, ever. Excel's async-UDF machinery (suspend, continue, extra recalc pass) shows exactly what we're declining. Async work, if it comes, computes outside and dispatches a settle.
- **Errors are values** · settled — A failed formula's result is a typed error value that occupies the cell and propagates through dependents (the classic taxonomy: unknown name, dangling reference, type mismatch, division by zero, cycle). Errors are content — serialization truth extends to failure. **Error markup** · open — what an error looks like in beautiful semantic HTML is its own small P2 round.
- **Two species of validation, kept apart** · pinned — *Resolution errors* (the automation's own failures, above) versus *data validation* (standing values violating declared expectations — "impossible values"). Spreadsheets silently skip text inside SUM — a data-corruption trap we refuse to inherit. Glimpse, parked: columns declaring a type in the automation register, making validation one more declaration the plugin keeps true.
- **Adopt vs build** · open — HyperFormula is real prior art with adoptable graph furniture, but its addressing is A1-grid; our semantic addressing doesn't map directly. Likely: build a small evaluator, steal the graph shape. Decide when the frontier's first probe runs.

## 6 · Formula language

**Stub** — the grammar (operators, literals, name references, slices `Price[Q1:Q3]`, intersections), the function library and its growth rule, and name lexing rules. Waits on the frontier's first probe and the naming round (§7).

## 7 · Ranges, names & the frontier

The frontier (Tablet P5): how names bind, resolve, and survive edits.

- **Ranges ride HTML header semantics** · pinned — carved as C4, where the test lives (`=SUM(Price)` resolvable from standard, valid markup alone).
- **The naming round, promoted from housekeeping** · open — duplicates within an axis, empty th, case and whitespace, and rename propagation (settle-on-commit gives the boundary where a th edit can rewrite references that pointed at it — IDE-grade rename, falling out of machinery built for other reasons). Names are load-bearing; this round is structural.
- **Parked glimpses** — `<output>` (with its `for` attribute naming contributing elements) as the semantic wrapper for computed values; addressing as a citizen of the automation register rather than a fourth register. Both sniffed 2026-07-14, neither ruled.
- Everything else here is unexplored by design; sketches happen in the playground and graduate only by surviving.

## 8 · Interaction layer

Spreadsheet-grade editing (P4) — modes, gestures, selection.

- **Settle-on-commit** · pinned (2026-07-14) — Cell edits settle as single transactions at commit (Enter / Tab / focus leaving the cell); mid-edit text is node-view-owned UI state, invisible to the document — "like somebody pasted a few chars". The edit buffer shows the formula for formula cells, the value for standing cells. What this buys, named because it was argued: native IME (a plain input, ProseMirror never involved), cell-granular collaboration, one undo event per settle, and the death of cross-cell text selection (a word-processor hideousness, replaced by grid selection). Test: pinned to scalar cells — see §1's open cell-content question.
- **Grid and edit modes** · pinned — Grid mode treats cells as units (arrow keys walk cells, selection is grid selection); edit mode is a caret inside one cell's buffer. Commit is the seam, doing three jobs at once: mode boundary, evaluation trigger, undo grouping.
- **The purpose model** · pinned (2026-07-15) — Nobody sets a cursor. The plugin computes the pointer's *purpose* — what a pointerdown would mean here, now — as a pure function `(mode, zone, modifiers) → purpose`, testable headless. Zones come from hit-testing (closest cell plus rect edges; the engine-room map disambiguates colspans). The cursor is the purpose's costume: `data-purpose` on the node-view wrapper, mapped to `cursor:` in the constructed stylesheet — CSS natively ships `cursor: cell`, `col-resize`, `row-resize`. Purpose changes only on zone transitions (hysteresis); hover state is ephemeral view-layer state — never document content, never per-mousemove transactions. Open: view-local variable vs plugin-state mirror — playground-probe territory.
- **The gesture law** · pinned (2026-07-15) — Every gesture is continuous in the ephemeral layer and atomic at the seam: `setPointerCapture` owns the drag, feedback streams without transactions (column resize streams into the constructed stylesheet via `replaceSync`), one settle at pointerup. Settle-on-commit, generalized from cell edits to all gestures.
- **Selection model** · stub — grid selection as a custom Selection class (the incumbent's `CellSelection` is prior art to study); headers double as selection gutters (click the `Price` th → column selects); the resolver translates selection rectangles into names when a formula is being built. Waits on the semantic-selection UX campaign.
- **Value XOR formula** · open (Egildo's mark: "we'll see") — A cell is a standing value or a formula, never both. If ruled in: typing into a formula cell either enters formula editing or demotes the cell to a standing value (attribute removed, one transaction) — Excel's behavior, derived from our doctrine rather than copied. Held loosely until pressed.
- **Semantic-selection UX campaign** · open — The model is sound (selection is a gesture in positions; a reference is a sentence in names), the gestures are unproven, and a mixed UI approach is expected (Egildo, 2026-07-15). Needs its own exploration campaign on the playground.

## 9 · Node views

The custom editing surface — where the named bet lives, and the only region of the plugin not testable headless.

- **The named bet** · pinned (audit, 2026-07-15; Egildo accepted) — Grid-mode cells as atoms with node-view-owned edit buffers means ProseMirror is our transactional document store, not our text editor, inside tables. Legitimate, documented machinery (atoms, node views, custom selection classes) — but the incumbent chose the opposite, and everything leans on this. The dragon: the focus dance, and node views surviving redraws mid-edit (a remote change to a *neighboring* cell must not destroy the buffer). Cheap to test, expensive to be wrong: **first playground probe**.
- **Thinness discipline** · settled (C13) — Node views render consequences and host input surfaces; all intelligence lives in plugin state and pure functions. A node view that makes decisions is a smell.
- **Stub** — the wrapper's anatomy (edit buffer, overlay layer for drag guides and drop indicators, adopted stylesheet handle), `update()` contracts for surviving redraws, `stopEvent`/`ignoreMutation` policy. Filled by the first probe's findings.

## 10 · Presentation layer

The one channel (C3): a constructed stylesheet, and the vocabulary it selects on.

- **Constructed stylesheets as the one presentation channel** · pinned — a `CSSStyleSheet` owned by the plugin view, updated via `replaceSync`, adopted by the document. Test: the emitted markup of any table contains zero presentational attributes, styles, or classes, and the table still renders styled.
- **The stage-makeup distinction** · settled (2026-07-15) — The rendered DOM is not the document: emission comes from serializing the doc, never from scraping the editor's DOM, so render-time marks (decorations' attributes) never reach the output. P3's promise binds the *content*; the working surface may wear what it needs.
- **Structure selects itself** · settled — The anatomy and the document's own attributes are styling hooks: `thead tr`, `th[scope="row"]`, `[data-formula]`. Selectors *reading* content and automation registers is legitimate — P3 forbids presentation data in content, not presentation selectors over it. The incumbent fakes with classes what our honest DOM answers natively.
- **The interface state vocabulary** · pinned (2026-07-15) — Attributes with values, not class swarms; a small enumerated vocabulary, each entry naming its owner. *Document-borne* (serialized, already exist): anatomy elements, `scope`, `data-formula`, the future error mark. *Decoration-borne* (plugin state → decorations → rendered DOM, never serialized): `data-selected` on cells and on whole rows (values distinguish anchor from member), `data-editing` on the cell in edit mode. *Wrapper-borne* (node-view-owned, ephemeral): `data-mode`, `data-purpose`; drag feedback (resize guide, drop indicator) as wrapper-owned overlay elements that never touch cells. Exact names and values await their christening round.
- **The vocabulary is public API** · pinned — Theme authors select on these attributes; they deserve the same naming care as command names. Theming knobs ride CSS custom properties (selection color, grid-line weight, edit glow…) so consumers restyle by setting variables, not by fighting selectors. Test: a theme that only sets custom properties can restyle every interface state.
- **Column width ownership** · open, promoted (2026-07-15) — Content or presentation? The incumbent stores `colwidth` in the document; the registers (P3) say widths are presentation and belong to the stylesheet — but a user dragging a column edge feels like they're editing *their table*: does a width undo? First place P3 meets reality, and resize mechanics (the gesture law's settle at pointerup) sit blocked behind it. Deserves its own round soon.
- **Icons are presentation** · pinned (2026-07-15) — A glyph is its command's costume, as the cursor is the purpose's: meaning lives in the command and its `aria-label`; the icon is decoration (`aria-hidden`), delivered through the one channel. Each glyph is an SVG data-URI in a CSS custom property (`--spreads-icon-*`), applied via `mask-image` on the wrapper-owned affordance elements, painting with `currentColor` — dark mode and theme colors come free. Test: an icon-only button is never icon-only in the accessibility tree.
- **The icon set is switchable because the theme API already is** · pinned — Consumers swap one glyph or the whole set by overriding custom properties; an optional `icons` plugin option merges overrides at sheet construction but lands in the same variables — one mechanism, two entrances. A "theme" for spreads is a bag of variables: colors, cursors, glyphs.
- **Default set** · settled as direction — a curated subset (~10 glyphs: add row/column, delete, drag grip, promote-to-header, error mark, chevron; the `fx` badge likely styled text, no drawing needed) adopted from Lucide (permissive ISC — license verified at adoption), embedded as data URIs in the default sheet: zero runtime dependency. A bespoke set can arrive later as just another theme.
- **The christening round's cargo grows** · open — command names, attribute names and values, icon names, and their human-readable labels (the localization surface) all want baptizing together.
- **Parked glimpse** — the CSS Custom Highlight API paints ranges with no DOM marks at all; wrong shape for cell rectangles, worth remembering for in-cell text painting (find-and-replace).

## 11 · Serialization, clipboard, export

The document's borders: parsing in, emitting out, and the clipboard between.

- **Emission is pristine** · pinned — serializing any table yields markup satisfying P2 and C3's tests (semantic, valid, zero presentation). The stale-value rule (§3) governs parsing cold HTML.
- **Clipboard carries semantics** · stub — copying cells yields a real HTML `<table>` fragment (values in content, formulas in attributes — both survive by C3); paste into a computed cell is a to-verify item (§3). Cross-application behavior (Excel, Sheets) unexplored.
- **Export is not the document** · open (audit finding, 2026-07-15) — P3 keeps presentation out of the document, and constructed stylesheets don't serialize: that's the principle working, not failing. But "copy this beautiful table into an email" then ships bare markup. Whether a deliberate export *bundles* presentation as a separate artifact is a new question, distinct from P3.

## 12 · Collaboration

The accepted debt (C10), gathered in one place.

- **Recompute rides the originating transaction** · pinned, to verify — Only the client whose settle triggered a change appends the recompute; remote transactions arrive already-consistent, receivers enforce nothing they didn't cause. Believed to hold under prosemirror-collab rebasing; unproven.
- **Stub** — mid-edit remote changes to the *same* cell (buffer vs incoming value), presence (who's editing which cell), and whether cell-granular collab needs any protocol beyond vanilla prosemirror-collab. Waits until collab is a real requirement; v1 is single-user by economy.

## 13 · Testing map

Where each part gets pressed (method: suite green throughout, playground clicked live where observable).

- **Everything is headless-testable except §9** · settled — maps, resolver, evaluator, commands, the purpose function: pure functions and state transitions, tested against `EditorState` with no browser. The single browser-bound region is precisely the named bet — which is why the first probe aims there.
- **Stub** — fixture conventions for parse/serialize round-trips, and how the interaction layer gets pressed by hands (the UX campaign's ritual). Both wait on their rounds.
