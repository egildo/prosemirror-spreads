import type { Command } from "prosemirror-state"
import { clearSelectedCells, editSelectedCell, selectCellDelta, selectRelativeCell } from "./commands"

/// The grid-mode key vocabulary — rebindable, because keys a consumer may
/// want to change are bindings, not law. The spreadsheet's grammar: the
/// four arrows walk the grid two-dimensionally, clamping at edges;
/// Tab/Shift-Tab walk document order and wrap at row ends; Enter and F2
/// open the edit. `spreads()` installs these by default; pass a custom map
/// to replace them, or `keys: false` to install none. The honest limit
/// (C17): inside the black box keys never reach editor keymaps, so
/// rebinding happens through the `keys` option — an external
/// `keymap(gridKeys)` only ever hears the editor-root backstop path. For a
/// prosemirror-verbs host, this map doubles as the grid policy layer:
/// `{ name: "grid", bindings: gridKeys }`. What is NOT here is intrinsic
/// and stays in the plugin regardless: type-to-replace and the beforeinput
/// interception are protection for the document's shape, not preference.
export const gridKeys: Record<string, Command> = {
  Enter: editSelectedCell(),
  F2: editSelectedCell(),
  Tab: selectRelativeCell(1),
  "Shift-Tab": selectRelativeCell(-1),
  ArrowRight: selectCellDelta(0, 1),
  ArrowLeft: selectCellDelta(0, -1),
  ArrowDown: selectCellDelta(1, 0),
  ArrowUp: selectCellDelta(-1, 0),
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
