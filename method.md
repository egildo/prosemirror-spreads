# The Method — provisional, first edition

How work happens in this venue. Deliberately leaner than its sibling ventures; written before any cycle has run, so its own provisional clause governs it.

## The documents

Three working documents, one timeline:

- **[tablet.md](tablet.md)** — the founding principles. Everything descends from them; when code and a principle disagree, one of them is wrong and that's a finding, never routed around.
- **[architecture.md](architecture.md)** — design decisions descending from the Tablet. Sections hold only what their rounds have produced; no answer appears before its round.
- **[manual.md](manual.md)** — the mock manual: the confident description of using the finished thing, requisites plus falsifiable coolness. Reality disagreeing with it during coding sessions is the payoff.
- **[CHANGELOG.md](CHANGELOG.md)** — the memory between sessions. See the split below.

**The marks.** Every claim in the working documents carries one: **settled** (decided, build on it), **pinned** (held, with a falsifiable test attached), or **open** (undecided, with its reason stated). Confident prose never closes an open question.

## The memory split

The documents hold the **present**: current truth, open questions marked in place. The changelog holds the **past**: what changed, **because** of what, **instead of** which rejected road. Open questions never live in the changelog — they would scroll away into history.

The ritual, both halves religious:

- **Session start**: read the three documents and the last few changelog entries. That is the whole warm-up; nothing depends on anyone remembering a previous conversation.
- **Session close**: write the entry — what / because / instead-of. A changelog with holes is worse than none, because it looks like memory.

## The loop

Round (chat or Code) → the landing spoken aloud — settled / pinned / open — *before any building* → documents amend before code changes → pressed: suite green, playground clicked live where observable.

Decisions worth a future reader's "why?" get their because/instead-of in the changelog entry the same session. Anything that took two passes of clarification between Egildo and the coach gets written where the next session reads it, unasked.

## Repo conventions

- pnpm; `pnpm dev` (playground), `pnpm test`, `pnpm typecheck`, `pnpm build`.
- The package name `prosemirror-spreads` aliases to `src/index.ts` in the playground and tests: consumer-shaped imports, live source underneath.
- ProseMirror core packages are peer dependencies; the consumer's editor owns them.
- Prose documents: one logical line per paragraph, never hard-wrapped.

## Provisional clause

Written before first use, this method has earned nothing yet. After the first real cycle it gets reviewed against what actually happened: unused furniture pruned, improvisations that worked written in. If the venture later earns a fuller coaching skill, the method stays seated here — the repo is the one seat that needs no sync — and the skill remains a thin adapter.
