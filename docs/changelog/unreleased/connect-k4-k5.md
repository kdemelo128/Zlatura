# CRM, deal and property-management exports in and out, and calendar and email files, through To file

### Drop a calendar or email file and it becomes activity, tasks and people to file

A calendar (.ics) or email (.eml) file, dropped anywhere on the page or chosen on Connect, is read on this device. Everything it names goes to To file; nothing is filed until you tap.

- **Meetings** become activity with their date and time. Zones are kept: a 3 p.m. New York meeting is 15:00 America/New_York and the right instant in winter and summer; a time with no zone, or a zone name nobody knows, is shown as written and says so, never moved. All-day events have no time. A repeating meeting is expanded only for the next 90 days (at most 100 meetings a file); a repeat rule the reader does not fully handle shows only the first meeting, with a note.
- **Emails** become activity (subject, date, who), and each person on From, To and Cc (invite attendees too) becomes a contact to file, once, with accented names kept. Calendar invites inside an email are read too. Rooms and no-reply addresses are left out.
- **Linked to the right deal** only when the file names exactly one deal, by its name or street address. A record that names a confidential deal stays inside that deal: hidden and uncounted elsewhere, and never matched to other contacts.
- **Instructions are data.** A title, description, invitee name or body line that reads like an instruction is flagged "kept as text", never batched, never acted on.
- **Attachments** in an .eml are offered to Start from documents (its own checks and caps apply; at most 20 attachments and 25 MB an email); embedded logos are not attachments.
- **One tap** files the clean new records from files (with Undo all); reading the same file twice proposes nothing twice; every filing is one Undo.
- Open to-dos in a calendar file become tasks.

Tested with invented files only: 27 new unit tests (zones and daylight saving, folded lines, encoded words, quoted-printable and base64, non-ASCII names, repeats, injection, confidential, undo) with 22 mutation checks, and a phone and desktop browser flow with axe. Saved deal results and displayed figures are unchanged.

- **Review fixes (both releases):** undoing a deal update keeps a closing date edited or ticked done since, and says so; filing never trims the activity log (a full log refuses and the item stays, with the reason); an id from a file counts only with that file and kind, and as the same record only when the name or address agrees; a meeting with no usable zone is logged at local noon of its date marked "time not stated", and an email with no readable date asks for one; exports no longer name a confidential deal's contact on a task and refuse when deals cannot be read; UTC EXDATE/RECURRENCE-ID are compared in the series' zone; repeat expansion has a per-file work cap; a drop never closes an open sheet.

### Bring in your CRM, deal and tenant exports, and send your contacts, deals and tasks back out

Connect now has working rows for the files brokers already have: a contacts or companies export from a CRM (Salesforce, HubSpot, Dynamics, Zoho, Pipedrive, Apto, Buildout and the like), a pipeline export, and a tenant list from a property-management system. They are matched by the common column names, not by any vendor's layout.

- **Every row goes through To file.** A preview shows the columns, how each stage is read and the first records. Rows are proposed with "Imported from <file>, row N"; nothing is filed until you tap. A typed value is never overwritten: a conflict asks, the loser is kept under other values.
- **Re-importing updates, never duplicates.** A stable id column (or this app's own id) finds the same person or deal again; otherwise the inbox's match rules apply. A row that changes nothing is counted and left out. A changed row replaces its older waiting copy.
- **One tap for the safe part.** "File N new records from files" and "Apply N updates that only fill blanks" (with Undo all); anything with a conflict, or flagged as text that reads like an instruction, waits for a choice.
- **Deals:** a new deal gets its stage (you answer any stage the words do not settle), closing date and the file's id; the amount stays in the notes as written and is never the price. An existing deal gains only the file's id and a missing closing date; its stage and figures are never changed.
- **Tenant lists** become Tenant contacts with suite and lease end in the note. The layout you chose is remembered per source.
- **Export** contacts, deals and tasks as CSV in this app's column names or the common CRM ones, each with an ID column so loading the file back finds the same records. Confidential deals, their tasks and their contacts are left out.
- Names with accents are now treated as names (they were never auto-filed before).

Tested with invented files only: 17 new unit tests (columns, dates not guessed, injection kept as text, re-import, batch undo, confidential, round trip of each export) with 13 mutation checks, and a phone and desktop browser flow with axe. Saved deal results and displayed figures are unchanged.

