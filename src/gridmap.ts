import type { Node } from "prosemirror-model"

/// The grid map: every 2D question becomes index arithmetic. A flat
/// width × height slot array holding each covering cell's offset (relative
/// to the table's content start: cell pos = tablePos + 1 + offset), plus
/// per-row region metadata — the resolver's data boundary (a name denotes
/// its tbody cells) is a region question. Derived, disposable, memoized by
/// node identity: an unchanged table is the same object across doc
/// versions, so every historical version gets its correct map for free.
/// v1 schema mints no spans, so each cell covers one slot; ragged rows
/// surface in the problems array as a by-product of the geometry pass,
/// feeding C8's future shape-repair duty.

export type Region = "head" | "body" | "foot"

export interface RowMeta {
  region: Region
  /// Index of the row group element among the table's children — partitions
  /// (multiple tbodies) stay distinguishable.
  section: number
}

export interface GridProblem {
  type: "ragged"
  row: number
  expected: number
  found: number
}

const MISSING = -1

export class GridMap {
  constructor(
    readonly width: number,
    readonly height: number,
    /// slots[row * width + col] = cell offset, or -1 where a ragged row left a hole.
    readonly slots: readonly number[],
    readonly rowsMeta: readonly RowMeta[],
    /// Kind of node at each slot: true for th, false for td (parallel to slots).
    readonly isHeader: readonly boolean[],
    readonly problems: readonly GridProblem[],
  ) {}

  cellAt(row: number, col: number): number | null {
    if (row < 0 || row >= this.height || col < 0 || col >= this.width) return null
    const off = this.slots[row * this.width + col]
    return off == null || off === MISSING ? null : off
  }

  /// Locate a cell offset in the grid.
  find(offset: number): { row: number; col: number } | null {
    const index = this.slots.indexOf(offset)
    if (index < 0) return null
    return { row: Math.floor(index / this.width), col: index % this.width }
  }

  headerAt(row: number, col: number): boolean {
    return this.isHeader[row * this.width + col] === true
  }
}

const cache = new WeakMap<Node, GridMap>()

/// Compute (or recall) the grid map for a table node.
export function gridMap(table: Node): GridMap {
  const cached = cache.get(table)
  if (cached) return cached
  const map = buildMap(table)
  cache.set(table, map)
  return map
}

function buildMap(table: Node): GridMap {
  interface RowEntry {
    meta: RowMeta
    cells: { off: number; header: boolean }[]
  }
  const rows: RowEntry[] = []

  table.forEach((section, sectionOffset, sectionIndex) => {
    const role = section.type.spec.spreadsRole as string | undefined
    if (role !== "head" && role !== "body" && role !== "foot") return
    section.forEach((row, rowOffset) => {
      if (row.type.spec.spreadsRole !== "row") return
      const cells: RowEntry["cells"] = []
      row.forEach((cell, cellOffset) => {
        const cellRole = cell.type.spec.spreadsRole
        if (cellRole !== "cell" && cellRole !== "header") return
        cells.push({
          off: sectionOffset + 1 + rowOffset + 1 + cellOffset,
          header: cellRole === "header",
        })
      })
      rows.push({ meta: { region: role, section: sectionIndex }, cells })
    })
  })

  const height = rows.length
  const width = rows.reduce((w, r) => Math.max(w, r.cells.length), 0)
  const slots: number[] = new Array(width * height).fill(MISSING)
  const isHeader: boolean[] = new Array(width * height).fill(false)
  const problems: GridProblem[] = []
  const rowsMeta: RowMeta[] = []

  rows.forEach((row, r) => {
    rowsMeta.push(row.meta)
    row.cells.forEach((cell, c) => {
      slots[r * width + c] = cell.off
      isHeader[r * width + c] = cell.header
    })
    if (row.cells.length < width)
      problems.push({ type: "ragged", row: r, expected: width, found: row.cells.length })
  })

  return new GridMap(width, height, slots, rowsMeta, isHeader, problems)
}
