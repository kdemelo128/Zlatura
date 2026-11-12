# A cleaner Deal page, and a Home that shows what matters first

The Deal's Overview was one long stack of cards. It is now seven named groups (Overview, Income and expenses, Value and returns, Financing, Leases, Documents, Activity). Each section is a fold: a title button with a one-line summary while closed (for example "$4.50M asking · 6.67% cap · $300K NOI", "DSCR 1.28x · loan $3.15M", or "Nothing entered yet"). The Overview's two sections are open by default, the rest closed, and the choice is kept per deal on this device. In the New look a sticky bar of group chips (scrolling sideways on a phone) jumps to each group. Every control is still there, at most two taps away: open the section, then use it. The Sections menu opens a closed section before it moves there.

Home: Recent activity is closed by default with a summary (how many items and the latest). Tasks and Contacts with nothing in them shrink to one quiet row with their add action. The choice is kept on this device. Both looks get the fold; Classic's own styling is unchanged.

Kept from the Codex deal-workspace branch, merged as it was: the Sections menu, the phone toolbar order, 44 px CRM targets, the sticky deal name following a rename, action dialogs with an accessible name that close cleanly on Back, and its navigation flow (updated for the new section ids). Its version bump was dropped.

Tested with invented data: new `home-fold-flow` and `deal-groups-flow` (320 px, phone and desktop; light and dark axe, 130% text with no sideways scroll, character-by-character typing, an edit under 150 ms with everything open, the same deal figures before and after folding, reload memory), both of which fail on the old app. No figure, saved shape or calculation changed.
