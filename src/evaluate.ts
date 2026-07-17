import type { Node } from "prosemirror-model"
import type { Expr } from "./formula"
import { FormulaParseError, parseFormula } from "./formula"
import { intersectionCell, nameCells, nameTable } from "./names"

/// The evaluator: declarations become true here. Formula cells evaluate
/// over the name graph — a reference resolves through the region-filtered
/// resolver, dependencies follow by memoized descent, cycles are errors,
/// evaluation is synchronous and bounded, and errors are values that
/// occupy cells and propagate (C9). The evaluator's source contains no
/// coordinate code (C16's purity test).
///
/// v1 provisional (awaiting their rounds): a standing cell's raw value is
/// its text parsed as a canonical number (the typed-value layer replaces
/// exactly this seam later); COUNT counts non-empty cells; text inside an
/// aggregate is the trap we refuse — a type error, never a silent skip.

export interface EvalError {
  error: true
  token: string
}

export type Scalar = number | EvalError
export type CellValue = number | string | null | EvalError

export const ERRORS = {
  name: { error: true, token: "#NAME?" },
  cycle: { error: true, token: "#CYCLE!" },
  div0: { error: true, token: "#DIV/0!" },
  value: { error: true, token: "#VALUE!" },
} satisfies Record<string, EvalError>

export function isError(v: unknown): v is EvalError {
  return typeof v === "object" && v !== null && (v as EvalError).error === true
}

const NUMBER = /^-?[0-9]+(\.[0-9]+)?$/

/// The raw value of a standing cell — the one seam the typed-value layer
/// (values & formats round) will replace.
export function standingValue(cell: Node): number | string | null {
  const text = cell.textContent.trim()
  if (text === "") return null
  if (NUMBER.test(text)) return Number(text)
  return text
}

/// Render a computed value as cell content text (canonical; the format
/// layer dresses it later).
export function displayText(value: CellValue): string {
  if (value == null) return ""
  if (isError(value)) return value.token
  return String(value)
}

/// Evaluate every formula cell of a table. Returns offset → computed value,
/// each cell visited exactly once (memoized descent, cycle-detected).
export function evaluateTable(table: Node): Map<number, CellValue> {
  const names = nameTable(table)
  const memo = new Map<number, CellValue>()
  const visiting = new Set<number>()
  const results = new Map<number, CellValue>()

  const formulaOf = (cell: Node): string | null => (cell.attrs.formula as string | null) ?? null

  function cellValue(off: number): CellValue {
    if (memo.has(off)) return memo.get(off)!
    if (visiting.has(off)) return ERRORS.cycle
    const cell = table.nodeAt(off)
    if (!cell) return null
    const formula = formulaOf(cell)
    if (formula == null) return standingValue(cell)
    visiting.add(off)
    let value: CellValue
    try {
      value = evalExpr(parseFormula(formula), "scalar")
    } catch (e) {
      value = e instanceof FormulaParseError ? ERRORS.name : ERRORS.value
    }
    visiting.delete(off)
    memo.set(off, value)
    return value
  }

  function resolveRange(expr: Extract<Expr, { type: "ref" }>): number[] | EvalError {
    const entry = names.byName.get(expr.name)
    if (!entry || entry.ambiguous) return ERRORS.name
    if (expr.sub == null) return nameCells(table, entry)
    const subEntry = names.byName.get(expr.sub)
    if (!subEntry || subEntry.ambiguous) return ERRORS.name
    const off = intersectionCell(table, entry, subEntry)
    if (off == null) return ERRORS.name
    return [off]
  }

  function evalExpr(expr: Expr, context: "scalar" | "range"): CellValue {
    switch (expr.type) {
      case "num":
        return expr.value
      case "neg": {
        const v = toScalar(evalExpr(expr.expr, "scalar"))
        return isError(v) ? v : -v
      }
      case "bin": {
        const left = toScalar(evalExpr(expr.left, "scalar"))
        if (isError(left)) return left
        const right = toScalar(evalExpr(expr.right, "scalar"))
        if (isError(right)) return right
        switch (expr.op) {
          case "+":
            return left + right
          case "-":
            return left - right
          case "*":
            return left * right
          case "/":
            return right === 0 ? ERRORS.div0 : left / right
        }
        break
      }
      case "ref": {
        const range = resolveRange(expr)
        if (isError(range)) return range
        if (range.length === 1) return cellValue(range[0]!)
        if (context === "scalar") return ERRORS.value
        // Range in aggregate context: the caller collects members itself.
        return ERRORS.value
      }
      case "call":
        return evalCall(expr)
    }
    return ERRORS.value
  }

  function toScalar(value: CellValue): Scalar {
    if (isError(value)) return value
    if (value == null) return 0
    if (typeof value === "string") return ERRORS.value
    return value
  }

  function rangeValues(arg: Expr): CellValue[] | EvalError {
    if (arg.type === "ref") {
      const range = resolveRange(arg)
      if (isError(range)) return range
      return range.map(cellValue)
    }
    const v = evalExpr(arg, "scalar")
    return isError(v) ? v : [v]
  }

  function evalCall(expr: Extract<Expr, { type: "call" }>): CellValue {
    const collected: CellValue[] = []
    for (const arg of expr.args) {
      const values = rangeValues(arg)
      if (isError(values)) return values
      collected.push(...values)
    }
    for (const v of collected) if (isError(v)) return v

    if (expr.fn === "COUNT") return collected.filter((v) => v != null).length

    // The remaining aggregates are numeric: text inside them is the trap
    // we refuse — a type error, never a silent skip.
    if (collected.some((v) => typeof v === "string")) return ERRORS.value
    const numbers = collected.filter((v): v is number => typeof v === "number")

    switch (expr.fn) {
      case "SUM":
        return numbers.reduce((a, b) => a + b, 0)
      case "AVG":
        return numbers.length === 0 ? ERRORS.div0 : numbers.reduce((a, b) => a + b, 0) / numbers.length
      case "MIN":
        return numbers.length === 0 ? 0 : Math.min(...numbers)
      case "MAX":
        return numbers.length === 0 ? 0 : Math.max(...numbers)
      default:
        return ERRORS.name
    }
  }

  table.descendants((node, off) => {
    if (node.type.spec.spreadsRole === "cell" && node.attrs.formula != null) {
      results.set(off, cellValue(off))
      return false
    }
    return node.type.spec.spreadsRole !== "cell" && node.type.spec.spreadsRole !== "header"
  })

  return results
}
