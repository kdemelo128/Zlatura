# Process: the owner's support code is checked on every rent roll, T-12 and underwriting PR

A rule change only (`CLAUDE.md`, `docs/working-rules.md`); no app code changed.

- **Look first, adopt what applies, report it.** PRs that touch the rent roll, T-12, NOI, WALT, Review Queue or Data QC read the support code and its mapping, adopt the applicable checks in the app's own modules with invented-fixture tests that fail on the old code, and say in the PR what was adopted, already covered or not applicable.
- **Nothing from it is committed or quoted**, and the shared-figures and names check against `private/` is run first. Changes to stored fields or golden outputs stay approval gates.
