# The Method

How work happens in this venue. Leaner than its sibling ventures on purpose; pressed by a dozen real rounds since first drafting, and pinned down 2026-07-16 with the cycle stated whole.

## The documents

Three working documents, one timeline:

- **[tablet.md](tablet.md)** — the founding principles and the decisions that earn stone. Everything descends from it; when code and a principle disagree, one of them is wrong and that's a finding, never routed around.
- **[architecture.md](architecture.md)** — design decisions descending from the Tablet: the consequential choices (each naming its parent principles) and the working sections, organized along the seam map, structured as the complete implementation description even where content is stub.
- **[manual.md](manual.md)** — the mock manual: the confident description of using the software as if it already existed. Requisites plus falsifiable coolness — every "how cool" sentence concrete enough to lose. Reality disagreeing with it is the payoff, not the failure.
- **[CHANGELOG.md](CHANGELOG.md)** — the memory between sessions. See the split below.

**The marks.** Every claim carries one: **settled** (decided, build on it), **pinned** (held, with a falsifiable test attached), or **open** (undecided, with its reason stated). Depth annotations record how deep the round was and what would move it: *circled*, *ratified on briefing* (direction, not gospel), *proposed/unruled*, and two that emerged in the field (review, 2026-07-18) — *settled as direction* (a talk-settle carrying its confirm condition: a named battleground must ratify it) and *interim law* (binding now, with its dissolution event named). Confident prose never closes an open question.

## The cycle

