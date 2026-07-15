import { Plugin, PluginKey } from "prosemirror-state"

/// Options accepted by [`spreads`](#spreads).
export interface SpreadsOptions {}

/// The plugin's own state, tracked through transactions.
export interface SpreadsState {}

/// The key under which the plugin's state lives, for reading it back
/// from an editor state: `spreadsKey.getState(state)`.
export const spreadsKey = new PluginKey<SpreadsState>("spreads")

/// Create the spreads plugin.
export function spreads(options: SpreadsOptions = {}): Plugin<SpreadsState> {
  return new Plugin<SpreadsState>({
    key: spreadsKey,
    state: {
      init() {
        return {}
      },
      apply(tr, value) {
        return value
      },
    },
  })
}
