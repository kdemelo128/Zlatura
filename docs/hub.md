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
- **Left column:** each model with a coloured dot (green = ready, amber = needs a key or a tool, grey =
  unavailable). A ready model also shows its **live usage** (see below). Then the roles, and a folded
  "Connect your models" block. On a phone the three blocks start folded; tap one to open it.
- **Top bar:** the **project** switcher and a **Projects...** button (add or remove one), the overall
  status ("4 of 7 models ready, 2 running, 2 queued") and **Open usage page**, a menu of each provider's own
  usage page.
- **Tabs:** **Chat**, **Agents**, **Pull requests**, **Jobs**. Chat has **Send to** (Auto by role, all ready
  models, or one model), **Role** and **Kind of task** (used by Auto to pick the right model through the
  roles table); each model's reply sits side by side with how long it took, and a model that fails shows a
  red card with the reason while the others still answer. **Cmd + Enter** sends.
- Light and dark follow your computer's setting. Buttons and fields are at least 44 px tall, keyboard focus
  is outlined, and nothing scrolls sideways at phone width.

## Live usage per model
Every ready model shows a card that refreshes every 2 seconds while the page is visible:
requests today (ok, errors, rate-limit 429 hits), input and output tokens, when it was last used, how many
calls are running right now, a **rate-limited now** badge (with the retry time when the provider sent one),
and, where there is one, a progress bar against an approximate daily limit.

**What is counted and what is not.** The hub counts the calls *it* made, in `~/.zlatura-hub/usage.json`
(owner-only, written atomically, counts only: no prompt, no reply, no error text, no key; days older than 60 are
dropped). One wrapper around every model call does the counting, so a chat, an agent run, `npm run ask` and cheap-first
routing are all counted exactly once, and a model added later is counted too. It does **not** see anything you do in
the Claude or ChatGPT apps or other tools, so it is never the vendor's meter.
- **Tokens:** shown for Gemini, Grok, Kimi and OpenRouter, which return them in the reply. Codex and Claude (command-line
  tools) return none, so those two are counted in requests only, and the card says so.
- **Plan balances:** there is no official way to read a Claude Pro or ChatGPT balance, so the hub never shows one.
  It shows **Plan usage:** a link to the provider's own page.
- **Daily limits** (`LIMITS` in `tools/hub/providers.mjs`) are approximate and UNVERIFIED: Gemini about 1,500
  requests a day on the free tier, OpenRouter about 50 on free models. They change often; each bar links to the
  official page. Providers with no published daily cap (the two plans, paid APIs) show no bar.
- A 429 from an API, or a command-line tool's error text that mentions a limit, counts as a rate-limit hit.
  The badge clears after the retry time or the next successful call.
- Two programs at the very same instant (the page and `npm run ask`) could in theory lose one count.

## Projects: several at once
The **project** switcher in the top bar picks which project the tabs work on. A project is a folder with its own
git repository:

- **Cards:** `<project>/docs/tasks`. **Rules:** `<project>/AGENTS.md` (a plain rule is used if it has none).
- **Results:** an agent draft goes on a local branch (`agent/<model>/<card id>`, not pushed) **in that project's
  folder**, through the same harness ingest as before, with the same strict diff check.
- **Pull requests tab:** follows the selected project (its `"github"` value, or its `origin` remote).
- **Chat** is tagged with the project too (its roles and kinds apply).

**Add a project** (Projects... then "Add a project by its folder") by typing the full path. The hub accepts it only if
the folder exists, is the top folder of a git work tree, has no link (symlink) in its path, has no `..` in it, is not
inside another project or its `private/` folder, does not hold another project, and is not your home folder or the hub's
own `~/.zlatura-hub`. It is saved in `~/.zlatura-hub/projects.json` (owner-only). A project you added can be removed from the
same panel; its files are not touched. Projects listed in `tools/harness/workers.json` (and the one the hub started from)
stay. A folder swapped for a link after it was added is refused when a job would use it.

**A future "trading bot", with no code change.** Add its folder in the page, then edit its entry in
`~/.zlatura-hub/projects.json` (outside any repository, so no model can change it):

