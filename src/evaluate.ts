import type { Node } from "prosemirror-model"
import type { Expr } from "./formula"
import { AGGREGATE_FUNCTIONS, FormulaParseError, SCALAR_FUNCTIONS, parseFormula } from "./formula"
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
/// exactly this seam later); text inside a numeric aggregate is the trap
/// we refuse — a type error, never a silent skip.
///
/// Functions are declared in a table (kind, arity) rather than switched on
/// by name, so the set grows by adding a row and a case. Two kinds:
/// aggregates flatten references into their value list, scalars take one
/// value per argument.

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

/// What a function is, declared rather than switched on. `kind` decides how
/// arguments arrive: an aggregate flattens every reference into the value
/// list, a scalar takes each argument as one value (so a multi-cell
/// reference inside one is #VALUE!, honestly). Arity is checked before
/// anything evaluates, so `ROUND(x, 2, 3)` fails as a shape error rather
/// than quietly ignoring its tail — the drift every spreadsheet language
/// regrets. Growing the set is now one row here plus one case below.
interface FnSpec {
  kind: "aggregate" | "scalar"
  min: number
  max: number
}

const FN_TABLE: Record<string, FnSpec> = {
  // The v1 five, unchanged in shape.
  SUM: { kind: "aggregate", min: 1, max: Infinity },
  AVG: { kind: "aggregate", min: 1, max: Infinity },
  MIN: { kind: "aggregate", min: 1, max: Infinity },
  MAX: { kind: "aggregate", min: 1, max: Infinity },
  COUNT: { kind: "aggregate", min: 1, max: Infinity },
  // Grown 2026-07-28.
  COUNTA: { kind: "aggregate", min: 1, max: Infinity },
  MEDIAN: { kind: "aggregate", min: 1, max: Infinity },
  PRODUCT: { kind: "aggregate", min: 1, max: Infinity },
  ROUND: { kind: "scalar", min: 1, max: 2 },
  TRUNC: { kind: "scalar", min: 1, max: 2 },
  ABS: { kind: "scalar", min: 1, max: 1 },
  SQRT: { kind: "scalar", min: 1, max: 1 },
  POWER: { kind: "scalar", min: 2, max: 2 },
  MOD: { kind: "scalar", min: 2, max: 2 },
}

// Every declared name has a table row, and vice versa — asserted here so a
// function can never be half-added (declared but unimplemented, or the
// reverse, which is how a set drifts).
for (const name of AGGREGATE_FUNCTIONS) if (FN_TABLE[name]?.kind !== "aggregate") throw new Error(`spreads: ${name} missing`)
for (const name of SCALAR_FUNCTIONS) if (FN_TABLE[name]?.kind !== "scalar") throw new Error(`spreads: ${name} missing`)

// Arithmetic can leave the reals — POWER(0, -1), SQRT(-1), an overflow.
// Nothing infinite or NaN is allowed to reach a cell and pose as a number.
const finite = (n: number): Scalar => (Number.isFinite(n) ? n : ERRORS.value)

// Spreadsheet rounding is half-away-from-zero, not Math.round's
// half-toward-positive-infinity: ROUND(-0.5) is -1 here, as everyone expects.
function roundTo(x: number, digits: number): number {
  const factor = 10 ** digits
  return (Math.sign(x) * Math.round(Math.abs(x) * factor)) / factor
}

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
    const spec = FN_TABLE[expr.fn]
    if (!spec) return ERRORS.name
    // Arity first, before a single argument is evaluated: a call of the
    // wrong shape is not a call, and answering it would be worse than
    // refusing it.
    if (expr.args.length < spec.min || expr.args.length > spec.max) return ERRORS.value
    return spec.kind === "scalar" ? evalScalarCall(expr) : evalAggregateCall(expr)
  }

  // A scalar takes its arguments one apiece. A reference naming more than
  // one cell already answers #VALUE! in scalar context, which is exactly
  // the right answer to ROUND(a whole column, 2).
  function evalScalarCall(expr: Extract<Expr, { type: "call" }>): CellValue {
    const args: number[] = []
    for (const arg of expr.args) {
      const v = toScalar(evalExpr(arg, "scalar"))
      if (isError(v)) return v
      args.push(v)
    }
    const [a, b] = args as [number, number?]
    switch (expr.fn) {
      case "ROUND":
        return finite(roundTo(a, Math.trunc(b ?? 0)))
      case "TRUNC": {
        const factor = 10 ** Math.trunc(b ?? 0)
        return finite(Math.trunc(a * factor) / factor)
      }
      case "ABS":
        return finite(Math.abs(a))
      case "SQRT":
        // Negative roots are not real, and this language has no complex
        // numbers to hand them to.
        return a < 0 ? ERRORS.value : finite(Math.sqrt(a))
      case "POWER":
        return finite(a ** b!)
      case "MOD":
        // The result takes the divisor's sign — the spreadsheet
        // convention, and the one that makes MOD(-1, 3) = 2 rather than
        // JavaScript's -1.
        return b === 0 ? ERRORS.div0 : finite(a - b! * Math.floor(a / b!))
      default:
        return ERRORS.name
    }
  }

  function evalAggregateCall(expr: Extract<Expr, { type: "call" }>): CellValue {
    const collected: CellValue[] = []
    for (const arg of expr.args) {
      const values = rangeValues(arg)
      if (isError(values)) return values
      collected.push(...values)
    }
    for (const v of collected) if (isError(v)) return v

    // The two counters are the pair every spreadsheet has, and naming both
    // is what closes §9's open question about COUNT: COUNT is numeric,
    // COUNTA is non-empty. Only these two tolerate text, because counting
    // is the one aggregate for which text is data rather than a category
    // error.
    if (expr.fn === "COUNT") return collected.filter((v) => typeof v === "number").length
    if (expr.fn === "COUNTA") return collected.filter((v) => v != null).length

    // Every other aggregate is numeric: text inside them is the trap we
    // refuse — a type error, never a silent skip.
    if (collected.some((v) => typeof v === "string")) return ERRORS.value
    const numbers = collected.filter((v): v is number => typeof v === "number")

    switch (expr.fn) {
      case "SUM":
        return finite(numbers.reduce((a, b) => a + b, 0))
      case "PRODUCT":
        // The empty product is 1, as the empty sum is 0 — each aggregate
        // that has an identity returns it, and each that has none (AVG,
        // MEDIAN) answers with an error instead of a fiction.
        return finite(numbers.reduce((a, b) => a * b, 1))
      case "AVG":
        return numbers.length === 0 ? ERRORS.div0 : finite(numbers.reduce((a, b) => a + b, 0) / numbers.length)
      case "MEDIAN": {
        if (numbers.length === 0) return ERRORS.div0
        const sorted = [...numbers].sort((x, y) => x - y)
        const mid = sorted.length >> 1
        return finite(sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2)
      }
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
