# prosemirror-spreads

A ProseMirror plugin, in early exploration. The plugin itself lives in `src/`; everything else exists to press on it.

## Layout

- `src/index.ts` — the plugin. This is the package: what `prosemirror-spreads` exports is exactly what this file exports.
- `playground/` — a Vite app for poking at the plugin in a real editor. It imports `prosemirror-spreads` by name, aliased to `src/`, so playground code reads like a consumer's and edits to the plugin hot-reload instantly. The right panel shows the live editor state (selection, plugin state, doc) after every transaction.
- `test/` — Vitest suite. Headless: tests run against `EditorState` directly, no DOM needed. Same alias, so tests import the package by name too.
- `dist/` — build output (generated, ignored).

## Commands

- `pnpm dev` — playground at http://localhost:5173
- `pnpm test` / `pnpm test:watch` — run the suite
- `pnpm typecheck` — `tsc --noEmit` over src, playground, and tests
- `pnpm build` — bundle the library to `dist/` with tsdown (ESM + type declarations)

## Notes

- ProseMirror core packages (`prosemirror-model`, `prosemirror-state`, `prosemirror-view`) are peer dependencies; the consumer's editor owns them. They are also dev dependencies so the playground and tests run here.
- TypeScript 7 (the native compiler) does the typechecking; tsdown builds the bundle because tsup's d.ts generation needs the old TS 5 JS API.
