# Workspaces: pick the lens that fits your work, and Home and Tools follow

Zlatura has nine workspaces (Brokerage, Underwriting, Lending, Development, Investing, Occupier, Asset management, Capital raising, Leases and documents). A workspace is a lens, not a wall.

- **Switcher.** The workspace name on Home opens a sheet with all nine; pin up to three and they show as tabs under it (arrow keys move between them). On a desktop the left rail has a "Workspaces" list with "All workspaces…". The search has "Workspace: Lending" and its siblings.
- **Home and Tools.** Each workspace puts the same Home sections in its own order, adds a "<Workspace> tools" card, and lists its tools first under "For <workspace>" in Tools. Underwrite links the same calculators. Brokerage is today's Home, card for card.
- **Nothing is hidden or removed.** The set of tools in Tools and in search is the same in every workspace, and so are the five bar slots, the deals and the figures.
- **First run.** An empty device is asked once what it works on (Skip = Brokerage). A device that already has deals starts on Brokerage with no picker and one dismissible note. Settings > Workspace has "Show the picker again".
- **Stored.** One small device setting (`ui.prefs`, `workspace`), cleaned up on every read and carried by backups; backups from before it restore to Brokerage. No deal, no figure and no backup version changes.
- **Tested.** `tests/workspaces.test.js` (registry, tool ids, same tool set in every workspace, cleaning rules, old-backup fixtures) and `workspace-flow` (picker, switching, axe at 390 and 1280, 150 ms switch, arrow keys, Escape). Saved results unchanged (golden: 646 figures, 0 changed).

- **Restores.** The workspace choice is a device setting: a full restore replaces it with the backup's (or with Brokerage when the backup has none); a merge restore leaves this device's choice as it is, without a message. Someone on an automated browser, where the first-run picker is not shown, can use Settings > Workspace > Show the picker again.
