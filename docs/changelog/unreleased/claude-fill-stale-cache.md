# A filled template no longer shows the blank template's figures in a phone preview

A filled workbook keeps each formula's stored result, and Outlook's preview and iOS Quick Look show that stored result without recalculating. A formula such as a cap rate (`=B6/B5`) therefore showed the blank template's figure beside the new price until the file was opened in Excel.

- **Stale results removed:** after a fill (single cells, rent roll tables and the comp templates), every formula that reads a filled cell, directly, through a range or a named range, or through another such formula, loses its stored result. A formula that reads nothing filled keeps its figure, so untouched sheets look as before. A shared-formula copy is cleared with the formula it copies; a copy that reads filled cells while its first cell does not keeps its stored result (Excel and LibreOffice still recalculate it on opening).
- **Recalculated on opening:** the workbook was already marked to recalculate in full when opened and its calculation chain removed; that is unchanged and now pinned by a test.
- **Marked in the app:** in the mapping grid, a formula with no stored result reads "ƒ calc in Excel" (and "no figure stored; calculated when opened in Excel" for a screen reader, the tooltip and the tap message). It is never shown as 0 or blank.
- **Tested** with invented fixtures: `tests/tplstale.test.js` (five tests) and the `tplstale-flow` browser flow, plus the LibreOffice recalculation, which compares every stored value of the filled workbook with the recalculated one. All fail on the previous code; four mutations (results kept, everything cleared, shared copies kept, no marker) each fail the tests.
- **Saved results:** unchanged (618 saved deal results and 646 displayed figures identical).
