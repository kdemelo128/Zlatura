# Disaster recovery: if a device, the app site or the AI server is lost

One page, in plain words. Citations are `file:line`. **UNVERIFIED** marks anything not checked from the code
or not yet tried. Drill this page once a year (table at the end).

## Where the data lives

- **On each device only.** Deals, photos, comps, templates, tasks, contacts and settings are in that
  browser's storage, with **no copy on any server** (`app/backupui.js:26`, `README.md:642-646`).
- **The browser may clear it.** If the device runs short of space, or Safari sees no visit for seven days
  (unless the app is on the home screen), the data can disappear (`app/backupui.js:27`, `app/store.js:9-10`).
  Zlatura asks the browser not to (`app/store.js:708-710`); the card says whether it agreed.
- **Your backup file is the only second copy.** It holds everything except the AI token, and except photos
  and recordings removed in the last 30 days (`app/backup.js:1-23`).

## Backup habit (what we recommend)

- **Weekly, and after any big session.** Settings → **Back up everything** (`app/backupui.js:62-69`). Home
  only nags after **30 days** (`app/home.js:93`), which is too long for live deals.
- **Two places.** Keep the file on the device and in one other, encrypted place (backups are plain text
  until F9 ships, see `docs/security/stolen-laptop.md`). Keep the last few, not only the newest.
- **Leave "include history and snapshots" ticked** unless the file is too big (`app/backupui.js:80-82`).

## Test a restore (once a year, and after any big update)

1. Open Zlatura in a **fresh browser profile** (or another device), so nothing is on it.
2. **Restore from a backup…**, pick a recent file, choose **Merge** (`app/backupui.js:70-77`,
   `app/backupui.js:134-137`). Never test with "Replace" on your working device: it deletes deals not in the
   file, and that cannot be undone (`app/backupui.js:136`, `app/backupui.js:142`).
3. Check the deal count against the backup's toast (`app/backupui.js:120`), open one deal with photos, and
   compare one figure with the same deal on your main device.
4. A backup from a newer app than the one you open is refused ("update the app first",
   `app/backup.js:114`). Older ones are brought up to date as they come in (`app/backupui.js:154`).
5. Write the date and result in the table below.

## If a device dies

- **With a backup:** restore it on the new device (`docs/security/stolen-laptop.md`, step 5). You lose
  everything done since that backup.
- **Without a backup:** the data on that device is **gone**. There is no server copy, and Zlatura staff
  cannot recover it. Deals can be re-entered from the original OMs, rent rolls and T-12s you still hold.
- **Not lost either way:** the app itself (it comes from the site) and your AI token (issue a new one).

## If the app site is lost (GitHub repo or Pages)

- **Code:** it is in the GitHub repository, and every clone has the full history. Keep a second owner on the
  account and the repo in the company's name (`docs/proposals/production-readiness.md`, section 5).
- **Site:** Settings → **Pages**, Source *Deploy from a branch*, branch `main`, folder `/ (root)`, Save; it is
  live a few minutes later (`README.md:400-402`). Copy the hidden `.nojekyll` file along (`README.md:410`).
- **A new web address is a new storage area.** Browser data does not follow a changed address, so **back up
  from the old address before you move**, then restore at the new one (browser rule; UNVERIFIED for Zlatura
  by test).
- **Meanwhile:** a device that has already loaded the app has it in its offline cache (`sw.js:30`,
  `README.md:311-312`) and keeps working; how long the browser keeps that cache is UNVERIFIED. Or run it from
  a copy of the repo on your own machine with `python3 -m http.server 8080` (`README.md:425`) and restore a
  backup there.

## If the AI server is lost (optional feature)

- **It stores nothing:** no documents, questions, recordings or answers (`server/README.md:16`). Deals never
  depended on it; without it AI is simply off.
- **Rebuild:** run it again from `server/` (`server/README.md:24-35`) with the same settings. Keep these
  safe, **outside the repo**: the Anthropic and speech keys (in your password manager or the host's secret
  settings, `server/README.md:55-56`), and the **tokens file**.
- **Tokens:** the file holds only hashes, so a lost file cannot be rebuilt; you issue every broker a new
  token (`server/README.md:60-64`). A copy of the file, kept off the server, avoids that.
- **Budgets reset to zero** on every restart or redeploy; the provider's own spend limit is the backstop
  (`server/README.md:121-127`; the provider offering one is UNVERIFIED).
- The server has not been tried deployed (`docs/PLAN_STATUS.md:944`), so its recovery time is UNVERIFIED.

## How much could be lost, and how long it takes

| | Honest answer |
|---|---|
| Data lost (RPO) | **Everything since your last backup file.** With the weekly habit: up to a week. With no backup: all of it. The app itself does not set this, you do. |
| Time to get back (RTO) | **Not timed (UNVERIFIED).** The restore is: pick the file, one choice, reload (`app/backupui.js:126-176`); a big file with photos takes longer. The rest depends on how fast you reach your latest backup. |
| App site | Minutes to a few after Pages is switched back on (`README.md:402`); UNVERIFIED by a drill. |
| AI server | Depends on the host and on having the keys and tokens file. |

## Drill log

| Date | Who | Backup used | Deals expected / found | Result and fixes |
|---|---|---|---|---|
| | | | | |