```
// the // notes are for reading: remove them in the real file, which must be plain JSON
{ "version": 1, "concurrency": 3, "projects": [
  { "id": "trading-bot", "name": "Trading bot", "folder": "/Users/you/code/trading-bot", "github": "you/trading-bot",
    "protectedPaths": ["live/", "keys.yaml"],        // replaces the shared list (optional)
    "extraProtected": ["src/exchange/"],              // added to whichever list applies
    "requiresDesign": ["risk/"],                      // a card touching these needs an approved-design line
    "roles": { "quant": { "what": "Writes and checks backtests.", "primary": "codex", "fallbacks": ["claude-sonnet"] } },
    "kinds": { "backtest": "quant" } } ] }
```
`private/`, `.env`, `.git/` and `.github/` are protected in every project whatever its list says, and a draft that touches a
protected file, leaves its card's scope, deletes, renames or changes a mode is refused as before. A role or kind that
names an unknown worker or role is refused with a message, not guessed. The project's cards go in
`<its folder>/docs/tasks` in the same card format (`id`, `kind`, `goal`, `scope`).

## Jobs
Agent drafts are background jobs with an id and a status: **queued, running, done, failed** (cancelled shows as failed
with "cancelled"). At most **3** run at once across all projects (change it on the Jobs tab, 1 to 8, or with
`HUB_CONCURRENCY`; the choice is kept); the rest wait in order. **Cancel** works on a queued or running job (a running
command-line model is stopped). The same card in the same project cannot be queued twice. Chat and "put on a local
branch" are listed in the Jobs tab too but never wait behind the limit. The list is in memory: restarting the hub
clears it. Nothing is pushed by any job.

## How each model connects (all official routes, no browser automation)
| Model | Route | What you do |
|---|---|---|
| Codex (GPT) | the Codex command-line tool you are already signed in to (tested on your Mac) | nothing |
| Claude | Claude Code on your Mac, if installed (`claude -p`; untested here) | nothing if you have it |
| Gemini | Google's official API with a free key from Google AI Studio (UNVERIFIED: check Google's page) | create a key, paste it in the hub |
| Grok | xAI's official API, a key; probably paid credits (UNVERIFIED) | optional, only if you choose |
| Kimi | Moonshot's official API, a key; probably paid credits (UNVERIFIED) | optional, only if you choose |
| OpenRouter | one key that reaches many models, some free (UNVERIFIED); your prompts pass through OpenRouter as well as the model's company | optional: create a key, paste it in the hub |
| GitHub (pull requests) | GitHub's REST API with a fine-grained token you create, for the Pull requests tab | create a token, paste it in the hub (not a chat model) |
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

## Type a command
The same screening, routing and models are available from a terminal, with no page to open:

```
npm run ask -- "Summarise the pros and cons of a triple-net lease"          # Auto picks by role
npm run ask -- --cheap --kind research "Compare two ways to model CAM"     # free models first
npm run ask -- --to codex "Explain this regex: ^\d{3}-\d{4}$"              # one specific model
npm run ask -- --to all "Is 'cap rate' the same as 'yield'?"               # every ready model
```

Add `--json` for machine-readable output, or pipe text in with no words. `--cheap` (the checkbox
"Save my usage: try free models first" on the page) tries the free models before the paid ones, so your
paid plans last longer. Money, parsing, security, data-format and bug tasks always use the strongest
model, because a wrong answer there costs more than the saved usage. The exit code is 0 if any model
answered, 1 if every model failed, and 2 if the message was refused.

## Download your Box folders
`npm run box -- <command>` downloads due-diligence, analysis and recent-sale folders from Box so
you do not have to do it by hand. It uses Box's official REST API with an access token you create.
Everything about the Box API here is from memory and UNVERIFIED, and it was **not tested against a
real Box account** (only against a stand-in that answers like the API is remembered to).

**Get a token (UNVERIFIED steps).** Open https://app.box.com/developers/console, create an app
(a custom app using standard OAuth 2.0 is the usual choice), open its Configuration tab and press
"Generate Developer Token". A developer token expires quickly (about an hour, UNVERIFIED), so make
a new one when the tool says "the token was refused or expired". Then save it (it is read from
standard input, so it never lands in your shell history):

    pbpaste | node tools/hub/box-cli.mjs save-token      # or: node tools/hub/box-cli.mjs save-token, paste, Ctrl-D

