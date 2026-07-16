# The Tablet

The founding principles of prosemirror-spreads. Everything in this repo descends from these five stones; when code and a principle disagree, one of them is wrong and the disagreement is a finding, never routed around. The consequential choices that descend from them live in [architecture.md](architecture.md).

Every claim in the working documents carries a mark: **settled** (decided, build on it), **pinned** (held, with a falsifiable test attached), or **open** (undecided, with its reason stated). Confident prose never closes an open question.

Reorganized 2026-07-15 for readability, logic, and economy (renumbering map in the changelog). The stones read: ground → product → law → feel → frontier.

## P1 — Native to ProseMirror · settled

This is a ProseMirror plugin and it taps ProseMirror's state management in the most natural way. The document, transactions, plugin state, and decorations are the machinery; the plugin composes them rather than building parallel machinery beside them.

## P2 — The output is beautiful semantic HTML · settled

The expected output is beautiful, semantic HTML table markup. The emitted markup is the product, not a serialization detail: what the plugin produces should be the table a careful hand would have written — meaningful, accessible, valid.

## P3 — The three registers · settled

The document separates **content**, **automation**, and **presentation**, and HTML gives each register its native seat. Content lives in elements — what the table says (`<td>42</td>`). Automation lives in attributes — what the table does (`data-formula`). Presentation lives in stylesheets — how the table looks; and this separation is enforced, not encouraged: no presentational attributes, styles, or classes in the content, ever. When a new concern arrives, ask which register it belongs to; the register names the seat. *Provenance: the founding separation principle and the carved registers principle (2026-07-14) merged in the organization round — the separation was the law's presentation clause all along.*

## P4 — Interaction is spreadsheet-grade · settled (ratified on briefing, 2026-07-15)

The grid is the primary surface; text editing is a mode you enter and leave. Word-processor table editing — the caret pretending a table is a paragraph with borders — is the hideousness this venture exists to refuse. Depth: ratified on briefing, not circled — direction, not gospel; anything that smells comes back up.

## P5 — A lil spreadsheet · settled as intent, exploratory by its own words

We will explore ways to add functions and automations, making this also a "lil spreadsheet". The principle commits to the exploration, not yet to any mechanism; this is the venue's frontier and its claims graduate to settled only by surviving.

## Open questions

- **Venue identity layering** · open — Venture-grade rigor on the table core, marked probe on the frontier (the coach's proposal); the counter-read — that the functions are the heart — was never ruled on. The sayable line of 2026-07-14, *"we take seriously THEAD and TFOOT, scope row and scope col,"* may dissolve this question if it earns the stone; it waits outside, unratified.

All other open questions live where their rounds will land, one seat each, in the architecture (second edition, organized along the seam map): column width (§7 presentation), schema residue and cell content (§1 schema), value XOR formula (§5 interaction), the seams-as-packages question (C15).
