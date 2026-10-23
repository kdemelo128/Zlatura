# Company research briefs now have screens: start one, read it, tick the claims that check out

The AI server route (B1a) and the device model (B1b) had no screen. This adds them, on a phone first.

- **Start a brief** from the command palette ("Research a company", "Research briefs"), from a contact's sheet ("Research company", which fills in only the company name, never the contact's name), or open one from Review. Sources are PDFs you upload or text you paste; nothing is fetched from the web. A required tick says you are entitled to use the sources, and the send is confirmed first, naming the server, saying the files and pasted text go in full (a PDF as the whole file), and that contact names are not sent.
- **The brief** has ten collapsible sections. Each claim says what it is in words: **Confirmed** (found in your source when checked, stated outright, and ticked by you), **Hypothesis: not confirmed** (with its reason) or **Refused as proof** (with its reason: a shared registered agent, mailing address or surname). Only a found, stated claim can be ticked; a tick saves at once and has an Undo. A scanned source says its quotes can't be checked. The cost the server charged is shown.
- **Possible links to your contacts** shows "This may be your contact X" with "Not saved to the contact". Nothing is written to contacts or to any CRM record.
- **Errors** (a daily or job limit, a refusal) show the server's own message. A failed brief stays in the list as Failed.
- **Delete a brief** with Undo. **Review** gets one item for each brief that still has claims waiting for your tick.
- Focus stays on the claim you ticked, and each tick or delete is announced to screen readers. "Research company" on a contact with unsaved edits asks whether to save them first.
- Text from the model or a source is always drawn as text, never as markup.

Tested with invented companies and a stubbed server answer: a new browser flow (`tests/e2e/research-flow.mjs`) at phone and desktop size covers starting from a contact and the palette, the request holding only the company and the documents, the status words, the tick gate, undo, a refused claim, a contact match with nothing written, a 429 and a 422 message, axe, and a tick under 150 ms with 150 claims; `tests/research-review.test.js` covers the Review item. No real model was called, so the quality of real briefs and their cost are not verified. Saved deals, the engine and golden outputs are unchanged.