It is stored in `~/.zlatura-hub/keys.json` (owner-only), the same place as the hub's keys. You can
also set `BOX_ACCESS_TOKEN` in the environment instead.

**Three commands**
- `npm run box -- search --names "due diligence,analysis,sale"` lists matching folders (id and path).
  The names are optional; those three are the default.
- `npm run box -- plan 12345 67890` lists counts and total size by file type. Nothing is downloaded.
- `npm run box -- download 12345 67890 --to ~/Zlatura-data/box --yes` downloads. Without `--yes` it
  only plans. Run it again later to resume: files with the same size and checksum are skipped.

**Safety rules**
- The destination must be outside the Zlatura folder and outside any git repository (default
  `~/Zlatura-data/box`); otherwise the tool refuses. Downloaded files are confidential: never move
  them into the repository.
- Only these types are downloaded: pdf, xls, xlsx, xlsm, csv, doc, docx, txt, rtf, msg, eml. Other
  types are counted as skipped, by type, and never saved.
- Folder and file names from Box are cleaned before they become local names, so a hostile name
  cannot write outside the destination. A name clash gets " (2)".
- Nothing is uploaded anywhere. The token stays on this computer and is never printed or logged; it
  is not sent to the download address Box redirects to.
- Limits: 30 folder levels deep, 50,000 files per run, 60 seconds per request, up to 5 waits when
  Box says "too many requests".

Not tested against a real Box account.

## Pull requests (no trip to the GitHub website)
The third tab, **Pull requests**, and `npm run pr` do the routine pull request jobs for the project's
repository. Nothing was tested against the real GitHub: the tests use a stand-in that answers as the
API is remembered to, and the token permission names below are UNVERIFIED (check GitHub's page).

**Connect.** In the left panel open "GitHub (pull requests)" and follow the steps: a fine-grained
token for ONE repository with Pull requests Read and write, Contents Read and write (merging and
updating a branch need write; Read alone is not enough, UNVERIFIED), Checks Read, Commit statuses
Read (Metadata Read is added for you). Paste it into the box. It is saved like the model keys
(`~/.zlatura-hub/keys.json`, owner-only), goes only to `api.github.com`, and is never sent to the
page, printed, logged or committed. From a terminal: `pbpaste | npm run pr -- save-token`.

**Which repository.** The selected project's `"github": "owner/repo"` (in `tools/harness/workers.json` or
the project's entry in `~/.zlatura-hub/projects.json`) if it has one, else the `origin` address of the project
folder. The page cannot name a repository or a folder.

**What you can do**
- **See** every open pull request: title, branch, checks (passed / running / failed), whether it can
  merge (clean, conflict, behind, blocked, draft), and the review state.
- **Create** one from a local branch: the title is the first `# ` line of the branch's file in
  `docs/changelog/unreleased/`, the description is the rest of it plus the repository's pull request
  template if there is one. Edit both, press Create, confirm. This pushes only that branch (never
  forced) with your own git sign-in, then opens the pull request. A title or description with a key,
  an email address or `private/` in it is refused.
- **Merge** (squash): press Merge, the hub fetches the checks again, shows them, and you confirm. It
  refuses, with the reasons and no override, when any check is failing or still running, when no check has reported, when the
  checks cannot be read in full, or when there is a conflict, the branch is behind, it is a draft, or GitHub says
  it is blocked. If the branch moved after you looked, it refuses and asks you to look again.
- **Update branch** from main (confirmed).
- **Auto-merge when checks pass** (confirmed): GitHub's own feature, so GitHub, not this page, does the
  merge later; it needs "Allow auto-merge" and required checks on the repository. It is refused for
  failing checks or a conflict. Turn it off from the same card.

Nothing merges without your click and confirm, and the hub never merges in the background.

**Terminal.** `npm run pr -- list`, `check 7`, `create <branch>`, `merge 7`, `update 7`, `auto 7`
(`--off` to cancel), `--project <name>` (a project from `workers.json`). Anything that changes GitHub only runs with `--yes`; without
it you see what would happen. The same refusals apply.
