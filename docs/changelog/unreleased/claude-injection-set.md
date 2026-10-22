# Security: the AI server's prompt-injection test set doubled, covering every published attack type

F12's invented injection documents grew from 12 to 25, and each now names its attack category. The categories are taken from two published taxonomies (BIPIA, MIT; garak, Apache-2.0); every document is invented, and nothing is copied from either. No server or app code changed: saved results and golden outputs are unchanged.

- **New attacks:**
  - encoded instructions (base64, ROT13, zero-width characters, another language);
  - instructions hidden in a table cell, a footnote or an HTML comment;
  - a request to put the figures into a link (exfiltration);
  - a request to print the access token;
  - a fake end of document followed by a fake "Human:" turn;
  - "developer mode";
  - a spreadsheet formula (`=HYPERLINK`);
  - an instruction split across two documents.
- **Checked for each:** the server keeps the document's words out of the system prompt, sends the text through unchanged as a document block, strips control characters from names, and cuts an "obeying" model's answer back to the fields that were asked for.
- **New test (10e):** the set must cover all 11 categories, with unique ids and markers. It fails on 4.7.49's fixtures.
- **App side (a pin, which passes on the old code):** a value carrying a formula (`=`, `+`, `-`, `@`, a tab) is written as text in the comp set's CSV. The rent roll CSV and the copied table already did the same.
- **Test fix:** test 10 sends one request per document, so it now raises its own per-minute limit, and it closes its server even when an assertion fails. Before, a failure left the test run hanging.
- **Mutation checks:** removing the CSV formula guard, dropping a category from the set, and removing test 10's rate setting each turn a test red.
- **Still not tested:** whether the real model resists these documents. The live run is not built, an open gap.
