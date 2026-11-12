# Proposal: Monal, the on-device assistant

Status: proposed; no app code until approved.

## What "its own AI" can honestly be

A website with no server cannot run a model like Claude. It can understand a
broker's question, answer it from the broker's own deal with the app's own
engine, and show where every number came from. That is the base. A small
model can be added later to understand looser wording, but it never produces
a figure.

## Prior art

| Candidate | Licence | Download | Device | Offline | Quality | Maintenance | Network, security | Verdict |
|---|---|---|---|---|---|---|---|---|
| (a) Our question matcher over `app/deal.js`, `app/engine/`, `app/aifacts.js`, `app/command.js` | ours | ~30 KB | any phone | yes | exact where it covers; otherwise "I don't know" | ours | none | **Build (always on)** |
| (c) Chrome built-in model (Prompt API, Gemini Nano) | Google terms | Chrome fetches ~2-4 GB itself | desktop Chrome only; not iPhone or Safari | yes | fair wording | stable for extensions; for websites reported as a trial (sources disagree, unconfirmed) | on device; nothing for us to ship | **Optional, detect only** |
| (b) WebLLM (`@mlc-ai/web-llm` ~0.2.85) | Apache-2.0 | ~6 MB + model ~0.4 GB (Qwen2.5-0.5B, Apache-2.0) | WebGPU; patchy on phones | after download | good wording, poor arithmetic | active | we must host the weights; Llama/Gemma weights excluded (not permissive) | **Later, approval gate** |
| (b) transformers.js v4 | Apache-2.0 | similar | WebGPU or slow WASM | after download | similar | active | same | Alternative; pick one |
| (d) BYO AI (`app/ai.js`, `openAssistant` in `app/aiui.js`) | ours | none | network | no | best | ours | leaves device; confidential deals already refused (`blockReason`) | **Keep** |

## Recommended design

1. **(a) is always on.** Each question is matched to one of a fixed set of
   tasks, computed by the existing engine, and shown with "Show where this
   came from" (field and source, via `sourceLabel`). If an input is blank,
   Monal says so and offers the field to type in. Blank is never zero.
2. **Upgrades later:** (c) where present, then (b) if approved. The model
   only maps the question to a task and phrases our result; any number in
   its reply that is not in our result is rejected.
3. **BYO AI stays** as it is.

## Release 1: what a broker can ask

- Cap rate at $4.6M; price for a 7% cap: `scenarioAnswers`, `solvePrice` (`app/deal.js`)
- DSCR, debt service, loan it supports: `FIGURES` (`app/engine/figures.js`), `sizeLoan` (`app/engine/debt.js`)
- Leases expiring in 2027; WALT: `viewRows` (`app/rentroll.js`), `leaseStats`
- What's missing; what needs review: `RULES`, `openChecks` (`app/dataqc.js`), `reviewItems` (`app/review.js`)
- Compare to my comps: `compBasis` (`app/engine/comps.js`)
- Break-even occupancy: `breakEvenOccupancy`
- My commission at this price: `commission` (`app/calc.js`)
- Where did the NOI come from: `buildFacts` + `sourceLabel`
- Explain DSCR, cap rate, WALT, debt yield: a short glossary in our own words
- Draft a follow-up task for Friday: `addTask` (`app/crm.js`), with confirm
- Open the rent roll, T-12, Underwrite: the actions in `app/command.js`

## Where it lives

- One bird button in the corner of every screen, above the phone tab bar.
  It opens a calm side panel; on a phone, a bottom sheet.
- Three suggested questions for the current screen, then answers, each with
  "Show where this came from" and at most one action button with Undo.
- A real dialog: focus in and back, answers announced, full keyboard, axe
  clean, honours motion off.
- **One assistant:** inside Underwrite, the "Monal's nest" tips feed the same
  panel and the tool's own bird hides.

## Safety

- (a), (b) and (c) send nothing off the device. Deal text leaves only
  through BYO AI, which already refuses confidential deals.
- Document text is data, never instructions: it is cited, never run.
- Answers are plain text, never HTML.
- Anything that changes a deal or adds a task shows the change, waits for a
  yes, then offers Undo.
- Release 1 saves no chat, so the data format does not change; the golden
  outputs stay identical because the engine is only read.

## Build order

| Release | What | Test idea | Owner's yes? |
|---|---|---|---|
| 1 | Bird, panel, read-only questions | 60 questions on invented deals with hand-worked answers; 20 "refuses to invent" (blank price, no rent roll) must say "not in this deal" | yes |
| 2 | Actions with confirm and Undo | nothing changes without a yes; Undo restores exactly | no |
| 3 | Underwrite nest folded in | every nest tip still reachable | no |
| 4 | Chrome built-in model | a fake model that adds a number is rejected | yes |
| 5 | Optional download: WebLLM + ~0.4 GB model, kept in this browser's storage, deletable in Settings, nothing sent | both question sets pass with and without it | yes (new library) |

## Questions for the owner

1. **Start with a "front desk" over your own data and no language model?**
   Recommended: yes. Exact, works on every phone, free.
2. **Monal the bird as the one assistant everywhere**, absorbing the
   Underwrite nest? Recommended: yes.
3. **An optional ~0.4 GB per-device download later?** Recommended: decide
   after release 3, once you see what release 1 misses.
