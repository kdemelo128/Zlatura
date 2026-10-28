# The phone's Back button returns to the last screen and never closes the app

Back used to leave the app, because switching screens rewrote the address instead of adding to it.

- **Each screen is a step Back walks through.** Opening a screen or a deal (`#deal/<id>`) adds one history entry; choosing the screen already shown adds none. Back returns to the last screen or deal, Forward goes on, and a reload on a deal's address reopens that deal.
- **Sheets and the command menu close first.** An open sheet holds its own entry, so Back closes it and stays on the same screen; closing it with its own button leaves no extra Back press.
- **Back from the first screen stays in the app.** A guard entry under the first screen (added on the first tap or key, because Chrome skips entries a page adds without one) sends Back straight forward again.
- **Not changed:** the sections inside a deal (Overview, Rent roll and so on) are not history steps. No stored data, saved result or backup changed.
- **Tested:** `tests/e2e/back-flow.mjs` at phone and desktop size, with axe; each check was run against the old code and fails there. Not yet tried on a real phone's Back gesture (Playwright calls `history.back()`).
