# Connecting the AI models to the harness (owner's guide)

You do not add this repository to ChatGPT, Gemini, Grok, Kimi or Muse. The harness runs
**on your own computer**, inside a copy of this repository. It talks to two kinds of
worker: command-line tools you are already signed in to, and chats you paste into.
Nothing here uses an API key, and nothing sends a file from `private/` to anyone.

| Model | How it connects | What you do once |
|---|---|---|
| Claude | Claude Code (this kind of session) | nothing, it is the hub |
| GPT / Codex | Codex CLI on your computer, signed in with your ChatGPT account | install, sign in |
| Gemini | Gemini CLI on your computer, signed in with Google | install, sign in |
| Grok | paste-in chat at grok.com | nothing to install |
| Kimi | paste-in chat at kimi.com | nothing to install |
| Muse (Meta AI) | paste-in chat at meta.ai | nothing to install |

The two command-line install lines below are from memory of each vendor's public docs
(UNVERIFIED): check the vendor's own page first. Whether your plan includes a command-line tool
at all is the first thing to find out; if it does not, that model simply becomes a paste-in
worker and nothing else changes.

## One-time setup on your Mac (about 15 minutes)

1. **Node 22 and git.** Check with `node -v` (should say v22) and `git --version`. Install
   Node from nodejs.org if needed.
2. **Get the repository.** In Terminal:
   `git clone https://github.com/kdemelo128/Zlatura.git` then `cd Zlatura` then `npm ci`.
3. **Codex CLI.** As I remember it: `npm install -g @openai/codex`, then run `codex` once and
   choose "Sign in with ChatGPT". Check the vendor's page for the current line.
4. **Gemini CLI.** As I remember it: `npm install -g @google/gemini-cli`, then run `gemini`
   once and sign in with Google. Check the vendor's page for the current line.
5. **See what works.** In the repository folder run `node tools/harness/run-task.mjs doctor`.
   `ok` means ready. `NO` next to codex or gemini means that tool is not installed or not
   signed in; the router then uses the next model in the role.
6. **Look at who plays which role.** `node tools/harness/run-task.mjs roles`.

## Running one task (the whole loop)

1. Write a task card in `docs/tasks/` (copy `docs/tasks/example-docs-card.md`). Or ask Claude to
   write it. The Model Board page makes a card for you.
2. `node tools/harness/run-task.mjs plan docs/tasks/<card>.md` shows the role, the worker and
   the reviewer.
3. **CLI worker (Codex, Gemini):** `node tools/harness/run-task.mjs run docs/tasks/<card>.md codex`.
4. **Paste-in worker (Grok, Kimi, Muse):**
   `node tools/harness/run-task.mjs packet docs/tasks/<card>.md grok` writes a file under
   `harness-out/`. Paste it into the chat, copy the reply into a file, then
   `node tools/harness/run-task.mjs ingest docs/tasks/<card>.md grok reply.txt`.
5. The draft lands on a branch `agent/<worker>/<card>` on your computer. Nothing is pushed.
6. Hand the branch name to Claude. Claude reads the diff, runs the real tests and opens the PR.
   You merge.

## Where Claude fits

The Claude session in the cloud cannot see your computer's logins, so it cannot run Codex or
Gemini for you. Two ways to close the loop:

- **You run the commands and tell Claude the branch name** (simplest, works today).
- **Run Claude Code on your Mac as well**, in the same folder, so one session can run the
  harness and review the result. Check your Claude Pro plan page for Claude Code access.

## Also worth knowing

- Codex and Gemini can each connect to a GitHub repository from their own websites. That is
  separate from this harness and not needed for it. If you use it, `AGENTS.md` is the rule file
  Codex reads.
- Free chat plans stop without warning. The router falls back to the next model in the role.
- Never paste anything from `private/` into any chat. The packet is built only from the files
  the card names, but what you paste by hand is up to you.
- If a model says "tests pass", ignore it. Claude runs them.
