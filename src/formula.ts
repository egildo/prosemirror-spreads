/// The v1 formula language: number literals, arithmetic with parentheses,
/// five functions, references as bare names and intersections. The
/// serialized grammar is canonical and invariant — dot decimal, comma
/// separators, locale-independent (a formula lives in an attribute and
/// must survive crossing documents). The kernel grammar contains no
/// coordinate tokens (C16): the scaffolding adapter extends it at its own
/// boundary, not here.

export type Expr =
  | { type: "num"; value: number }
  | { type: "ref"; name: string; sub: string | null }
  | { type: "call"; fn: string; args: Expr[] }
  | { type: "bin"; op: "+" | "-" | "*" | "/"; left: Expr; right: Expr }
  | { type: "neg"; expr: Expr }

export const FUNCTIONS = ["SUM", "AVG", "MIN", "MAX", "COUNT"] as const
export type FunctionName = (typeof FUNCTIONS)[number]

export class FormulaParseError extends Error {}

interface Token {
  kind: "num" | "ident" | "punct" | "end"
  text: string
  pos: number
}

const IDENT_START = /[\p{L}_]/u
const IDENT_PART = /[\p{L}\p{N}_]/u

function lex(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]!
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const start = i
      while (i < src.length && /[0-9]/.test(src[i]!)) i++
      if (src[i] === ".") {
        i++
        while (i < src.length && /[0-9]/.test(src[i]!)) i++
      }
      tokens.push({ kind: "num", text: src.slice(start, i), pos: start })
      continue
    }
    if (IDENT_START.test(ch)) {
      const start = i
      i++
      while (i < src.length && IDENT_PART.test(src[i]!)) i++
      tokens.push({ kind: "ident", text: src.slice(start, i), pos: start })
      continue
    }
    if ("+-*/(),[]".includes(ch)) {
      tokens.push({ kind: "punct", text: ch, pos: i })
      i++
      continue
    }
    throw new FormulaParseError(`unexpected character "${ch}" at ${i}`)
  }
  tokens.push({ kind: "end", text: "", pos: src.length })
  return tokens
}

/// Parse a formula's source. Accepts the text with or without its leading
/// "=". Throws FormulaParseError on malformed input.
export function parseFormula(src: string): Expr {
  const body = src.startsWith("=") ? src.slice(1) : src
  const tokens = lex(body)
  let index = 0

  const peek = () => tokens[index]!
  const next = () => tokens[index++]!
  const expectPunct = (text: string) => {
    const token = next()
    if (token.kind !== "punct" || token.text !== text)
      throw new FormulaParseError(`expected "${text}" at ${token.pos}`)
  }

  function expr(): Expr {
    let left = term()
    while (peek().kind === "punct" && (peek().text === "+" || peek().text === "-")) {
      const op = next().text as "+" | "-"
      left = { type: "bin", op, left, right: term() }
    }
    return left
  }

  function term(): Expr {
    let left = factor()
    while (peek().kind === "punct" && (peek().text === "*" || peek().text === "/")) {
      const op = next().text as "*" | "/"
      left = { type: "bin", op, left, right: factor() }
    }
    return left
  }

  function factor(): Expr {
    const token = next()
    if (token.kind === "punct" && token.text === "-") return { type: "neg", expr: factor() }
    if (token.kind === "num") return { type: "num", value: Number(token.text) }
    if (token.kind === "punct" && token.text === "(") {
      const inner = expr()
      expectPunct(")")
      return inner
    }
    if (token.kind === "ident") {
      if (peek().kind === "punct" && peek().text === "(") {
        next()
        const args: Expr[] = []
        if (!(peek().kind === "punct" && peek().text === ")")) {
          args.push(expr())
          while (peek().kind === "punct" && peek().text === ",") {
            next()
            args.push(expr())
          }
        }
        expectPunct(")")
        return { type: "call", fn: token.text.toUpperCase(), args }
      }
      if (peek().kind === "punct" && peek().text === "[") {
        next()
        const sub = next()
        if (sub.kind !== "ident") throw new FormulaParseError(`expected a name at ${sub.pos}`)
        expectPunct("]")
        return { type: "ref", name: token.text, sub: sub.text }
      }
      return { type: "ref", name: token.text, sub: null }
    }
    throw new FormulaParseError(`unexpected ${token.kind === "end" ? "end of formula" : `"${token.text}"`} at ${token.pos}`)
  }

  const result = expr()
  if (peek().kind !== "end") throw new FormulaParseError(`unexpected "${peek().text}" at ${peek().pos}`)
  return result
}

/// Whether a settled text is formula input: "=" as the first character.
export function isFormulaText(text: string): boolean {
  return text.startsWith("=")
}
