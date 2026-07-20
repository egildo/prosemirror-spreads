export { spreadsNodes, spreadsNodeTypes, isCellType } from "./schema"
export type { SpreadsRole, SpreadsNodesOptions } from "./schema"
export { spreads, spreadsPlugin } from "./plugin"
export type { SpreadsOptions } from "./plugin"
export { spreadsKey } from "./state"
export type { SpreadsState, EditingState, SpreadsMeta } from "./state"
export {
  insertTable,
  editSelectedCell,
  startEditing,
  stopEditing,
  settleCell,
  selectRelativeCell,
  selectCellDelta,
  selectEnclosingTable,
  exitTable,
  setColumnWidths,
  clearSelectedCells,
} from "./commands"
export type { SettleAdvance } from "./commands"
export { gridKeys, keyNameOf } from "./keys"
export { spreadsVerbs } from "./verbs"
export type { SpreadsVerb } from "./verbs"
export { gridMap, GridMap } from "./gridmap"
export type { Region, RowMeta, GridProblem } from "./gridmap"
export { nameTable, nameCells, intersectionCell } from "./names"
export type { NameEntry, NameTable } from "./names"
export { parseFormula, isFormulaText, FormulaParseError, FUNCTIONS } from "./formula"
export type { Expr, FunctionName } from "./formula"
export { evaluateTable, standingValue, displayText, isError, ERRORS } from "./evaluate"
export type { CellValue, EvalError, Scalar } from "./evaluate"
export { enforceDeclarations } from "./enforce"
