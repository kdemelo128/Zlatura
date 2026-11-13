# Current UI ownership and branch boundaries

Owner's latest instruction reserves Home's pulse/customization and app-wide speed work, Underwrite, the bird, readers/OCR, assistant, To file inbox/routing and connectivity for Claude. Codex is continuing the New look UI for Comps, Tools and Documents, one pull request per screen. Deals PR #159 is already merged. No old reader branch is a dependency or is to be reapplied.

- Comps: `codex/comps-new-look`, based on main 4.7.159. Static Comps markup, table/control semantics and scoped visual styles only. Existing manual-entry actions are reused. New shortcuts use a distinct UI attribute, preserving original `data-add` selectors and handlers.
- Tools: `codex/tools-new-look`, based on main 4.7.159. Catalog/list/card UI only; all tool definitions, calculator/input logic and existing tool opening remain unchanged.
- Documents: reserved next UI slice. Existing PDF-pages/Convert presentation only; no worker, reader, conversion, intake or financial logic changes.

Before each commit, review changed paths and hunks against these boundaries. Save ordinary working-branch commits remotely so a cloud restart does not lose unfinished work. Before a PR, merge current main, preserve all other workers' changes, choose the next free release version, and report exact tests and limitations. No merge, force-push, production change or deployment by Codex.

Browser checks use invented fixtures only, run serially for reliable performance measurements, and retain accessibility/error/budget checks. Acceptance counts never establish financial correctness. Claude's uncommitted session work is not visible here; this note follows the owner's latest pasted split and repository evidence.
