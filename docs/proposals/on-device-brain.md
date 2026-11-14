# Design note: Monal's own AI, on the device (assistant release 5)

Status: approved by the owner in the session chat on 2026-11-14 ("just make
it free for now … keep building the bot within itself, something that is
smart enough without a server … no pushback"). This is release 5 of
`docs/proposals/on-device-assistant.md` (WebLLM), which needed the owner's
yes; that yes is given.

## What it is

An open language model that downloads once to the broker's device and runs
there on the graphics chip (WebGPU). No server, no account, no cost per
question, and nothing a broker types or reads leaves the device. It sits
behind the Monal bird: the exact on-device front desk still answers what it
covers; the model handles everything else in plain language.

## Prior art

| Candidate | Licence | Size | Maintenance | Offline | Network | Security | Verdict |
|---|---|---|---|---|---|---|---|
| WebLLM `@mlc-ai/web-llm` 0.2.87 (2026-10-30; 0.2.88 is under two weeks old) | Apache-2.0 | 6.8 MB script, loaded only when turned on | active, monthly releases | yes, after download | model files from huggingface.co/mlc-ai and the compiled model library from raw.githubusercontent.com/mlc-ai, once | runs in a Web Worker; no code from the model is run; model output is text only | **Use** |
| transformers.js `@huggingface/transformers` 4.3.2 | Apache-2.0 | 10 MB | active | yes | same kind | same | alternative; WebLLM has the faster WebGPU path for chat models |
| Chrome built-in model (Prompt API) | Google terms | browser-managed | changing | yes | none | browser | not on iPhone or Safari; later, as an extra |
| Firm AI server (`server/`, `/api/ask`) | ours | none | ours | no | the firm's server | key on the server | dormant until the owner hosts it |

Models (permissive licences only; Llama and Gemma are left out for their
licences):

| Model | Licence | Memory needed (WebLLM's figure) | For |
|---|---|---|---|
| Qwen3-0.6B q4f16 | Apache-2.0 | about 1.4 GB | phones, "Small" |
| Qwen3-1.7B q4f16 | Apache-2.0 | about 2.0 GB | default on laptops and desktops, "Standard" |
| Qwen3-4B q4f16 | Apache-2.0 | about 3.4 GB | strong desktops, "Large" |

## Design

1. **Off until turned on.** Settings > Monal AI > "Monal's brain on this
   device": shows the three sizes with their download size, checks WebGPU
   and memory first (`navigator.gpu`, adapter limits), and says plainly when
   the device cannot run it. Download shows progress and can be cancelled;
   the files stay in the browser's cache storage; "Remove the brain" deletes
   them. Nothing is fetched before the broker turns it on.
2. **The library is vendored** (`vendor/web-llm-0.2.87/`, licence text,
   SHA-256 in `THIRD_PARTY.md`), loaded with a dynamic import only when the
   brain is on, run in a module Web Worker (`app/brainworker.js`) so the page
   stays inside the 150 ms per edit budget. It is not in the service worker's
   install list (too large); it is cached on first use.
3. **What the brain does (`app/brain.js`):**
   - **Understand the question.** It first maps the question to one of the
     front desk's tasks (the same task list `app/assistant.js` uses) as JSON;
     the task runs on our engine and our answer is what is shown, with "Show
     where this came from". The model never computes a figure.
   - **Talk.** For anything else (explain a term, draft an email or a
     follow-up note, summarise a document the deal keeps in its document
     memory, compare two deals in words), it answers from a short system
     prompt plus the open deal's fact list (`app/aifacts.js`).
   - **The number check.** Any figure in a model answer that is not in the
     facts or a task result is marked "not from your data" and the answer
     carries that warning. Blank facts are sent as "not given", never zero.
   - Qwen3 answers with its thinking turned off by default (faster); a
     "Think it through" toggle turns it on for hard questions.
4. **Confidential deals:** nothing leaves the device either way, so the brain
   may read them; it is still labelled "on this device".
5. **The web without a server:** a later slice adds free sources that allow a
   browser to ask directly (Wikipedia's search API first), labelled with
   their source; it is out of this release.

## Tests

Unit: the task-mapping parser (bad JSON, unknown task, a task with missing
inputs asks for them), the number check, the facts text (blank is "not
given"), the settings state machine (off, checking, unsupported, downloading,
ready, removed). Browser flow `brain-flow` with a stub engine injected in
place of WebLLM (no download in tests): turn on, progress, ready, a question
the front desk cannot answer is answered by the stub, an invented figure is
marked, remove. The real model is checked by hand on a laptop (Chrome) and an
iPhone (Safari 26 with WebGPU); results reported with the device and browser.

## Not in this release

Web sources, voice, the Chrome built-in model, and learning from corrections
(the learning loop proposal covers that).
