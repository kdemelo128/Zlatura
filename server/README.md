# Zlatura AI server

The Zlatura app is a static page: anyone can read its code, so it can't
hold an API key. This small server holds the keys and does the AI work for the
app:

| Endpoint | What it does |
|---|---|
| `POST /api/extract` | Reads figures out of PDFs or text (OM, rent roll, T-12, lease) with Claude. Each figure comes back with the verbatim passage it was read from, which the app checks against the document before showing it. |
| `POST /api/assist` | Answers a question about one deal from the facts the app sends (figures and their sources), citing the facts it used. |
| `POST /api/transcribe` | Sends a recording to a speech-to-text service and returns the transcript with timings. |
| `POST /api/meeting` | Turns a transcript into a summary, decisions, action items and figures mentioned, each with the words that support it. |
| `GET /api/health` | Says whether AI and transcription are set up (never the keys). |

Nothing is logged or stored: no documents, questions, recordings or answers.
The model is `claude-opus-5-5` (set `AI_MODEL` to change it), asked for
structured JSON, with Anthropic's server-side fallback turned on
(`fallbacks: "default"`) so a request the model declines on safety grounds is
retried on the recommended fallback model rather than failing.

## Running it

Needs Node 20 or later.

```sh
cd server
npm ci
node tokens.mjs new device-a-phone      # prints a token once, and the line to paste into the tokens file
APP_TOKENS_FILE="$HOME/zlatura-tokens.txt" \
ALLOWED_ORIGINS="https://yourname.github.io" \
ANTHROPIC_API_KEY="sk-ant-..." \
STT_URL="https://api.openai.com/v1/audio/transcriptions" STT_API_KEY="..." \
npm start
```

| Variable | |
|---|---|
| `APP_TOKENS_FILE` | A file you edit, one line per device: `<label> <sha256-hex-of-token>`; `#` starts a comment. Labels are `a-z`, `0-9` and `-`, up to 40 characters, and unique. The server holds only hashes, never a token. See "Tokens, one per device". |
| `APP_TOKEN_HASHES` | The same as `label:hex,label:hex`, for a host with no persistent file. Withdrawing a device there means a restart. |
| `APP_TOKEN` | The older single shared token (16+ characters). Still accepted, as the device `legacy`, with the same limits. A warning is printed at startup if it is set beside per-device tokens. |
| `ALLOWED_ORIGINS` | The site the app is served from (comma separated). Browsers on any other site are refused. |
| `ANTHROPIC_API_KEY` | For extraction, the assistant and meeting notes. |
| `STT_URL`, `STT_API_KEY`, `STT_MODEL` | Optional. Any speech service with an OpenAI-compatible `/audio/transcriptions` endpoint (OpenAI, Groq, or a self-hosted Whisper server). `STT_MODEL` defaults to `whisper-1`. |
| `PORT` | Default 8787. |
| `MAX_BODY_MB` | Largest request, default 40 (a 28 MB PDF after base64). |
| `RATE_PER_MIN` | AI requests a minute **per device**, default 20. Over it, the server answers 429 with `Retry-After`. |

At least one of `APP_TOKENS_FILE`, `APP_TOKEN_HASHES` and `APP_TOKEN` is required.

Put it behind HTTPS (any host that runs Node: a small VM, Render, Fly.io, a
container service). The app refuses a plain `http://` address except
`localhost`.

Keep keys in the host's secret settings or an `.env` file outside the
repository (`.env` is in `.gitignore`); never in the app.

## Tokens, one per device

`node tokens.mjs new <label>` makes a token of 24 random bytes (48 hex
characters), prints it once, and prints the line to paste into the tokens
file. Give the token to that broker; they paste it under **AI settings** in
the app (no app update is needed). The server keeps only its SHA-256, which is
enough because the token is random.

To **withdraw a device**, delete its line. The server notices when the file
changes (it looks at most every 10 seconds) and on `SIGHUP`
(`kill -HUP <pid>`), so no restart is needed. If the file cannot be read or a
line is malformed, every request is refused with 503 `tokens_unavailable`
until it is fixed (and the log names no token). Startup refuses a bad hash, a
repeated label or a missing file.

Moving from a single `APP_TOKEN`: make a token for each device, set
`APP_TOKENS_FILE`, give each broker theirs, then unset `APP_TOKEN` and restart.
Until then `APP_TOKEN` keeps working as the device `legacy`.

