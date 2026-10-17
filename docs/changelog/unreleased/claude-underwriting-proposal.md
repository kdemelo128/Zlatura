# Design proposal: underwriting (normalised NOI, strict review, WALT by GLA)

A proposal only (`docs/proposals/underwriting.md`); no app code changed and no saved result moved.

- **Reuse first:** it maps the owner's support-code ideas onto what the app already has. The approved T-12 gap and spike detection is not new, and 23 of the 59 checks are already covered.
- **What is new:** a normalisation method on each T-12 line with a normalised NOI and bridge, N counted from the months with activity, an optional strict review setting, WALT by total GLA, and 14 checks to adopt.
- **Eight small PRs in order**, each with its tests, and ten numbered decisions for the owner. Stored-field changes and the strict setting are approval gates.
