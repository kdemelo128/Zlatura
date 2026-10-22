# Company research briefs get a home on the device (nothing to see yet)

The device side of company research (B1b). The server route (B1a) and the screens (B1c) are separate PRs, so a broker sees no change yet.

- **One new saved key, `research.briefs`:** a list, newest first, at most 200. At 200 a new brief is refused and the broker is asked to delete one; nothing is trimmed silently. Each brief keeps its claims with a quote of at most 600 characters; the source text is never kept, and no contact name is ever stored or sent.
- **Kept 365 days:** each brief has a `retainUntil` 365 days after it was made, and briefs past it are removed when the app starts, next to the 30-day trash sweep.
- **Status is worked out on every read:** a claim is "confirmed" only when its quote is found in the source the broker supplied, the words state the relationship, and the broker ticked it. A "confirmed" in storage or in a backup is never trusted. A quote under 12 characters, or one that does not contain the claimed name, is not accepted. A shared registered agent, mailing address or surname, or a quote about an agent or address, is refused as evidence of a relationship.
- **Contact matching** (an exact full name of two words or more, or an exact company name; a surname alone never matches) runs only when a brief is drawn and is never stored.
- **Backups:** `research.briefs` is on the backup allow-list. A merge restore keeps the newer `updatedAt` for a brief on both sides, adds the rest, and skips briefs past their `retainUntil`. The backup format version stays 2, `crm.*` is unchanged, saved deals are unchanged. A backup that carries briefs restores on 4.7.50 and earlier with the key left out and counted as a setting that version does not use; nothing breaks.
- **A replace restore from a backup without the key removes the briefs on the device,** as it does for every saved key. The restore summary now says how many (for example "3 research briefs on this device will be deleted").
- **Decided, reversible:** one key instead of the proposal's five; a quote found on another page counts as found; at most 150 claims a brief.

Tested with Node tests (`tests/claims.test.js`, `tests/research.test.js`, additions to `tests/backup.test.js`) on invented data, including backups made by 4.7.50 and 4.7.36, which give the same restore plan as 4.7.50 did. Saved deal results and displayed figures did not change.
