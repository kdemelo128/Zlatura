# Ask Monal now remembers the documents you added, after you close the app

Until now Ask Monal could only search a document in the session where you added it: after a reload it said "add the
file again." The owner approved keeping the page text on the device (option 4 of
`docs/proposals/document-memory-and-learning.md`), and this is release A1 of that plan.

- **Document text is kept on this device.** Every document with a fingerprint that you attach to a deal (the OM reader,
  the Documents card, Start from documents, a lease, a Word file) has its page text stored compressed in a new `doctext`
  store (database version 3), keyed by the file's SHA-256 and the deal, with the page count and whether OCR read it. The
  files are never kept. Text read by OCR is stored only when OCR already ran; nothing here starts OCR. A full device keeps
  nothing, says so in a notice, and reading carries on.
- **Ask Monal searches it across sessions.** The deal's stored text is read back lazily when Ask Monal opens or is asked,
  once per document, with a quiet "Reading your documents..." line; typing is never held up. The passage is quoted with
  its document and page as before.
- **Forget.** The Documents card says what is kept and has "Forget this deal's document text"; My data lists the text per
  deal with its space, "Forget" per deal and "Forget all document text", each asking first and saying plainly that it
  cannot be undone. Removing a document from the list, or deleting a deal, forgets its text.
- **Confidential deals** keep their text like any other, on this device only, and it is read for that deal alone.
- **Backups leave the text out** (a test checks a backup has none, and that a restore works without it). Old data and old
  backups load as before: version 3 only adds an empty store.
- **A0 measured** (invented documents, in the proposal): a 60-page OM keeps 41-62 KB; a lease 34 KB; a T-12 6 KB.
- **Tested:** `tests/doctext.test.js` (round trip, plain fallback, hostile records, a decompression bomb, a later session,
  cache by hash, Forget, confidential isolation, a full device, backups); `tests/e2e/docmem-flow.mjs` on phone and
  desktop (a version 2 database opening at version 3, reload then ask, Forget, My data, delete cascade, quota error, backup
  and restore, five stored documents of 120 pages indexed in 40 ms and 163 ms at 4x CPU, axe, no network). Each new guard was
  mutated once and a test failed. Saved deal results are unchanged (golden checks identical).
- **Review fixes.** A stored text is read back only for documents the deal still lists, and any other is deleted; a document
  removed while its text was still being packed is never written afterwards; all document text together is held to 50 MB
  (past it nothing more is kept, and My data says so); text left under a deal that no longer exists is swept at launch;
  removing a document says its kept text is forgotten. **Rollback note:** any rollback must keep database version 3 and the
  `doctext` store: an older app opening version 3 gets a VersionError and shows the existing "out of date, reload" message
  (a flow checks this).
