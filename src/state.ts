import { PluginKey } from "prosemirror-state"

/// The cell currently in edit mode. `pos` is the cell node's document
/// position, mapped through every transaction while the buffer is open.
/// `seed` is the text that replaces the buffer's initial content when
/// typing (not Enter) opened the edit — spreadsheet "type to replace".
export interface EditingState {
  pos: number
  seed: string | null
}

/// The plugin's own state. It holds the mode seam and nothing else:
/// derivable facts belong to the engine room's indexes, ephemera to the
/// view layer.
export interface SpreadsState {
  editing: EditingState | null
}

/// Meta payloads the plugin's commands attach to transactions.
export type SpreadsMeta =
  | { type: "startEditing"; pos: number; seed: string | null }
  | { type: "stopEditing" }

/// The key under which the plugin's state lives, for reading it back
/// from an editor state: `spreadsKey.getState(state)`.
export const spreadsKey = new PluginKey<SpreadsState>("spreads")
