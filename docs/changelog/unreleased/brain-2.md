# Ask Monal can use the brain on this device (phase 2: the bird)

When the brain is turned on in Settings and the device's own front desk has no answer, Ask Monal now uses it. Off, nothing changes. The order is: the device's front desk first, then the brain, then the firm's server (only when AI settings are on, and only when the brain could not answer).

- **A question that is one of the front desk's tasks** (cap rate at a price, price for a cap rate, DSCR, expiries, WALT, what is missing, comps, break-even, commission, a figure, a summary, a term, open a screen) is mapped by the brain to that task, and the app's own calculation answers, with "Where this came from". The brain never produces the figure. Tasks that change a deal are never run from the brain; the front desk, which asks first, still handles those. A missing or ambiguous input (a cap rate of 0.07) is asked about, not guessed.
- **Anything else** (a note, an email draft, an explanation, a comparison in words) is answered by the brain from the open deal's facts, shown as it is written. Any figure in its words that the facts do not hold is highlighted and listed as "Not from your data". Every brain answer says "On this device"; a confidential deal is read here too and the answer says so.
- **"Think it through"** switch (shown only when the brain is ready) for harder questions; the first question after opening the app says it is loading the model; a failure is shown plainly and the front desk's reply (and the server, if on) follow.
- **Tested**: unit tests (task mapping to the front desk's question shapes, the talk prompt, marking, streaming strip, load failure) and `brain-bird-flow` (stub engine, no download): task routed, free talk streamed, an invented figure marked, think switch, error state, server as last route, confidential deal, brain off unchanged; phone and desktop. The new tests fail on the old code. Saved results and the 646 displayed figures are unchanged.

## Hand-test checklist (a real model; not checked by the automated tests)

On a laptop in Chrome (and, if you can, an iPhone with Safari 26 and WebGPU):

1. Settings > Documents and AI > Monal's brain: pick Small (phone) or Standard (laptop), tap Turn on, watch the progress bar finish and say Ready. Reload the page: still Ready, nothing downloads again.
2. Open a deal. Ask "What is the DSCR?": the front desk answers at once (no brain).
3. Ask something in your own words, such as "If somebody paid 4.6 million, what return would I get?": it says it is loading the first time, then shows the app's cap rate, "Where this came from", and "On this device".
4. Ask "Write a short thank-you note to the owner for the tour": the words appear as they are written. If a figure appears that is not in the deal, it is highlighted and listed under "Not from your data".
5. Tick "Think it through" and ask a harder question ("What should I ask the lender about this deal?"): slower, still stays on the device.
6. On a confidential deal, ask the same: the answer says it was read on this device only. With the network switched off, it still answers.
7. Settings > Remove the brain: Ask Monal goes back to the front desk only.
8. On the phone: the panel and the Settings card have no overlaps, every button is easy to tap, and the page stays smooth while the brain is thinking.
