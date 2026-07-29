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
  writeSelectedCell,
  writeSelectedAbbr,
  writeSelectedColumnWidth,
  demoteSelectedFormula,
} from "./commands"
export type { SettleAdvance } from "./commands"
export { addRowBefore, addRowAfter, addColumnBefore, addColumnAfter, deleteRow, deleteColumn } from "./structure"
export { setRowRegion, toggleRowHeaderColumn, splitBody, joinBodies } from "./regions"
export { writeSelectedCaption, selectedCaption, selectedTable, canWriteCaption } from "./caption"
export { gridKeys, keyNameOf } from "./keys"
// What we can do, and — separately, seated by the host or not at all — what we
// would call it. The two exports are the doctrine's two halves; see taste.ts.
export { spreadsCapabilities } from "./capabilities"
export type { SpreadsCapability, SpreadsArg, SpreadsDomainMember } from "./capabilities"
export { spreadsTaste } from "./taste"
export type { SpreadsTasteEntry } from "./taste"
export { gridMap, GridMap } from "./gridmap"
export type { Region, RowMeta, GridProblem } from "./gridmap"
export { nameTable, nameCells, intersectionCell } from "./names"
export type { NameEntry, NameTable } from "./names"
export {
  parseFormula,
  isFormulaText,
  FormulaParseError,
  FUNCTIONS,
  AGGREGATE_FUNCTIONS,
  SCALAR_FUNCTIONS,
} from "./formula"
export type { Expr, FunctionName, AggregateName, ScalarName } from "./formula"
export { evaluateTable, standingValue, displayText, isError, ERRORS } from "./evaluate"
export type { CellValue, EvalError, Scalar } from "./evaluate"
export { enforceDeclarations } from "./enforce"
