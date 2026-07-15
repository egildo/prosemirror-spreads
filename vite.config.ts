import { defineConfig } from "vite"
import { fileURLToPath } from "node:url"

// Dev server for the playground. The package name resolves straight to the
// plugin source, so playground code reads like a consumer's and edits to
// src/ hot-reload instantly.
export default defineConfig({
  root: "playground",
  resolve: {
    alias: {
      "prosemirror-spreads": fileURLToPath(new URL("./src/index.ts", import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
})
