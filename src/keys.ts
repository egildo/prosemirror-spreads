import type { Command } from "prosemirror-state"
import {
  clearSelectedCells,
  editSelectedCell,
  exitTable,
  selectCellDelta,
  selectEnclosingTable,
  selectRelativeCell,
} from "./commands"

/// First command that fires wins — the grid's own small chain (no
/// prosemirror-commands dependency owed for one combinator).
const anyOf = (...commands: Command[]): Command => (state, dispatch, view) =>
  commands.some((command) => command(state, dispatch, view))

/// The grid-mode key vocabulary — rebindable, because keys a consumer may
/// want to change are bindings, not law. The spreadsheet's grammar, welded
/// to the document's: the four arrows walk the grid, clamping at edges —
/// except the vertical boundary, which exits into the surrounding prose;
/// Tab/Shift-Tab walk document order and wrap at row ends; Home/End walk
/// to the row's edges; Enter, Shift-Enter and F2 open the edit; Escape
/// climbs the ladder (cell → whole table, which then belongs to the
/// editor). `spreads()` installs these by default; pass a custom map to
/// replace them, or `keys: false` to install none — under `keys: false`
/// the box claims only intrinsic input and every named key falls through
/// to the editor's courts, so binding this map through your own
/// `keymap(gridKeys)` works everywhere; with bindings installed, claimed
/// keys are consumed inside the box before any keymap can see them (the
/// `keys` option is the first-class rebinding path). For a
/// prosemirror-verbs host, this map doubles as the grid policy layer:
/// `{ name: "grid", bindings: gridKeys }`. What is NOT here is intrinsic
/// and stays in the plugin regardless: type-to-replace, the beforeinput
/// interception, and the modified-delete guard are protection for the
/// document's shape, not preference.
export const gridKeys: Record<string, Command> = {
  Enter: editSelectedCell(),
  "Shift-Enter": editSelectedCell(),
  F2: editSelectedCell(),
  Escape: selectEnclosingTable,
  Tab: selectRelativeCell(1),
  "Shift-Tab": selectRelativeCell(-1),
  ArrowRight: selectCellDelta(0, 1),
  ArrowLeft: selectCellDelta(0, -1),
  ArrowDown: anyOf(selectCellDelta(1, 0), exitTable(1)),
  ArrowUp: anyOf(selectCellDelta(-1, 0), exitTable(-1)),
  Home: selectCellDelta(0, -1e6),
  End: selectCellDelta(0, 1e6),
  Backspace: clearSelectedCells,
  Delete: clearSelectedCells,
}

/// Minimal chord naming for the built-in dispatch: `Ctrl-`/`Alt-`/`Meta-`
/// prefixes always, `Shift-` only for non-printable keys (printable keys
/// arrive already shifted). For anything richer, bind a custom map through
/// the `keys` option instead.
export function keyNameOf(event: KeyboardEvent): string {
  let name = event.key
  if (event.shiftKey && name.length > 1) name = "Shift-" + name
  if (event.metaKey) name = "Meta-" + name
  if (event.altKey) name = "Alt-" + name
  if (event.ctrlKey) name = "Ctrl-" + name
  return name
}
