# The search palette always opens again with Ctrl+K

- A closed search palette could stay in the page with the keyboard focus inside it, so the next Ctrl+K went nowhere. It happened when the palette was opened twice in quick succession: each palette now removes itself when it closes, and a closed one never lingers. Found by `workspace-flow`, whose wait now checks the palette really closed and reopened; it failed on the old code.
