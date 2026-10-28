# Key dates and task due dates go to the iPhone calendar

A deal's key dates had nowhere to go except by hand into Calendar.

- **Add to calendar…** on the Key dates heading, and a calendar button on each date, open a sheet: tick the dates and tasks, optionally add the 1031 day 45 and day 180 dates from the deal's one Closing date, choose whether titles show the deal name (with a warning for shared calendars), and make a `.ics` file.
- **All-day events**, ending on the next day, with stable ids so adding again updates the same events; a reminder at 9 a.m. a week before and the day before (tasks: the day before). Blank, invalid and done dates are left out and counted; nothing is set to today.
- **Safe text**: line breaks and special characters in titles are escaped, and lines fold at 75 bytes without splitting a character.
- **Sharing**: the home-screen app uses the share sheet and checks the real file type; elsewhere it downloads. `canShareFiles` now tests the type it is given (it only tested Excel before).
- Nothing is fetched or stored except the "show deal name" choice on this device. Not yet tried on an iPhone.
- Tested: `tests/ics.test.js` (exact file text, folding with emoji and Arabic, injection, date rollovers, three time zones), `tests/e2e/calendar-flow.mjs`. Saved results unchanged.
