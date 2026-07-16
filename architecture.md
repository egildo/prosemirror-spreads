# The Architecture — second edition

Design decisions descending from [the Tablet](tablet.md). Two layers: **the consequential choices** — the spine, each naming its parent principles — and the **working sections**, organized along the seam map and structured as the complete implementation description even where content is still stub. Marks: settled / pinned / open, per the Tablet; depth annotations (circled / ratified on briefing / proposed, unruled) record how deep the round was that produced each claim. Nothing here has met code yet; the marks say so and the rewrite keeps them saying so. First edition's accretion history lives in the changelog (edition note, 2026-07-15).

**The seam map.** Four seams, declared so no round welds across one: **the factory** (schema, §1), **the core** (engine, state, commands, interaction, node views, §2–§6), **the chrome** (presentation, rulers, icons, §7), **the frontier** (names, formula language, evaluation, §8–§10), plus **the borders** (serialization, collaboration, testing, §11–§13). The classic failure the map guards against: the core quietly importing the evaluator. Whether the seams become separately installable plugins is C15's open round.

## The consequential choices

Condensed from the circled rounds of 2026-07-14/15; the layer's ordering and C2, C5, C11 (and the Tablet's P4) are ratified on briefing — direction, not gospel. The parentage rule is self-auditing: a choice that cannot name its parents is either unjustified or reveals a missing principle (it found P4).

- **C1 — The document is the sole truth; ProseMirror is the transactional store** (P1) · settled — Everything the table *is* lives in the doc; everything ephemeral — buffers, hovers, drags, selections — lives in the view layer and dies there. Inside tables, ProseMirror is our document engine, not our text editor: cells are atoms with node-view surfaces. The named bet, accepted.
- **C2 — The anatomy is structural** (P2) · settled, ratified on briefing — `thead`, `tbody`, `tfoot`, `caption` are node types, not serialization garnish. Boundaries have editing meaning: moving a row into thead is a promotion, not a reorder.
- **C3 — Every fact sits in its register's seat** (P3) · settled — Value in element content, automation in attributes, presentation in constructed stylesheets. `<td data-formula="=SUM(Price)">42</td>`; standing cells pristine; the stylesheet is the only presentation channel.
- **C4 — Names come from the content** (P2, P3) · pinned — Scope'd headers name columns and rows; formulas and slices speak those names; automation borrows names the content earned, never invents its own. No positional notation exists above the engine room. Test: `=SUM(Price)` resolvable from standard, valid markup alone.
- **C5 — Positions live below deck** (corollary of C4) · settled — Geometry machinery is internal; positions never appear in notation, document, or the user's vocabulary. The resolver translates gestures (positions) into sentences (names).
- **C6 — Two modes, one seam** (P4, C1) · pinned — Grid mode: cells as units, custom selection, the cross cursor. Edit mode: one cell's buffer. Commit is the seam, doing three jobs — mode boundary, evaluation trigger, undo grouping.
- **C7 — The gesture law** (P4; generalizes C6) · pinned — Everything continuous streams in the ephemeral layer; state changes atomically at seams. Cell edits settle as one transaction; drags stream and settle at pointerup; the pointer's purpose is computed state, the cursor its costume.
- **C8 — Enforcement is declaration-keeping, with two duties** (P3, P5) · settled; second duty added from the incumbent survey, 2026-07-15 — The engine makes the document true in both registers: it keeps the **shape legal** (structural normalization — ragged rows, colliding spans, wreckage from paste and collab repair into legal anatomy; the incumbent's `fixTables` proves the duty and the seat) and it keeps the **declarations true** (on settle: dirty-mark, evaluate topologically over the name graph, one dispatch — synchronous, bounded, no volatiles, cycles are errors). Both duties seat in `appendTransaction`; the cascade rides the settle (Egildo's economy ruling).
- **C9 — Errors are values** (P2, C8) · settled — Failure occupies the cell, propagates through dependents, and serializes: the markup admits what broke. Two validation species kept apart: resolution errors (automation failing) and data validation (content violating declared expectations).
- **C10 — Collab bends, doctrine doesn't** (C8) · settled as ruling — Cell-wise atomicity is accepted over collaborative perfection; the mitigation — recompute rides the originating transaction — stays pinned until proven.
- **C11 — Semantics are rewarded, not required** (P2, P5) · proposed, unruled — An anonymous table is a fine table; it simply has no names, so no formulas. Mark your headers and a spreadsheet wakes up inside. Standing evidence: the rulers design leans on it and makes the incentive visible — the fat ruler is the face of an unnamed table. Awaiting Egildo's ruling.
- **C12 — Everything is a command** (P1) · settled (Egildo) — Every mutation is a ProseMirror command: composable, keybindable, dry-runnable (call without dispatch — menu enabling for free), testable headless. UI never mutates; it invokes. The command vocabulary is the plugin's verb list and the manual's future words.
- **C13 — The view is downstream** (C1, C12) · settled (Egildo) — command → transaction → doc → derived indexes → node views. Node views are renderers and input surfaces, never truth-holders; their ephemeral state becomes real only by dispatching through the front door. A node view that makes decisions is a smell.
- **C14 — The spec is the contract: ceiling, never floor** (P2, C2, C4) · settled (Egildo) — The full HTML table model is in scope: `caption`, `colgroup`/`col`, `thead`, multiple `tbody` row groups, `tfoot`, all four `scope` values, `headers` overrides; the resolver implements the spec's header-association algorithm, so formulas and assistive tech read the same table by construction. **Supported is never required** (Egildo's guard): the bare-tbody table is first-class; capability grows monotonically with markup — never a cliff. Survey duty standing: the association algorithm's text gets read before the resolver round. Test: every command except formula-entry applies to a table with zero named columns and rows.
- **C15 — The seams may become packages** (C11, C14; incumbent survey) · proposed, unruled — The incumbent survived a decade as a family (core plugin + optional plugins + schema factory), not a monolith. Our capability gradient suggests the same shape: factory + core + chrome + frontier as separately installable capabilities, making C11 true at the package level. Nothing settled binds across a seam yet; its own round before anything does.

