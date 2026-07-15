# prosemirror-spreads

Before any work: read [method.md](method.md) — the venue's process — then the three working documents ([tablet.md](tablet.md), [architecture.md](architecture.md), [manual.md](manual.md)) and the last few entries of [CHANGELOG.md](CHANGELOG.md). The documents hold the present; the changelog holds the past; nothing depends on remembering a previous conversation.

The one hard rule from the method that binds code sessions: the landing is spoken aloud — settled / pinned / open — before any building begins, and documents amend before code changes. At session close, write the changelog entry (what / because / instead-of).

Conventions: pnpm (`pnpm dev` / `test` / `typecheck` / `build`); the package name aliases to `src/index.ts` in playground and tests; ProseMirror cores are peer dependencies; prose documents use one logical line per paragraph, never hard-wrapped.
