# Model Hub: one dashboard for every model (owner's guide)

A local page on your Mac where you chat with the models in one place. Start it from the
Zlatura folder:

```
npm run hub
```

It opens the dashboard in your browser by itself (set `HUB_NO_OPEN=1` to stop that) and also prints the address. Press Ctrl+C in
Terminal to stop. The address changes each time, on purpose: the `t=` part is a one-time token
that keeps other websites and other programs from using the hub.

## Double-click to start
In Finder, double-click `Start Model Hub.command` in the Zlatura folder. The first time, right-click
it, choose Open, then click Open again, because macOS warns about scripts that were downloaded. It
needs Node 22 (see `docs/harness-setup.md`). It fetches the latest code only when you have no unsaved
changes, installs what is missing, and starts the hub.

## What you see
- **Left:** each model with a coloured dot. Green = ready. Amber = needs a key or a tool.
  Grey = unavailable. Below that, the roles (designer, researcher, bug-fixer and so on).
- **Top bar:** **Send to** (Auto by role, all ready models, or one model), **Role**, and **Kind of
  task** (used by Auto to pick the right model through the roles table).
- **Centre:** your messages and each model's reply side by side, with how long it took. A model
  that fails shows a red card with the reason and the others still answer.
- **Cmd + Enter** sends.

## How each model connects (all official routes, no browser automation)
| Model | Route | What you do |
|---|---|---|
| Codex (GPT) | the Codex command-line tool you are already signed in to (tested on your Mac) | nothing |
| Claude | Claude Code on your Mac, if installed (`claude -p`; untested here) | nothing if you have it |
| Gemini | Google's official API with a free key from Google AI Studio (UNVERIFIED: check Google's page) | create a key, paste it in the hub |
| Grok | xAI's official API, a key; probably paid credits (UNVERIFIED) | optional, only if you choose |
| Kimi | Moonshot's official API, a key; probably paid credits (UNVERIFIED) | optional, only if you choose |
| OpenRouter | one key that reaches many models, some free (UNVERIFIED); your prompts pass through OpenRouter as well as the model's company | optional: create a key, paste it in the hub |
| Muse (Meta AI) | no official API known | unavailable for now |

Why not "sign in for you": the hub never sees your Google password or any session. A Google
sign-in on a chat website gives you the chat, not programmatic access. Each vendor's official
programmatic routes are the two above (a signed-in command-line tool, or an API key).
Driving the chat websites with an automated browser is a separate, riskier thing (it can break
a site's terms and get an account restricted, and it breaks whenever the page changes); it is
not built here.

## Keys
- Paste a key into the box next to the model in the hub. It is saved to
  `~/.zlatura-hub/keys.json` on your Mac (owner-only permissions, outside the repository) and is
  never shown again, never sent to the page, and never committed. You can also set the variable
  (`GEMINI_API_KEY`, `XAI_API_KEY`, `MOONSHOT_API_KEY`) yourself.
- Only the free path is used until you say otherwise. A model with no key just stays amber.

## Safety
- Listens on `127.0.0.1` only. Every request needs the token; the Host and Origin must be this
  machine. Messages are limited in size.
- A message that mentions a key, an email address or the `private/` folder is refused before any
  model sees it (a simple text check, not a guarantee). Nothing from your project folder is attached
  to a message: CLI models start in an empty temporary folder, though a CLI may still be able to read
  files elsewhere on your computer depending on its own sandbox.
- Your message goes to the vendors you pick, and only to them. Do not type anything you would not
  send to that vendor.
- The model names the hub uses are defaults and may be wrong: change them with `HUB_GEMINI_MODEL`,
  `HUB_XAI_MODEL`, `HUB_KIMI_MODEL`, `HUB_OPENROUTER_MODEL`.

## Connect your models
The top of the left panel says "N of M models ready". Each model that is not ready has a small
expandable block with the official steps, a link to the vendor's own sign-in or key page (it opens
in a new tab), a note on whether it is free, and a box to paste the key where one is needed. The
links and the free-tier notes are UNVERIFIED: check each page is current.

What it cannot do: it does not sign in to any account for you, and it never sees a password or a
session. You sign in on the vendor's page, or in the vendor's own command-line tool, yourself. Muse
(Meta AI) has no official way for a program to use it, so the hub cannot connect it.
