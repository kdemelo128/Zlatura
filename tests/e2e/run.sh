#!/usr/bin/env bash
# Browser workflows on an iPhone-sized page, plus a LibreOffice recalculation
# of every workbook they export. Not part of `npm test`: it needs Chromium with
# Playwright, Python with reportlab, Pillow and openpyxl, and LibreOffice
# (all present in the Claude Code cloud image); ffmpeg is optional.
#   tests/e2e/run.sh            # every workflow
#   tests/e2e/run.sh live-flow  # one, or several: run.sh typing-flow lostedit-flow
set -euo pipefail
cd "$(dirname "$0")"
# one browser run at a time on this machine: another session or worktree using port 8080 is waited for, not
# collided with (a lock directory holding the owner's PID; the idea is paperclip's per-task claim). A lock whose
# PID is gone is stale and taken over. E2E_LOCK_WAIT is how many seconds to wait (default 1800).
LOCK=${E2E_LOCK:-${TMPDIR:-/tmp}/zlatura-e2e-8080.lock}
waited=0
until mkdir "$LOCK" 2>/dev/null; do
  holder=$(cat "$LOCK/pid" 2>/dev/null || true)
  if [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null; then rm -rf "$LOCK"; continue; fi
  if [ -z "$holder" ] && [ "$waited" -ge 5 ]; then rm -rf "$LOCK"; continue; fi
  [ "$waited" = 0 ] && echo "Another browser run (PID ${holder:-starting}) holds port 8080: waiting for it." >&2
  if [ "$waited" -ge "${E2E_LOCK_WAIT:-1800}" ]; then echo "Still held after ${waited}s: stop PID $holder or run again later." >&2; exit 2; fi
  sleep 1; waited=$((waited + 1))
done
echo $$ > "$LOCK/pid"
trap 'rm -rf "$LOCK"' EXIT
mkdir -p files shots
# the fixture scripts' packages must be the pinned ones (an older Pillow has published security advisories)
python3 check_requirements.py requirements.txt
node dump-pages.mjs files/pages.json
python3 make_pdfs.py files >/dev/null
python3 make_tpl.py files/acme-template.xlsx >/dev/null
python3 make_model.py files/uw-model.xlsx >/dev/null
node make_t12.mjs files >/dev/null
python3 - <<'PY'
import zipfile
with zipfile.ZipFile('files/uw-model.xlsx') as z, zipfile.ZipFile('files/uw-model.xlsm', 'w', zipfile.ZIP_DEFLATED) as o:
    for i in z.infolist(): o.writestr(i, z.read(i.filename))
    o.writestr('xl/vbaProject.bin', bytes(range(64)))
# an old Excel container as far as a file sniffer can tell: the 8-byte OLE signature and a "Workbook" stream name
open('files/legacy.xls', 'wb').write(b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1' + bytes(504) + 'Workbook'.encode('utf-16-le') + bytes(64))
PY
if command -v ffmpeg >/dev/null; then ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=440:duration=3" -c:a libvorbis files/memo.ogg; fi
: > files/empty.m4a
# the AI flow runs the real server code (server/), which needs its one package
[ -d ../../server/node_modules/@anthropic-ai/sdk ] || (cd ../../server && npm ci --silent)
(cd ../.. && exec python3 -m http.server 8080 --bind 127.0.0.1 >/dev/null 2>&1) &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true; rm -rf "$LOCK"' EXIT
sleep 1
# another server already on the port would be tested in its place, from wherever it serves
if ! kill -0 "$SERVER" 2>/dev/null; then echo "Port 8080 is in use: stop whatever holds it and run again." >&2; exit 2; fi
FLOWS=${*:-"workflows rentroll-flow encoding-flow bigroll-flow template-flow tools-flow ai-flow home-flow shell-flow rename-flow engine-flow history-flow snapshot-flow impact-flow migrate-flow t12-flow t12partial-flow t12read-flow t12sug-flow t12period-flow t12values-flow t12norm-flow strict-flow rollchecks-flow upgrade-flow limits-flow backup-flow a11y-flow live-flow voice-flow final-e2e deal-persistence lostedit-flow deal-isolation comps-reload errors-flow pwa-flow tpl-flow comps-flow deal-export omrr-flow photoocr-flow rrscale-flow rrpdf-flow rrstated-flow rrheader-flow omstmt-flow typing-flow mobile-audit perf-flow"}
# every flow runs even when one fails; any flow that exits with an error
# (a failed check, no checks, or a crash) is listed and the run fails
FAILED=()
# workbooks left by an earlier run would be recalculated as if this run made them
rm -f files/out-*
for f in $FLOWS; do echo "===== $f"; node "$f.mjs" || FAILED+=("$f"); done
# the LibreOffice recalculation of every workbook; E2E_SKIP_RECALC=1 leaves it out (the CI browser subset,
# which has no LibreOffice: check:full always runs it)
if [ "${E2E_SKIP_RECALC:-}" = 1 ]; then echo "===== recalc skipped (E2E_SKIP_RECALC=1)"; else
node make_engine_check.mjs files/engine-check.xlsx
for x in files/*.xlsx files/*.xlsm; do case "$x" in *acme-template.xlsx) continue;; esac; echo "===== recalc $x"; python3 -W ignore recalc.py "$x" || FAILED+=("recalc $x"); done
fi
if [ ${#FAILED[@]} -gt 0 ]; then echo "===== FAILED: ${FAILED[*]}" >&2; exit 1; fi
echo "===== all flows passed"
