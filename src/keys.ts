import type { Command } from "prosemirror-state"
import { clearSelectedCells, editSelectedCell, selectRelativeCell } from "./commands"

/// The grid-mode key vocabulary — rebindable, because keys a consumer may
/// want to change are bindings, not law. `spreads()` installs these by
/// default; pass `keys: false` to disable them and bind the map through
/// your own keymap (`keymap(gridKeys)`), or pass a custom map to replace
/// them. What is NOT here is intrinsic and stays in the plugin regardless:
/// type-to-replace and the beforeinput interception are protection for the
/// document's shape, not preference.
export const gridKeys: Record<string, Command> = {
  Enter: editSelectedCell(),
  Tab: selectRelativeCell(1),
  "Shift-Tab": selectRelativeCell(-1),
  ArrowRight: selectRelativeCell(1),
  ArrowLeft: selectRelativeCell(-1),
  Backspace: clearSelectedCells,
  Delete: clearSelectedCells,
}

/// Minimal chord naming for the built-in dispatch: `Ctrl-`/`Alt-`/`Meta-`
/// prefixes always, `Shift-` only for non-printable keys (printable keys
/// arrive already shifted). For anything richer, bind `gridKeys` through
/// prosemirror-keymap instead.
export function keyNameOf(event: KeyboardEvent): string {
  let name = event.key
  if (event.shiftKey && name.length > 1) name = "Shift-" + name
  if (event.metaKey) name = "Meta-" + name
  if (event.altKey) name = "Alt-" + name
  if (event.ctrlKey) name = "Ctrl-" + name
  return name
}
