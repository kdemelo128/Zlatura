# Quick check, calculators and Save as deal now live inside the underwriting tool

One underwriting space, release 3. The tool's Model step has a calm "Quick check" panel and a "Calculators" entry that reuse the app's own engine, calculators and deal paths. Quick underwrite and its switch stay (the switch goes in release 7).

- **Quick check:** nine fields (price, first-year NOI, loan to value, rate, amortization, closing costs, hold, exit cap, sale costs) start from the tool's own figures. A blank stays blank, the tool's starting values (30 years, 10-year hold, 2% sale costs, 0 closing) are not carried, and the tool's loan and closing dollars become a percent of price only when the price is a dollar figure. Results are the engine's, row for row the same as Quick underwrite's.
- **Flag:** if the tool's own loan or equity differs from the engine's by more than a cent, both are shown with a small note; a deal keeps the app's figure.
- **Save as deal:** a sheet asks first. Create a new deal, or, with a non-confidential deal open, update it with a before and after list; Undo for both. A confidential deal is never offered Update.
- **Calculators:** every Tools calculator opens in a sheet over the tool; Quick value and Loan sizing start from the check's figures.
- **How:** the page hands the frame one frozen `window.MonalApp` object (`app/uwfiller/toolbridge.js`), only to its own tool frame; no postMessage, no second copy of the engine. Shared reading, results and deal writing moved to `quick.js` and `quickdeal.js`; "Bring into deal" now uses the same writer.
- **Tested:** `tests/uwquick.test.js` (hand-worked figures), `tests/e2e/uw-space-r3-flow.mjs` at phone and desktop size (78 checks, axe inside the frame, zero outside requests); fails on the old code. Saved-deal results and displayed figures unchanged.