---

## The factory

### 1 · Document schema

What a table *is* in the ProseMirror document.

- **The node set** · settled (C2, C14) — `caption`, `colgroup`/`col`, `thead`, `tbody` (repeatable — row groups are real structure), `tfoot`, rows, `td`/`th`. Content expressions make everything beyond `tbody+` optional — `caption? colgroup* thead? tbody+ tfoot?` — so the bare-tbody table is first-class (C14's floor).
- **The schema is a factory** · pinned (incumbent survey, 2026-07-15) — Consumers have schemas we've never seen; node specs are generated by a function (the incumbent's `tableNodes(options)` posture) and located by role-based lookup (its `tableRole` pattern), never by hardcoded type names. The proven integration seam for living inside a host schema.
- **Computed-cell serialization** · settled as shape, open in detail — `<td data-formula="=SUM(Price)">42</td>`; standing cells pristine, zero plugin fingerprints. Open: the attribute's name (one `data-formula`, or a family as P5 grows), and the parked `<output for>` glimpse (§8).
- **Cell content: scalar vs inline markup** · open — Settle-on-commit (§5) pins to scalar cells. P2's beautiful `<td>` sometimes carries a link, `<code>`, `<abbr>`; the day a cell legitimately needs inline markup, the design comes back up rather than getting a workaround.
- **Merged cells** · open, instinct recorded — v1 forbids merged data cells; spanning headers (`scope="colgroup"`/`"rowgroup"`) wait for their own round.
- **Residue** · open — Exact content expressions; span constraints (one grouping level each way; cells cannot span across row-group boundaries — the spec forbids the nastiest geometry case); `caption` details.

## The core

### 2 · The engine room — derived indexes

No stored model, ever (C1 descended): the node tree is the structure; the engine room holds indexes — derived, disposable, rebuilt on demand. A stored cell-object model would recreate the two-truths problem inside the plugin.

