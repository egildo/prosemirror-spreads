# The Method

How work happens in this venue. Leaner than its sibling ventures on purpose; pressed by a dozen real rounds since first drafting, and pinned down 2026-07-16 with the cycle stated whole.

## The documents

Three working documents, one timeline:

- **[tablet.md](tablet.md)** — the founding principles and the decisions that earn stone. Everything descends from it; when code and a principle disagree, one of them is wrong and that's a finding, never routed around.
- **[architecture.md](architecture.md)** — design decisions descending from the Tablet: the consequential choices (each naming its parent principles) and the working sections, organized along the seam map, structured as the complete implementation description even where content is stub.
- **[manual.md](manual.md)** — the mock manual: the confident description of using the software as if it already existed. Requisites plus falsifiable coolness — every "how cool" sentence concrete enough to lose. Reality disagreeing with it is the payoff, not the failure.
- **[CHANGELOG.md](CHANGELOG.md)** — the memory between sessions. See the split below.

**The marks.** Every claim carries one: **settled** (decided, build on it), **pinned** (held, with a falsifiable test attached), or **open** (undecided, with its reason stated). Depth annotations — *circled*, *ratified on briefing*, *proposed/unruled* — record how deep the round was; ratified-on-briefing means direction, not gospel. Confident prose never closes an open question.

## The cycle

The venture moves in cycles (Egildo's method): fix principles and decisions in the **Tablet** → derive the **Architecture** → write the **Manual** as if the software shipped → **try to make it real**. Reality disagrees somewhere; the disagreement is the yield; the documents amend; the cycle starts again.

**Battlegrounds are a branch and a field** (clarified 2026-07-18; battlegrounds 1–2 predate the field). An attempt to make it real forks a branch from main on this repo — the plugin side, where fixes and adjustments land. The battle itself runs in the **arena**: a standing sibling repo (`spreads-arena`, one branch per battleground) that plays the honest consumer — a clean ProseMirror install, the plugin installed *from the battle branch* as a built package (real peer dependencies, real `exports`, never the alias), its editor wired with **the manual's setup code verbatim** — the mock manual is executable, and where its instructions fail, the manual or the code is wrong, and that is the yield. The checkpoint rule: install from the git branch at battle start and before every merge talk; between checkpoints a local link of the built package keeps the fix-test loop fast (both paths consume `dist/`). The playground stays the builder's bench (aliased source, hot reload); the arena is the consumer's ground truth. Memory lives three times: the plugin branch (the fixes), the arena branch (the battle), and — once reconciled — the documents: lessons carve into Tablet, Architecture, and Manual; the story lands in the changelog. **Reality always wins in the end**: the documents must be true, and the code true to the documents; when they disagree, one of them is wrong, and finding which one is the work.

## The loop

Within a cycle, the round-scale loop: round (chat or Code) → the landing spoken aloud — settled / pinned / open — *before any building* → documents amend before code changes → pressed: suite green, playground clicked live where observable.

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

First drafted before any cycle had run; the round-scale half has since been pressed by real use (a dozen chat-lands-Code-carves rounds, no cold-start failures) and the cycle stated from Egildo's method. The building half — battleground branches, reconciliation — remains untested until the first battleground runs; its review happens when that cycle closes. Unused furniture gets pruned, improvisations that worked get written in.
