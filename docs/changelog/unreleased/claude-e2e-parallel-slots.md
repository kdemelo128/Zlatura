# Checks: up to eight browser-suite runs at once on one machine, each on its own ports

With builder agents now working in parallel worktrees (owner, 2026-10-22), every browser run still queued for port 8080: a full suite takes about half an hour, so a third or fourth run waited an hour before it started.

- **Slots:** `tests/e2e/run.sh` now claims the first free slot of ports instead of one fixed lock. Slot 0 is what CI and older branches use, unchanged: port 8080, and 8096 to 8098 for the flows that serve an old copy (migrate, rename, upgrade). Slot n uses port 8080+n and 9000+10n to 9002+10n. Up to `E2E_SLOTS` runs (default 8) go at once; when all are busy a run waits, as before (`E2E_LOCK_WAIT`, default 1800 seconds).
- **Safe takeover:** a slot whose run has gone is taken over; one never given a PID is taken over after a minute. Slot 0 keeps the old lock's name, so a run from an older branch and a new one never both use 8080.
- **A `BASE` given by the caller** (an old-code run) is kept.
- **Tested:** `tests/e2e-lock.test.js` (a free machine gets slot 0 and the CI ports; with slot 0 held a run takes slot 1 at once with its own ports; every slot busy waits then stops; a stale slot is taken over; a caller's BASE is kept). All six fail on 4.7.56. A real run of `home-flow` took slot 1 (port 8081) while another agent's run held slot 0, and passed. No app code changed.
