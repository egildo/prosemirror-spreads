# Changelog

The venue's memory between sessions: what changed, because of what, instead of which rejected road. The working documents hold the present; this file holds the past. One entry per session, written at close, religiously.

## 2026-07-15 — Rounds: the rulers, and the spec as contract

**The rulers — scaffolding that recedes** (pinned, §8; Egildo's design) — fresh tables wear classic A B C / 1 2 3 rulers as wrapper-owned chrome; when a thead arrives, th cells inherit the identity duties and the ruler minimises to a mechanical handle strip, per-column, with the promotion affordance riding the fat ruler — *because* the cold-start table (bare tbody) needs wayfinding and click-targets before any content can provide them, and familiarity is part of spreadsheet-grade feel (P4), *instead of* permanent Excel-style gutters (dead chrome after names exist) or referenceable ruler letters (which would readmit positional notation through the front door — the labels are wayfinding, never notation).

**C14 — the spec is the contract: ceiling, never floor** (settled, Egildo) — the full HTML table model in scope (caption, colgroup/col, thead, multiple tbodies, tfoot, all four scope values, headers overrides), with the resolver implementing the spec's header-association algorithm so formulas and assistive tech read the same table by construction — *because* the group semantics complete the addressing system (colgroup names are unions, rowgroup names are dataset partitions — the original portions-of-datasets idea realized on the spec's own furniture), *instead of* a curated anatomy subset that would leave those semantics unreachable. **Egildo's guard carved into the choice**: supported is never required — the bare-tbody table is first-class, capability grows monotonically with markup, no cliff. Consequences seated: node set settled (§1, residue narrowed to expressions and span constraints); group-name nodes in the graph (§5); reference forms sketched from the spec (§6); hierarchical ranges pinned and `col` opened as the seat of column-level automation — calculated columns, the frontier's next big concept (§7); the col-element width candidate noted (§10). Survey duty standing: the association algorithm's text gets read before the resolver round.

## 2026-07-15 — Round: icons

**Icons are presentation, and the set switches through the theme API we already had** (pinned, §10) — glyphs as SVG data-URIs in custom properties, applied via `mask-image` with `currentColor`, on wrapper-owned affordances — *because* an icon is its command's costume (meaning stays in the command and `aria-label`) and presentation has exactly one channel, *instead of* inline SVG injection or an icon-font, which would create a second styling system with its own switching story. Default set: ~10 glyphs curated from Lucide (ISC, verified at adoption), embedded, zero dependency — *instead of* drawing a bespoke set now (still possible later as just another theme). The christening round's cargo grows: commands, attributes, icons, and their human labels baptize together.

## 2026-07-15 — Round: the interface vocabulary, and the architecture's full skeleton

**The architecture reorganized into the complete implementation description's shape** — thirteen numbered working sections after the choices, most still stubs that say what will live there — *because* Egildo asked for the structure to exist ahead of its content, *instead of* sections accreting one per round with landings seated wherever the round happened to drop them. Existing marks moved to their natural seats: the named bet to Node views (§9), collab items gathered in §12, export moved to §11; new stub sections carved for Commands (§4), Formula language (§6), Serialization/clipboard (§11), Testing map (§13).

