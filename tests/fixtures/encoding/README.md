# Encoding fixtures (F2)

Invented files: no real property, tenant or figure. Each one is read the way the
app reads a CSV (`app/textfile.js`).

| File | Saved as | What it checks |
|---|---|---|
| `rentroll-windows-1252.csv` | Windows-1252, CR LF | accented names (é, è, ø, ñ), a curly apostrophe (’) and an en dash (–) read right, and the import says which encoding it used |
| `rentroll-utf8.csv` | UTF-8, no byte-order mark | the same rent roll; must read exactly as before, with no note |
| `t12-windows-1252.csv` | Windows-1252, CR LF | a T-12 whose line labels carry the same characters |

Before F2 the app read every file as UTF-8, so in the Windows-1252 files each of
those characters became “�”.
