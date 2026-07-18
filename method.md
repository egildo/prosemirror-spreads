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

**Battlegrounds are a branch and a field** (clarified 2026-07-18; battlegrounds 1–2 predate the field). An attempt to make it real forks a branch from main on this repo — the plugin side, where fixes land. The battle runs in the **arena** (`spreads-arena`, one branch per battleground): a standing repo playing the honest consumer — clean ProseMirror, the plugin installed *from the battle branch* as a built package, never the alias, the editor wired with **the manual's setup code verbatim**. The mock manual is executable; its instructions failing is the yield, not an accident. Checkpoint rule: install from the git branch at battle start and before every merge talk; a local link of the built package is allowed between (both paths consume `dist/`). The playground stays the builder's bench; the arena is the consumer's ground truth. Memory lives three times — the plugin branch, the arena branch, and, once reconciled, the documents; the story lands in the changelog. **Reality always wins in the end**: documents true, code true to the documents; when they disagree, one of them is wrong, and finding which one is the work.

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
- The arena lives at `../spreads-arena` (github:egildo/spreads-arena, private): the standing consumer repo where battlegrounds run; `prepare` in this repo's package.json makes git-branch installs build on install.
- The package name `prosemirror-spreads` aliases to `src/index.ts` in the playground and tests: consumer-shaped imports, live source underneath.
- ProseMirror core packages are peer dependencies; the consumer's editor owns them.
- Prose documents: one logical line per paragraph, never hard-wrapped.
- Commits happen on Egildo's word, never by default.

## Provisional clause

Drafted before any cycle had run; **reviewed 2026-07-18**, with two battlegrounds fought and reconciled and the arena founded. The round-scale loop is proven: dozens of rounds, no cold-start failures. The building half is now pressed too, and its working shape held twice, cleanly: fork the branch → fight (bench, then field) → seal the branch → fast-forward main → carve the findings → next round. Written in from the field: the arena refinement, and the two mark species that emerged (settled as direction; interim law). Nothing was found unused to prune. Still untested, honestly: reconciling a battleground that *loses* — both fights so far were won, and the first lost fight will teach this method something — and the settled-as-direction confirm path (battleground 3 is the first). Next review when either happens.
