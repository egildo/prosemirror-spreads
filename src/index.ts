export { spreadsNodes, spreadsNodeTypes, isCellType } from "./schema"
export type { SpreadsRole, SpreadsNodesOptions } from "./schema"
export { spreads, spreadsPlugin } from "./plugin"
export type { SpreadsOptions } from "./plugin"
export { spreadsKey } from "./state"
export type { SpreadsState, EditingState, SpreadsMeta } from "./state"
export {
  insertTable,
  startEditing,
  stopEditing,
  settleCell,
  selectRelativeCell,
  clearSelectedCells,
} from "./commands"