The venture moves in cycles (Egildo's method): fix principles and decisions in the **Tablet** → derive the **Architecture** → write the **Manual** as if the software shipped → **try to make it real**. Reality disagrees somewhere; the disagreement is the yield; the documents amend; the cycle starts again.

**Battlegrounds are a branch and a field** (clarified 2026-07-18; battlegrounds 1–2 predate the field). An attempt to make it real forks a branch from main on this repo — the plugin side, where fixes land. The mock manual is executable; its instructions failing is the yield, not an accident. The playground stays the builder's bench; the field is the consumer's ground truth. Memory lives three times — the plugin branch, the field, and, once reconciled, the documents; the story lands in the changelog. **Reality always wins in the end**: documents true, code true to the documents; when they disagree, one of them is wrong, and finding which one is the work.

**The field is pm-testing-venue** (Egildo's ruling, 2026-07-27, replacing the arena). His reason, and it is the whole reason: *there we have a clean install of the plugins I need for a real editor.* The venue installs `prosemirror-spreads`, `prosemirror-verbs` and `prosemirror-surface` as real dependencies beside core ProseMirror — framework-less, no scaffolding, three source files — and puts the table **inside a document**: prose above and below it, a real toolbar floating over it, other plugins composed alongside it. That last part is what the arena structurally could not reach, and the evidence is on the record rather than in anyone's opinion. The three hardest findings of the last week were all boundary findings, and the arena caught none of them: the caret theft (a standing prose caret kept receiving typing while a cell only looked focused — *the arena's document had no prose to hold a caret*), the keydown-less input seam, and a cross-package bug that turned out to be prosemirror-surface's. A consumer that only holds a table cannot find the bugs that live where the table meets everything else.

**What the arena did that the venue does not**, stated so it is not quietly lost: it installed the plugin **from a git ref as a built package**, which exercises `prepare`, the `files` allowlist, and a fresh resolve — the *publication* path. The venue uses `file:` dependencies. Both consume `dist/`, so the built-output path is still exercised on every round; what is no longer exercised is whether a stranger could install this. That gap is deliberately left standing rather than papered over with ceremony: npm publication is an untaken decision, and the checkpoint becomes binding the day it is taken. Until then the honest statement is that this venture tests *integration* continuously and *packaging* not at all.

**Open, deliberately not closed by this amendment: the unit.** Battleground 4 was fought and won on 2026-07-20 and then kept absorbing rounds for a week — the reflection round, the structure family, the regions round, the controls round — until it was a trunk rather than a battle, which is why its reconciliation had no single "did the bet hold?" to answer. Whether a battleground stays one branch per campaign, becomes one per round, or dissolves into working on main (which is what actually happened, and worked) is Egildo's to close when he wants it closed.

## The loop

Within a cycle, the round-scale loop: round (chat or Code) → the landing spoken aloud — settled / pinned / open — *before any building* → documents amend before code changes → pressed: suite green, playground or arena clicked live where observable.

Decisions worth a future reader's "why?" get their because/instead-of in the changelog entry the same session. Anything that took two passes of clarification between Egildo and the coach gets written where the next session reads it, unasked.

## The memory split

The documents hold the **present**: current truth, open questions marked in place. The changelog holds the **past**: what changed, **because** of what, **instead of** which rejected road. Open questions never live in the changelog — they would scroll away into history.

The ritual, both halves religious:

- **Session start**: read the three documents and the last few changelog entries. That is the whole warm-up; nothing depends on anyone remembering a previous conversation.
- **Session close**: write the entry — what / because / instead-of. A changelog with holes is worse than none, because it looks like memory.

## Repo conventions

- pnpm; `pnpm dev` (playground), `pnpm test`, `pnpm typecheck`, `pnpm build`.
- The field lives at `../pm-testing-venue` (github:egildo/pm-testing-venue): the standing consumer, holding this plugin plus prosemirror-verbs and prosemirror-surface as `file:` dependencies. Rebuild this package (`dist/`) before pressing a change there, and stop its dev server before clearing `node_modules/.vite` — a symlinked dep behind a warm optimizeDeps cache serves stale code and costs an hour of chasing ghosts.
- The arena (`spreads-arena`) was removed on 2026-10-19, by Egildo's ruling. It was the only place a git-ref install was ever exercised, so that gap is now open until publication is decided. `prepare` in this repo's package.json still makes git-branch installs build on install.
- The package name `prosemirror-spreads` aliases to `src/index.ts` in the playground and tests: consumer-shaped imports, live source underneath.
- ProseMirror core packages are peer dependencies; the consumer's editor owns them.
- Prose documents: one logical line per paragraph, never hard-wrapped.
- Commits happen on Egildo's word, never by default.

## Provisional clause

Drafted before any cycle had run; **reviewed 2026-07-18**, with two battlegrounds fought and reconciled and the arena founded. The round-scale loop is proven: dozens of rounds, no cold-start failures. The building half is now pressed too, and its working shape held twice, cleanly: fork the branch → fight (bench, then field) → seal the branch → fast-forward main → carve the findings → next round. Written in from the field: the arena refinement, and the two mark species that emerged (settled as direction; interim law). Nothing was found unused to prune. Still untested, honestly: reconciling a battleground that *loses* — both fights so far were won, and the first lost fight will teach this method something.

**Reviewed again 2026-07-27**, on the reconciliation of battleground 4. The settled-as-direction confirm path is no longer untested — battleground 3 walked it end to end and C17 settled on Egildo's merge ruling. Three findings written in from a week that did not go by the book. **The field moved**, for cause, to pm-testing-venue (above). **The unit slipped**: five rounds rode one battleground branch until "reconcile the battleground" no longer described anything real; left open above. And **a rule was skipped in the field it governed** — the checkpoint ("install from the git branch before every merge talk") went unrun for three rounds, and main was fast-forwarded without it; the failure is recorded here rather than smoothed over, because a method whose violations go unlogged is decoration. The amendment does not fix that by deleting the rule: it names what the rule was buying (packaging truth), states that nothing buys it now, and names the event that makes it binding again. Also written in: a mark species drifted in — four entries carried **built**, which is a status, not a mark; the reconciliation resolved them, and the lesson is that the three species need saying out loud in a round, not assumed. Next review when a battleground loses, or when the unit question closes.
