# Monal's own AI model can be turned on, on your device (phase 1: Settings)

Release 5 of the assistant (`docs/proposals/on-device-brain.md`, approved). Settings > Documents and AI has a new card, "Monal's brain on this device". It is off until turned on; nothing is downloaded before that.

- **Three sizes** (Qwen3 0.6B Small, 1.7B Standard, 4B Large; Apache-2.0), a plain support line (WebGPU, 16-bit graphics support, graphics and device memory, with the iPhone/Safari 26 wording), Turn on with a progress bar and Cancel, Ready, and "Remove the brain" (deletes the downloaded files). The choice is kept on the device (`monal.brain`).
- **Vendored WebLLM 0.2.87** (`vendor/web-llm-0.2.87/`, Apache-2.0, identical to upstream, SHA-256 in `THIRD_PARTY.md`), run in a module Web Worker (`app/brainworker.js`). Not in the install set (6.8 MB): the service worker's existing `vendor/` rule keeps it on first use.
- **Helpers in `app/brain.js`**: the facts text (blank is "not given", never 0), the task prompt and parser over the front desk's own task list, and a number check that finds figures in an answer that are not in the facts (formatting- and rounding-tolerant). Not yet connected to the bird (phase 2).
- **Tested**: unit tests with a stub engine (support, state machine, helpers, vendoring), and `brain-flow` (stub engine, no download): no WebGPU, fake GPU through turn on, progress, ready, reload, remove, cancel, in both looks, with axe and 44 px targets. Both fail on the old code. Saved results and the 646 displayed figures are unchanged.
- **Not checked**: a real model load (the test machine's graphics adapter has no 16-bit support); to be hand-tested on a laptop in Chrome and an iPhone with Safari 26.
