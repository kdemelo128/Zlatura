# If a laptop or phone with Zlatura is stolen or lost

One page, in plain words. Citations are `file:line` in this repository. **UNVERIFIED** marks anything this
page could not check from the code.

## What is on the device

Zlatura keeps everything in the browser on the device and sends nothing anywhere unless you turn AI on
and confirm a send (`README.md:642-650`). It has no accounts and no server copy of your deals.

| Where | What | Cite |
|---|---|---|
| Browser database `zlatura` (IndexedDB) | every deal with its site-visit photos and recordings, the comp set, each deal's history and snapshots, removed photos kept 30 days | `app/store.js:18-33`, `app/store.js:625` |
| The same database, small settings | templates, tasks, contacts, activity, saved scenarios, research briefs, **and the AI server address and access token** | `app/backup.js:38`, `app/ai.js:8-10` |
| Browser `localStorage` | a copy of the deal you were editing when the last save may not have reached the database (text and figures, no photos) | `app/dealui.js:335-340` |
| Backup files you saved | one `.json` with all of the above, photos and recordings included. **Not encrypted.** It sits wherever you saved it (Downloads, a cloud folder, a USB stick, an email) | `app/backupui.js:83`, `app/backupui.js:117` |

The AI access token is on the device but never inside a backup (`app/backup.js:7-12`, `app/backup.js:95`).
The Anthropic and speech keys are never on the device; they live only on the AI server
(`server/README.md:3-5`, `server/README.md:55-56`).

## What to do, in this order

1. **Cut off the AI server first, if you use it.** The stolen browser holds a working token. Each device has
   its own token, so you withdraw only that one (`server/README.md:58-75`):
   1. On the machine that runs the AI server, open the tokens file (the file `APP_TOKENS_FILE` points to).
      Each line is `<device label> <hash>`.
   2. **Delete the stolen device's line** and save. The server notices within about 10 seconds; to make it
      immediate run `kill -HUP <pid>`. No restart is needed (`server/README.md:66-68`).
   3. If your server uses `APP_TOKEN_HASHES` instead of a file, edit it and **restart** the server
      (`server/README.md:40`).
   4. If you still use the single shared `APP_TOKEN` (shown as device `legacy`), it cannot be withdrawn for
      one device: set a new `APP_TOKEN` or move to per-device tokens, which logs every device out until it
      gets a new token (`server/README.md:41`, `server/README.md:73-75`; that rotating the value does this is
      inferred from those lines, UNVERIFIED by test).
   5. Give the new or replacement device its own token: `node tokens.mjs new <label>` (`server/README.md:29`,
      `server/README.md:60-64`). The thief's spending is capped by the server's daily limits
      (`server/README.md:77-81`), but those figures are placeholders today.
2. **Change passwords** for anything the device was signed in to: your computer login, email, GitHub (if you
   use GitHub Desktop for this app, `README.md:396-401`), and the cloud folder or mail account where you
   kept backup files. Zlatura has no password of its own to change.
3. **Tell your firm.** The deals and OMs on the device are usually under an NDA (`server/README.md:146-148`).
   What your NDAs require is UNVERIFIED here; ask your firm.
4. **Use your device's own "find / lock / erase" feature** (Apple, Google, Microsoft) to lock or wipe it.
   Zlatura has no remote wipe and cannot do this itself.
5. **Restore onto the new device** from the latest backup:
   1. Open Zlatura on the new device, then **Settings → Your data → Restore from a backup…** and pick the
      newest file (`app/backupui.js:70-77`).
   2. Choose **Merge into this device**. The sheet shows what it will do first (`app/backupui.js:134-137`).
   3. Enter the server address and your **new** token again under **AI settings**; a restore never brings
      them back (`app/backup.js:176-177`).
   4. Anything done after that backup is gone (see `docs/security/disaster-recovery.md`). Photos and
      recordings you had removed in the last 30 days are not in a backup (`app/backup.js:20-21`).

## What Zlatura does NOT protect today

- **No encryption beyond the operating system.** The browser data is plain on the disk
  (`README.md:642-646`; `docs/proposals/production-readiness.md:72`). Turn on **disk encryption** (FileVault,
  BitLocker, or the phone's passcode) and a **screen lock with a short timeout** on every device; whether
  yours are on is UNVERIFIED from here. With a locked, encrypted disk a thief cannot read the data.
- **Backups are not encrypted.** Anyone who gets a backup file can read every deal in it. An optional
  backup password is planned (F9) and has not shipped: the format is still version 2 (`app/backup.js:30`).
  Keep backup files only in an encrypted place.
- **No sign-in inside Zlatura.** Anyone who can open your logged-in browser can open your deals.
- **The token on a stolen device keeps working** until you delete its line (step 1).
