# The AI server can now write a company research brief (server only; no screen yet)

Phase B1a. Nothing in the app calls the new route yet; the device storage (B1b) and the screens (B1c) are later PRs, so a broker sees no change.

**New route.** `POST /api/research` takes `{subject, documents}` only: 1 to 10 PDFs or text files and at most 60,000 characters of text. Any other key (a contacts list, for instance) is refused with 400 `unexpected_field`, so contact names cannot be sent even by mistake.
**What the model is told.** Use only the documents; every claim carries a verbatim quote; names are copied as printed, never merged; a shared registered agent, mailing address or surname is never evidence of a relationship; no personal attributes. The injection rule is carried word for word.
**What the server keeps.** The answer is cut back to a closed list of 13 claim kinds and 7 sections, one quote of 3 to 600 characters per claim, a real document number, at most 150 claims. A claim inferred from an agent, address or surname is always marked inferred. The server never marks anything verified; that check is on the device (B1b).
**Cost.** Same hook as the other routes: held before the call, refused over the job cap (422, no model call) or the day (429), released on an error with a status, charged the hold on a dropped connection. The reply carries `chargedCents`. Research shares the existing caps; no new setting.
**Not built.** The numeric lead score is deferred until the firm names its weights (a gap, not a hidden default).
**Tested.** 15 new server tests with invented companies (schema refusals, the cut-back of an over-answering model, budget, logs holding no content, every document in the injection fixtures); all fail on the old code. Saved deals and every golden output are unchanged.