## Spending limits

Every AI call is priced in **whole cents** and checked against four limits
before the model is called: a **job cap**, a **device day**, a **server day**
and a **requests per day** count. The day ends at 00:00 UTC.

Before a call the server asks the API for the exact input size (`countTokens`,
which takes the call's model, system prompt, messages and output settings;
it does not take `fallbacks` or `max_tokens`, which the call adds). If that
fails, a text-only request is estimated as its bytes / 3, which over-estimates;
a request with a PDF or image holds the whole job cap instead, because those
are charged per page, not per byte.
The worst case, `input * input price + max_tokens * output price`, is held; if
it is over any limit the call is refused before the model is touched. After the
call the hold is replaced by the real usage (output includes thinking tokens;
cache tokens count at the input price; a fallback model is priced at the same
rates). A call that fails with an HTTP status gives its hold back; one that
times out or drops (it may have been billed) is charged the hold, and so is a
reply whose token counts are missing. Holding first is what stops two
jobs started together from overshooting. Transcription holds the whole job cap
and is charged the audio's minutes (rounded up) times `STT_PRICE_CENTS_PER_MIN`,
or the job cap when the speech service gives no length; a recording that would
cost more than the job cap is charged the job cap, no more.

| Variable | Default | |
|---|---|---|
| `AI_DAILY_REQUESTS` | 200 | per device, PLACEHOLDER |
| `AI_JOB_CAP_CENTS` | 300 | PLACEHOLDER |
| `AI_DEVICE_DAY_CAP_CENTS` | 1500 | PLACEHOLDER |
| `AI_SERVER_DAY_CAP_CENTS` | 3000 | everyone together, PLACEHOLDER |
| `AI_PRICE_IN_CENTS_PER_MTOK` | 1500 | PLACEHOLDER, UNVERIFIED: set the model's real price |
| `AI_PRICE_OUT_CENTS_PER_MTOK` | 7500 | PLACEHOLDER, UNVERIFIED: set the model's real price |
| `STT_PRICE_CENTS_PER_MIN` | 2 | PLACEHOLDER |

These are placeholders until the owner names the figures; the prices are
deliberately high so the caps bite early. Each must be a whole number of cents
(or a count); the server will not start on `1.5`, `-3` or `abc`.

Answers: 422 `job_over_budget` (nothing was sent to the model), 429
`daily_limit` (this device) or `server_daily_limit` (everyone), with
`Retry-After` and `resetAt`. `GET /api/health` also returns the caller's own
`budget: { usedCents, capCents, requests, requestLimit, resetAt }`, and the
app's **Test connection** shows it.

**The counters are in memory, so a restart or redeploy starts the day again
from zero**, and a crash loop could spend more than one day's cap. That keeps
the server free of stored data; the trade-off is accepted for now. The
backstop is a spend limit on the provider's own account (an operator step; that
the provider's console offers one is UNVERIFIED and should be checked). An
optional content-free ledger file (day, label, cents, requests) could close the
gap later.

## Prompt injection

Every system prompt carries one rule: text from a document, transcript,
question or fact is data to read, never instructions. Document names have
control characters stripped. The model has no tools and cannot act. What it
returns is cut back to the field keys, documents and facts that were sent, and
the app then checks each quoted passage against the document before showing a
figure as verified. Whether a real model resists an injected instruction is
**UNVERIFIED**: the tests use a stand-in that obeys. The server logs only the
time, path, status, error name and device label, never a token, body, name or
model text.

## What leaves the device

Only what a broker sends, each time after confirming: the documents chosen
for reading, a question with the deal's figures, or a recording. The server
passes them to Anthropic's API (and recordings to the speech service) and
returns the answer. Check that this fits your firm's confidentiality
obligations (offering memoranda are usually under an NDA) and the providers'
data terms before turning it on.

## Tests

```sh
npm test
```

The tests run the server and the real Anthropic SDK against a local stand-in
for the Messages API: the request shape (model, structured output, fallbacks,
documents), the token (per device, withdrawn live) and origin checks, the cent limits and
the logs, refusals, cut-off answers, upstream
errors (whose bodies are never passed on), size limits, and transcription.
They do not call a live model; that needs a key and is not part of the suite.
`tests/e2e/ai-flow.mjs` drives the app in a browser against this server the
same way.
