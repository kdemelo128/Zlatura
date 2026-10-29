# Docs and tests now match what shipped (conformance drift fix)

The conformance check of 4.7.50 to 4.7.64 found stale documents, one missing test and one fragile selector.

- **Acceptance matrix:** rows added or corrected for the Back button, hostile text and time zones, the -$0 fix, the .ics export, the rent schedule, cost caps and the prompt-injection set; the header now says which version it covers.
- **PLAN_STATUS:** F3, F6 and F7 ticked, F10 split out, the counts recounted, and a new section "Owner additions and changes to the plan" records the owner's additions (Monal rename, platform expansion, lead finder last, Documents hub, UI revamp, time-zone acknowledgement, work order). The master plan is not edited.
- **Feature study:** `feature-ideas.md` now records the owner's approvals of ideas 1 to 3.
- **New test:** `tests/e2e-flows-listed.test.js` fails when a `*-flow.mjs` file is missing from the FLOWS list of `tests/e2e/run.sh` (om-flow, a diagnostic, is exempt).
- **Undo on a deleted brief** builds its selector with `CSS.escape`, so a stored id with a quote cannot throw.
- Tested with the new Node test, which fails against a `run.sh` that leaves out a flow. Saved results and displayed figures are unchanged.