**The interface state vocabulary pinned** (§10) — attributes with values, not class swarms, split by owner: document-borne / decoration-borne / wrapper-borne — *because* the anatomy and the registers already do most of the selector work classes would fake (`thead tr`, `th[scope="row"]`, `[data-formula]` — the honest DOM answers natively), *instead of* incumbent-style class proliferation. With it: the stage-makeup distinction settled (the rendered DOM is not the document; emission comes from the serializer, so P3's promise binds untouched), and the vocabulary declared public API — theming rides CSS custom properties, tested by "a theme that only sets variables can restyle every state".

**The engine room carved** (§2 — previously landed in chat only) — no stored model: derived, disposable indexes (the grid map as flat slot array, the incumbent's TableMap shape stolen whole; the name table; the dependency graph), memoized by node identity in a WeakMap — *because* ProseMirror's persistent nodes make rebuild-and-cache free of invalidation logic and correct across undo/redo/collab, *instead of* a live cell-object model that would recreate the two-truths problem inside the plugin. Structural operations are document surgery; indexes never participate.

## 2026-07-15 — Round: organizing the Tablet

**Six stones became five, ordered ground → product → law → feel → frontier** — *because* the reflection found old P3 (separation) had become a special case of old P5 (the registers), and two principles stating one law is a tax on every future reader, *instead of* keeping chronological accretion order with a redundant stone. **Renumbering map**: old P3 + old P5 → new P3 (the three registers, separation as its presentation clause); old P6 → new P4 (interaction); old P4 → new P5 (frontier). Changelog entries before this one speak the old numbers; history stays unedited. All parentage references in the architecture updated; a grep confirms no stale numbers.

**Open questions deduplicated to one seat each** — the Tablet keeps only the principle-level open (venue identity); column width, schema residue, value XOR formula, and cell content live in the architecture where their rounds will land. The scope-ranges pin dissolved into C4, where its test lives.

**Considered and kept**: the C-layer stays in the architecture, not the Tablet — principles and their consequences are different documents by the venue's own three-document design. **Still waiting outside the Tablet**: the sayable line, unratified.

## 2026-07-15 — Round: commands and the one-way flow

**C12, everything is a command; C13, the view is downstream** (settled, Egildo) — all mutations are ProseMirror commands, and node views render consequences of document changes, never causes — *because* the command idiom buys composability, keybinding, dry-run applicability, and headless testability, and one-way flow keeps the coming node-view complexity bounded by thinness, *instead of* UI code mutating state directly or node views growing private intelligence. Noted with a grin: the only part of the plugin that cannot be tested headless is exactly the named bet (node views, the focus dance) — the first probe was aimed correctly before we knew why.

## 2026-07-15 — Round: the consequential choices layer

**The architecture gained its spine** — eleven consequential choices (C1–C11) between the Tablet and the working detail, each naming its parent principles — *because* the landed rounds had accumulated as scattered marks and Egildo asked for hierarchy (the foreseen consequential choices after first principles), *instead of* letting the derivation live in chat history. The parentage rule is self-auditing: a choice that cannot name its parents is unjustified or reveals a missing principle.

**The audit found P6** — the whole interaction family (modes, gesture law) had no parent; carved into the Tablet: "Interaction is spreadsheet-grade: the grid is the primary surface; text editing is a mode you enter and leave." Depth: ratified on briefing — direction, not gospel.

**C2 settles schema anatomy's headline** (ratified on briefing) — anatomy is structural, real node types — *because* you cannot take thead seriously and derive it at serialization, *instead of* the incumbent's flat model. The open question narrows to the residue: which elements exactly, and how (`colgroup`/`col`, `caption`, content expressions).

**C11 stays unruled** — semantics rewarded, not required (anonymous tables get no formulas) — carried as proposed, awaiting Egildo.

## 2026-07-15 — Rounds: pointer mechanics, the carefulness audit, evaluation & validation

**The purpose model and the gesture law** (pinned) — the pointer's purpose is computed state and the cursor its costume via the constructed stylesheet; every gesture is continuous in the ephemeral layer and atomic at the seam — *because* settle-on-commit generalized cleanly from cell edits to all gestures (resize streams into `replaceSync`, zero transactions), *instead of* per-event dispatch or cursor-fiddling scattered through handlers.

**A round of carefulness ran on the whole technical approach** (Egildo summoned it). Verdict: sound, no component failed. It named the design's one big bet — ProseMirror as transactional document store with a custom editing surface, not as text editor inside tables; the incumbent chose the opposite — and made it the first playground probe (the focus dance; node views surviving redraws mid-edit). It found the one unsolved corner: collaborative recompute, concurrent settles colliding on the same dependent cell.

**Cell-wise atomic updates ruled the state model** (settled, Egildo) — the settle plus its cascade side effects, one dispatch — *because* it is the most economic model and collab complications are accepted as a known cost, *instead of* holding the design hostage to collaborative perfection. Mitigation stays pinned-to-verify: recompute rides the originating transaction.

**Evaluation & validation surveyed and descended** (sources read: Excel's recalculation documentation; HyperFormula's dependency graph) — dependency graph with named ranges as first-class nodes, dirty-marking from the settled cell, topological evaluation per settle; cycles are errors, no iterative mode; no volatile functions in v1; evaluation synchronous and bounded — *because* each is the economical reading of proven spreadsheet machinery under our settle-only model, *instead of* importing Excel's full apparatus (lazy chain reordering, iterative calc, async UDFs) before any table needs it. **Errors are values**: they occupy cells, propagate through dependents, and live in content — serialization truth extends to failure. Validation split into two species — resolution errors vs data validation — with typed columns parked as a glimpse.

**New opens**: export-is-not-the-document; adopt-vs-build for the evaluator (HyperFormula is prior art, but A1-centric); the semantic-selection UX campaign (mixed UI approach expected); error markup as its own P2 round; column width promoted — resize mechanics now blocked behind it.

## 2026-07-14 — Round: atomicity, and the three registers

**Cell edits settle atomically at commit** (pinned) — mid-edit text is node-view-owned UI state, one transaction per settle, "like somebody pasted" — *because* per-character granularity buys nothing for data cells, and the settle boundary already has three jobs (mode seam, evaluation trigger, undo grouping), *instead of* per-keystroke dispatch inside cells (idiomatic ProseMirror, pointless granularity here) and *instead of* nested mini-editors (heavy; only needed if cells go rich — the foreclosed road is marked: a cell needing inline markup reopens the design).

**Formula as attribute, value as content** (settled) — `<td data-formula="=SUM(Price)">42</td>` — *because* formula is automation, not content: the emitted HTML must carry data — readers, scrapers, screen readers get `42` — with provenance riding the attribute; rhymes with XLSX's formula-plus-cached-value, *instead of* the coach's decoration-based cut (formula as content, value derived and doc-external), which lost because serialized output would have shown formulas where readers wanted data.

**The three registers carved into the Tablet as P5** (settled) — content in elements, automation in attributes, presentation in stylesheets — *because* the formula decision and P3 turned out to be the same cut made in two places, and naming it once answers future seating questions, *instead of* arguing each register decision case by case forever.

**Carried open**: value XOR formula (Egildo's mark: "we'll see"); cell content scalar vs inline. **To verify before the architecture asserts them**: history grouping of appended transactions into one undo event; recompute cascade edges; paste into a computed cell. **Parked glimpses**: `<output for>` as semantic wrapper for computed values; addressing as a citizen of the automation register.

**Process correction, seated in the venue skill**: in rounds the coach speaks plainly; option widgets only at genuine forks, rarely.

## 2026-07-14 — Session zero: scaffold and structure

**Repo scaffolded.** Single package, not a monorepo — *because* one plugin and its playground share one dependency tree, *instead of* workspace plumbing that would buy only ceremony. The alias trick is load-bearing: `prosemirror-spreads` resolves to `src/index.ts`, so playground and tests import by the published name while hitting live source. Vite playground with a live state inspector; Vitest headless; ProseMirror cores as peer deps.

**tsdown builds the library, not tsup** — *because* pnpm resolved TypeScript 7 (the native compiler) and tsup's d.ts generation crashed on its missing JS API, *instead of* pinning TypeScript back to 5.x and losing the faster, stricter checker.

**The venue's structure defined** (this session's round, Egildo's design): three working documents — tablet, architecture, mock manual — a lean repo-seated `method.md`, and this changelog as the whole memory mechanism, *because* the venue wants a leaner process than its sibling ventures, *instead of* issues, state exports, and a decision-records folder. The split that makes it work: documents carry the present with marks (settled / pinned / open), changelog carries the past.

**Method seated in the repo** — *because* the repo is the one seat needing no sync mechanism, *instead of* the skill-seat pattern that carries a standing sync burden. `CLAUDE.md` and the chat skill are thin adapters pointing here.

**Carried open** (marked in place in the documents): venue identity layering (venture core / probe frontier — coach's proposal, unruled); column width ownership (content vs presentation); schema anatomy (how much of HTML's table anatomy enters the document). **Pinned**: function ranges ride HTML header semantics (`th scope` + `headers`, no custom values) — test: `=SUM(Price)` from standard markup alone.

Everything staged, uncommitted — commits happen on Egildo's word.
