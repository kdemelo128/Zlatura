# Drop a calendar or email file and it becomes activity, tasks and people to file

A calendar (.ics) or email (.eml) file, dropped anywhere on the page or chosen on Connect, is read on this device. Everything it names goes to To file; nothing is filed until you tap.

- **Meetings** become activity with their date and time. Zones are kept: a 3 p.m. New York meeting is 15:00 America/New_York and the right instant in winter and summer; a time with no zone, or a zone name nobody knows, is shown as written and says so, never moved. All-day events have no time. A repeating meeting is expanded only for the next 90 days (at most 100 meetings a file); a repeat rule the reader does not fully handle shows only the first meeting, with a note.
- **Emails** become activity (subject, date, who), and each person on From, To and Cc (invite attendees too) becomes a contact to file, once, with accented names kept. Calendar invites inside an email are read too. Rooms and no-reply addresses are left out.
- **Linked to the right deal** only when the file names exactly one deal, by its name or street address. A record that names a confidential deal stays inside that deal: hidden and uncounted elsewhere, and never matched to other contacts.
- **Instructions are data.** A title, description, invitee name or body line that reads like an instruction is flagged "kept as text", never batched, never acted on.
- **Attachments** in an .eml are offered to Start from documents (its own checks and caps apply; at most 20 attachments and 25 MB an email); embedded logos are not attachments.
- **One tap** files the clean new records from files (with Undo all); reading the same file twice proposes nothing twice; every filing is one Undo.
- Open to-dos in a calendar file become tasks.

Tested with invented files only: 27 new unit tests (zones and daylight saving, folded lines, encoded words, quoted-printable and base64, non-ASCII names, repeats, injection, confidential, undo) with 22 mutation checks, and a phone and desktop browser flow with axe. Saved deal results and displayed figures are unchanged.