- **The grid map** · pinned — A flat width × height slot array holding the document position of each covering cell; spanning cells occupy multiple slots. Every 2D question becomes index arithmetic. The incumbent's `TableMap` shape, stolen whole — including its **problems array** (survey, 2026-07-15): the map diagnoses structural illegality (collisions, missing cells, overlong spans) as a by-product of the geometry pass, feeding C8's normalization duty. Test: map answers are correct on tables with spanning header cells.
- **Memoized by node identity** · pinned — Persistent nodes make an unchanged table the same object across doc versions; indexes cache in a WeakMap keyed by the table node (the incumbent's exact mechanism, verified in source). No invalidation logic; every historical doc version produces its correct map, so undo/redo/collab work on indexes for free. Rebuild is O(cells); incremental maps are a deferred optimization with a known shape.
- **The name table and dependency graph** · pinned — Names → cell sets (from scope'd headers, via the association algorithm, C14); formula cells → name nodes; group names contain member-name nodes (§10). Derived and memoized the same way.
- **Structural operations are document surgery** · settled — Insert row/column: a transaction inserting nodes; references survive by C4 (the range node's membership grows — no formula rewrites). Promotion into thead/tfoot: move the `tr` across the boundary, retype `td ↔ th` with scope, one transaction. Indexes never participate; they rebuild after. The hard consequences are semantic (names minted or orphaned) — seated in the naming round (§8).

### 3 · Plugin state & enforcement

What the plugin's own state holds — and refuses to hold (derivables belong to §2; ephemera to the view layer).

- **Formula as attribute, value as content** · settled (2026-07-14, circled) — The formula is automation (Tablet P3) in an attribute; the `<td>` contains the computed value as real content. Content is the data — readers, scrapers, screen readers get `42`; the attribute is the provenance. Supersedes the coach's decoration-based cut, which lost because serialized output would have shown formulas where readers wanted data. Rhyme as evidence: XLSX stores formula plus cached value for the same reasons.
- **Enforcement seats in `appendTransaction`, both duties** · pinned (C8) — Shape kept legal (normalization: the fixTables analog, ours harder — "legal" includes regions) and declarations kept true (recompute of dependents in the same dispatch). Test: after any single user action, no observable editor state shows an illegal table or a formula cell disagreeing with its inputs.
- **Stale-value rule** · pinned — A cold-parsed value disagreeing with its formula loses; the value is cache. Test: loading fixture HTML with a stale cached value recomputes it without touching anything else.
- **The state model: cell-wise atomic updates with cascade** · settled (2026-07-15, Egildo's ruling) — The unit of state change is the settle: one cell's atomic update plus automation side effects, one dispatch. Collab complications accepted as known cost (§12).
- **To verify — nothing may lean on these yet** · open — (a) prosemirror-history groups appended transactions with their trigger into one undo event; (b) recompute cascade edges: transitive dependents, cycle detection; (c) paste into a computed cell.
- **Stub** — grid-selection state, mode field, dirty bookkeeping: seated when the first probe and the selection round land.

### 4 · Commands — the verb list

Every mutation is a command (C12); this list is the plugin's public verbs. Sketch, unbaptized — names await the christening round:

- Structure: add/delete row and column (before/after), move row/column.
- Regions: promote row to thead / demote; promote to tfoot; make a column the row headers.
- Cells: settle (the one seam); demote formula cell to standing value; merge/split (deferred with §1's merged-cells question).
- Selection & navigation: select row / column / table; arrow-walk in grid mode; enter/leave edit mode.
- **Stub** — signatures, applicability rules, keymap: after the schema residue round.

### 5 · Interaction layer

Spreadsheet-grade editing (P4) — modes, gestures, selection.

- **Settle-on-commit** · pinned (2026-07-14) — Cell edits settle as single transactions at commit (Enter / Tab / focus leaving); mid-edit text is node-view-owned UI state — "like somebody pasted a few chars". The buffer shows the formula for formula cells, the value for standing cells. What it buys, named because argued: native IME, cell-granular collaboration, one undo event per settle, and the death of cross-cell text selection (a word-processor hideousness, replaced by grid selection). Pinned to scalar cells (§1).
- **Grid and edit modes** · pinned — Grid mode: cells as units, arrow keys walk cells. Edit mode: caret inside one cell's buffer. Commit is the seam (C6).
- **The purpose model** · pinned (2026-07-15) — Nobody sets a cursor: the plugin computes the pointer's purpose — what a pointerdown would mean here — as a pure function `(mode, zone, modifiers) → purpose`, testable headless. Zones from hit-testing (closest cell + rect edges; the map disambiguates spans). The cursor is the purpose's costume: `data-purpose` on the wrapper, mapped in the constructed stylesheet (CSS ships `cursor: cell`, `col-resize`, `row-resize`). Purpose changes only on zone transitions; hover state is ephemeral. Open fork: view-local variable vs plugin-state mirror — probe territory; the incumbent chose plugin-state via meta transactions (survey, 2026-07-15), shifting the prior.
- **The gesture law** · pinned (2026-07-15) — Continuous in the ephemeral layer, atomic at the seam: `setPointerCapture` owns drags, feedback streams without transactions (resize streams into the sheet via `replaceSync`), one settle at pointerup. The incumbent's resize independently converged on preview-then-settle (survey) — it just spends per-move meta transactions where we spend none.
- **The rulers — scaffolding that recedes** · pinned (2026-07-15, Egildo's design) — A fresh table wears classic rulers: A B C / 1 2 3, wrapper-owned overlay chrome, sticky, never document content. Labels are **wayfinding, not notation** — no formula can ever speak them; the line that keeps A1-land out. When a thead arrives, th cells inherit the identity duties (label, click-to-select) and the ruler minimises to the mechanical strip (drag, resize grips, context menu, add/delete). Recede is per-column — a letter returns for any empty th; scaffolding is exactly as big as what's still unnamed. The fat ruler carries the promotion affordance: using it is what minimises it. Rows symmetric via `scope="row"`, and may honestly never minimise. Header editing keeps the grid grammar: click selects, Enter/double-click dives.
- **Selection model** · stub — Grid selection as a custom Selection class; the incumbent's `CellSelection` (verified in source: anchor/head cells, rectangular ranges, decoration-drawn, remapping through structure changes) is the pattern to adopt. Headers double as selection gutters; the resolver translates rectangles into names during formula-building. **Mid-drag remote transactions** must remap the drag's anchor — an edge the incumbent explicitly defends in plugin state (survey; thread to §12). Waits on the semantic-selection UX campaign.
- **Value XOR formula** · open (Egildo's mark: "we'll see") — A cell is a standing value or a formula, never both. If ruled in: typing into a formula cell either enters formula editing or demotes the cell (attribute removed, one transaction). Held loosely until pressed.
- **Semantic-selection UX campaign** · open — The model is sound (selection = gesture in positions; reference = sentence in names); the gestures are unproven; a mixed UI approach is expected (Egildo). Its own playground campaign.

### 6 · Node views

The custom editing surface — the only region not testable headless.

- **The named bet** · pinned (audit, 2026-07-15; Egildo accepted) — Cells as atoms with node-view-owned buffers: ProseMirror as transactional store, not text editor, inside tables. Legitimate machinery, but the incumbent chose the opposite, and everything leans on this. The dragon: the focus dance, and node views surviving redraws mid-edit (a remote change to a *neighboring* cell must not destroy the buffer). Cheap to test, expensive to be wrong: **first playground probe**.
- **Thinness discipline** · settled (C13) — Node views render consequences and host inputs; all intelligence lives in plugin state and pure functions.
- **Stub** — the wrapper's anatomy (buffer, overlay layer, adopted sheet handle), `update()` contracts, `stopEvent`/`ignoreMutation` policy. Filled by the first probe.

## The chrome

### 7 · Presentation layer

The one channel (C3): a constructed stylesheet, and the vocabulary it selects on.

- **Constructed stylesheets as the one presentation channel** · pinned — A `CSSStyleSheet` owned by the plugin view, `replaceSync` on update, adopted by the document. Test: emitted markup of any table contains zero presentational attributes, styles, or classes, and the table still renders styled.
- **The stage-makeup distinction** · settled (2026-07-15) — The rendered DOM is not the document: emission serializes the doc, never scrapes the editor. Render-time marks never reach output; P3 binds the content, the working surface wears what it needs.
- **Structure selects itself** · settled — The anatomy and the document's own attributes are styling hooks: `thead tr`, `th[scope="row"]`, `[data-formula]`. Selectors *reading* content and automation is legitimate; the incumbent fakes with classes what our honest DOM answers natively.
- **The interface state vocabulary** · pinned (2026-07-15) — Attributes with values, not class swarms, each entry naming its owner. *Document-borne* (serialized): anatomy, `scope`, `data-formula`, the future error mark. *Decoration-borne* (never serialized): `data-selected` on cells and whole rows (values distinguish anchor from member), `data-editing`. *Wrapper-borne* (ephemeral): `data-mode`, `data-purpose`, the rulers (§5), drag overlays. Exact names await the christening round.
- **The vocabulary is public API** · pinned — Theme authors select on these attributes; theming knobs ride CSS custom properties. Test: a theme that only sets custom properties can restyle every interface state.
- **Icons are presentation** · pinned (2026-07-15) — A glyph is its command's costume: meaning lives in the command and its `aria-label`; the icon is decoration (`aria-hidden`), an SVG data-URI in a custom property (`--spreads-icon-*`), applied via `mask-image`, painting with `currentColor`. Test: an icon-only button is never icon-only in the accessibility tree.
- **The icon set switches because the theme API already does** · pinned — Override the variables (an optional `icons` plugin option lands in the same variables — one mechanism, two entrances). A theme is a bag of variables: colors, cursors, glyphs.
- **Default icon set** · settled as direction — ~10 glyphs curated from Lucide (ISC, verified at adoption), embedded as data URIs, zero dependency; the `fx` badge likely styled text. A bespoke set can arrive later as just another theme.
- **Column width ownership** · open, promoted — Content or presentation? The incumbent stores `colwidth` in cell attrs (and leaks it into output as `data-colwidth` — verified in source, the exact violation P3 forbids) yet *renders* widths through a colgroup element it conjures in its node view (survey, 2026-07-15) — evidence that col elements are the width mechanism either way, and our col-in-the-constructed-sheet candidate is the same mechanism minus the document pollution. But a user dragging a column edge feels like editing *their table*: does a width undo? First place P3 meets reality; resize mechanics blocked behind it. Its own round, soon.
- **The christening round's cargo** · open — command names, attribute names and values, icon names, and their human labels (the localization surface) baptize together.
- **Parked glimpse** — the CSS Custom Highlight API paints ranges with no DOM marks; wrong shape for cell rectangles, worth remembering for in-cell text painting.

## The frontier

### 8 · Names & ranges

How names bind, resolve, and survive edits (Tablet P5).

- **Ranges ride HTML header semantics** · pinned — carved as C4; the resolver *is* the spec's header-association algorithm (C14), so `=SUM(Price)` and a screen reader agree by construction.
- **Hierarchical named ranges** · pinned (C14) — `th scope="colgroup"` names a union of columns (`=SUM(2025)`); multiple tbodies with `th scope="rowgroup"` name dataset partitions (`=SUM(Price[Q1])`) — the original portions-of-datasets idea on the spec's own furniture. One grouping level each way, capped by the spec. Test: both forms resolve through the association algorithm with no plugin-invented names.
- **`col` is the seat of column-level automation** · open, the frontier's next big concept — `<col>` gives the phantom column an element: no text (names stay in th) but attributes — `<col data-formula="=Price*Qty">` declares a calculated column, `<col data-type="number">` the typed-column glimpse. Unruled, awaiting its round.
- **The naming round, promoted from housekeeping** · open — Duplicates within an axis, empty th, case and whitespace, qualified names and group/column collisions, and rename propagation (settle-on-commit gives the boundary where a th edit rewrites references pointing at it — IDE-grade rename from machinery built for other reasons). Names are load-bearing; this round is structural.
- **Parked glimpses** — `<output for>` as semantic wrapper for computed values; addressing as a citizen of the automation register.

### 9 · Formula language

**Stub** — grammar, function library and its growth rule, name lexing: after the frontier's first probe and the naming round. The **reference forms** are sketched by the spec (C14): `Name`, `Col[Row]` (intersection), `Col[RowGroup]` (partition slice), `GroupName` (union), `Col[R1:R2]` (span slice), qualified names (`2025[Jan]`). Ambiguity rules belong to the naming round.

### 10 · Evaluation & validation

How declarations become true, and what happens when they can't. Surveyed 2026-07-15: Excel's recalculation documentation; HyperFormula's dependency graph.

- **The evaluation model** · pinned — A dependency graph over resolved references with named ranges as first-class nodes (HyperFormula's range-node insight, natural under semantic addressing: a formula depends on the *name*; membership changes dirty the range node while references stay whole). Group-name nodes contain member-name nodes. On settle: dirty-mark from the settled cell, evaluate topologically, within the dispatch. Excel's three stages confirm the shape; its lazy chain reordering is deferred optimization. Test: a settle leaves no observable inconsistency; each dirty cell is visited exactly once.
- **Cycles are errors, not iterations** · settled — Detected at settle, produce an error value; no iterative mode. Excel ships one; economy says no.
- **No volatile functions in v1** · settled — Functions are pure over cell values; volatiles are poison under settle-only recompute. Reopening requires a recompute-trigger design first.
- **Evaluation is synchronous and bounded** · settled — It runs in the dispatch path; no async automations in the enforcement path, ever. Async, if it comes, computes outside and dispatches a settle.
- **Errors are values** · settled — A typed error value occupies the cell and propagates (unknown name, dangling reference, type mismatch, division by zero, cycle). Errors are content — serialization truth extends to failure. **Error markup** · open — its own small P2 round.
- **Two species of validation, kept apart** · pinned — Resolution errors (automation failing) versus data validation (content violating declared expectations). Spreadsheets silently skip text inside SUM — a trap we refuse. Glimpse, parked: typed columns as declarations the plugin keeps true (§8).
- **Adopt vs build** · open — HyperFormula is prior art with adoptable graph furniture, but A1-centric. Likely: build a small evaluator, steal the graph shape. Decide at the frontier's first probe.

## The borders

### 11 · Serialization, clipboard, export

- **Emission is pristine** · pinned — Serializing any table satisfies P2 and C3's tests. The stale-value rule (§3) governs cold parsing.
- **Paste is a normalization event** · pinned (survey, 2026-07-15) — Pasted fragments arrive ragged; C8's shape duty repairs them into legal anatomy — harder for us than the incumbent, since "legal" includes regions. Paste into a computed cell stays on the verify list (§3).
- **Clipboard carries semantics** · stub — Copying cells yields a real `<table>` fragment (values in content, formulas in attributes, both survive by C3). Cross-application behavior (Excel, Sheets) unexplored.
- **Export is not the document** · open (audit finding) — Constructed stylesheets don't serialize: the principle working, not failing. Whether a deliberate export *bundles* presentation as a separate artifact is a distinct question from P3.

### 12 · Collaboration

The accepted debt (C10), gathered in one place. v1 is single-user by economy.

- **Recompute rides the originating transaction** · pinned, to verify — Only the triggering client appends the recompute; remote transactions arrive already-consistent. Believed to hold under prosemirror-collab rebasing; unproven.
- **Stub** — Mid-edit remote changes to the *same* cell (buffer vs incoming value); mid-drag remote remapping (§5); presence; whether cell-granular collab needs anything beyond vanilla prosemirror-collab.

### 13 · Testing map

Where each part gets pressed (method: suite green throughout; playground clicked live where observable).

- **Everything is headless-testable except §6** · settled — Maps, resolver, evaluator, commands, the purpose function: pure functions and state transitions against `EditorState`. The single browser-bound region is precisely the named bet — which is why the first probe aims there.
- **Stub** — Fixture conventions for parse/serialize round-trips; how the interaction layer gets pressed by hands (the UX campaign's ritual).
