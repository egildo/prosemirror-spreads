import type { Node } from "prosemirror-model"
import type { GridMap } from "./gridmap"
import { gridMap } from "./gridmap"

/// The name table: names → cell sets, from scope'd headers, per the spec's
/// header-association algorithm (read 2026-07-17) filtered by region — a
/// name denotes its tbody cells (Egildo's ruling: thead names, tbody is the
/// data, tfoot speaks about the data). "Subsequent" is the spec's word and
/// it is load-bearing: a header names only what comes after it.
///
/// v1 provisional rules, awaiting the naming round: names lex as bare
/// identifiers (spaces demand an abbr — the spec's own escape hatch);
/// resolution is case-sensitive exact match; duplicate names within the
/// table are marked ambiguous and referencing one is a resolution error.

export interface NameEntry {
  name: string
  kind: "col" | "row"
  /// Offset of the minting th (relative to table content start).
  headerOff: number
  /// Column index (kind "col") or row index (kind "row") in the grid map.
  index: number
  /// Grid row of the minting th — members are subsequent to it.
  headerRow: number
  ambiguous: boolean
}

export interface NameTable {
  byName: Map<string, NameEntry>
  all: NameEntry[]
}

const IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_]*$/u

const cache = new WeakMap<Node, NameTable>()

/// Compute (or recall) the table's name table. The reference name is the
/// th's abbr when present, its text content otherwise.
export function nameTable(table: Node): NameTable {
  const cached = cache.get(table)
  if (cached) return cached
  const built = buildNames(table)
  cache.set(table, built)
  return built
}

function referenceName(th: Node): string | null {
  const raw = ((th.attrs.abbr as string | null) ?? th.textContent).trim()
  return IDENTIFIER.test(raw) ? raw : null
}

function buildNames(table: Node): NameTable {
  const map = gridMap(table)
  const byName = new Map<string, NameEntry>()
  const all: NameEntry[] = []

  const mint = (entry: NameEntry) => {
    const existing = byName.get(entry.name)
    if (existing) {
      existing.ambiguous = true
      entry.ambiguous = true
    } else {
      byName.set(entry.name, entry)
    }
    all.push(entry)
  }

  for (let row = 0; row < map.height; row++) {
    const meta = map.rowsMeta[row]
    if (!meta) continue
    for (let col = 0; col < map.width; col++) {
      if (!map.headerAt(row, col)) continue
      const off = map.cellAt(row, col)
      if (off == null) continue
      const th = table.nodeAt(off)
      if (!th) continue
      const scope = th.attrs.scope as string | null
      const name = referenceName(th)
      if (!name) continue
      if (scope === "col") {
        mint({ name, kind: "col", headerOff: off, index: col, headerRow: row, ambiguous: false })
      } else if (scope === "row" && meta.region === "body") {
        // Row names are minted only where data lives: a tfoot row header
        // ("Totale") names no data and mints nothing (v1).
        mint({ name, kind: "row", headerOff: off, index: row, headerRow: row, ambiguous: false })
      }
    }
  }

  return { byName, all }
}

/// The cells a name denotes: data cells (never headers) in the tbody
/// region, subsequent to the minting header. Returns offsets relative to
/// the table's content start.
export function nameCells(table: Node, entry: NameEntry): number[] {
  const map = gridMap(table)
  const cells: number[] = []
  if (entry.kind === "col") {
    for (let row = entry.headerRow + 1; row < map.height; row++) {
      if (map.rowsMeta[row]?.region !== "body") continue
      if (map.headerAt(row, entry.index)) continue
      const off = map.cellAt(row, entry.index)
      if (off != null) cells.push(off)
    }
  } else {
    for (let col = 0; col < map.width; col++) {
      if (map.headerAt(entry.index, col)) continue
      const off = map.cellAt(entry.index, col)
      if (off != null) cells.push(off)
    }
  }
  return cells
}

/// Resolve an intersection Col[Row] (or Row[Col] — the grain never mattered)
/// to a single cell offset, or null.
export function intersectionCell(table: Node, a: NameEntry, b: NameEntry): number | null {
  if (a.kind === b.kind) return null
  const map = gridMap(table)
  const col = a.kind === "col" ? a : b
  const row = a.kind === "row" ? a : b
  if (map.rowsMeta[row.index]?.region !== "body") return null
  if (row.index <= col.headerRow) return null
  const off = map.cellAt(row.index, col.index)
  if (off == null || map.headerAt(row.index, col.index)) return null
  return off
}
