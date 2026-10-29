#!/usr/bin/env bash
# Browser workflows on an iPhone-sized page, plus a LibreOffice recalculation
# of every workbook they export. Not part of `npm test`: it needs Chromium with
# Playwright, Python with reportlab, Pillow and openpyxl, and LibreOffice
# (all present in the Claude Code cloud image); ffmpeg is optional.
#   tests/e2e/run.sh            # every workflow
#   tests/e2e/run.sh live-flow  # one, or several: run.sh typing-flow lostedit-flow
set -euo pipefail
cd "$(dirname "$0")"
# up to E2E_SLOTS browser runs at once on this machine (other sessions or worktrees), each on its own
# slot of ports, claimed with a lock directory holding the run's PID (the idea is paperclip's per-task claim). Slot 0
# is the one CI uses and the one older branches lock: port 8080, and 8096-8098 for the flows that serve an old copy.
# A slot whose run is gone is taken over, and one never given a PID is taken over after a minute; a slot whose
# port is already served (a server started by hand, with no lock) is skipped. When every slot is
# busy the run waits for one; E2E_LOCK_WAIT is how many seconds (default 1800).
LOCKDIR=${E2E_LOCK_DIR:-${TMPDIR:-/tmp}}
# at most half the CPUs' worth of runs at once: the flows hold perf budgets (150 ms an edit), and those only mean
# something on a machine that isn't oversubscribed. E2E_SLOTS overrides it.
cpus=$(nproc 2>/dev/null || echo 2); SLOTS=${E2E_SLOTS:-$(( cpus / 2 > 1 ? cpus / 2 : 1 ))}
PORT_BASE=${E2E_PORT_BASE:-8080}
slotlock() { if [ "$1" = 0 ]; then echo "$LOCKDIR/zlatura-e2e-8080.lock"; else echo "$LOCKDIR/zlatura-e2e-slot$1.lock"; fi; }
waited=0; SLOT=
while :; do
  for n in $(seq 0 $((SLOTS - 1))); do
    L=$(slotlock "$n")
    holder=$(cat "$L/pid" 2>/dev/null || true)
    if [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null; then rm -rf "$L"; fi
    if [ -d "$L" ] && [ -z "$holder" ] && [ -n "$(find "$L" -maxdepth 0 -mmin +1 2>/dev/null)" ]; then rm -rf "$L"; fi
    if mkdir "$L" 2>/dev/null; then
      # a server someone started by hand can hold the port without the lock: then this slot is not free either
      if (exec 3<>"/dev/tcp/127.0.0.1/$((PORT_BASE + n))") 2>/dev/null; then rmdir "$L"; continue; fi
      SLOT=$n; LOCK=$L; break
    fi
  done
  [ -n "$SLOT" ] && break
  [ "$waited" = 0 ] && echo "All $SLOTS browser-run slots are busy: waiting for one." >&2
  if [ "$waited" -ge "${E2E_LOCK_WAIT:-1800}" ]; then echo "Still busy after ${waited}s: stop a run or try again later." >&2; exit 2; fi
  sleep 1; waited=$((waited + 1))
done
echo $$ > "$LOCK/pid"
trap 'rm -rf "$LOCK"' EXIT
PORT=$((PORT_BASE + SLOT))
if [ "$SLOT" = 0 ]; then SIDE=$((PORT_BASE + 16)); else SIDE=$((9000 + 10 * SLOT)); fi
export BASE=${BASE:-http://localhost:$PORT/} MIGRATE_PORT=${MIGRATE_PORT:-$SIDE} RENAME_PORT=${RENAME_PORT:-$((SIDE + 1))} UPGRADE_PORT=${UPGRADE_PORT:-$((SIDE + 2))}
# LibreOffice (recalc.py, lo_values.py) gets the slot's own socket ports and, beyond slot 0, its own user profile:
# two LibreOffice instances on one profile or one port lock each other up
export LO_PORT_RECALC=$((2002 + 10 * SLOT)) LO_PORT_VALUES=$((2003 + 10 * SLOT))
if [ "$SLOT" = 0 ]; then unset LO_PROFILE; else export LO_PROFILE="$LOCKDIR/zlatura-lo-slot$SLOT"; fi
[ "$SLOT" = 0 ] || echo "Browser runs share this machine: this one uses slot $SLOT (port $PORT)." >&2
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
(cd ../.. && exec python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1) &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true; rm -rf "$LOCK"' EXIT
sleep 1
# another server already on the port would be tested in its place, from wherever it serves
if ! kill -0 "$SERVER" 2>/dev/null; then echo "Port $PORT is in use: stop whatever holds it and run again." >&2; exit 2; fi
FLOWS=${*:-"workflows rentroll-flow encoding-flow bigroll-flow template-flow tools-flow ai-flow research-flow back-flow home-flow shell-flow rename-flow engine-flow history-flow snapshot-flow impact-flow migrate-flow t12-flow t12partial-flow t12read-flow t12sug-flow t12period-flow t12values-flow t12norm-flow strict-flow rollchecks-flow upgrade-flow limits-flow backup-flow a11y-flow live-flow voice-flow final-e2e deal-persistence lostedit-flow deal-isolation comps-reload errors-flow pwa-flow tpl-flow comps-flow deal-export omrr-flow photoocr-flow rrscale-flow rrpdf-flow rrstated-flow rrheader-flow omstmt-flow typing-flow mobile-audit hostile-flow fee-flow calendar-flow rent-schedule-flow perf-flow"}
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
for x in files/*.xlsx files/*.xlsm; do case "$x" in *acme-template.xlsx) continue;; esac; echo "===== recalc $x"; timeout 300 python3 -W ignore recalc.py "$x" || FAILED+=("recalc $x"); done
fi
if [ ${#FAILED[@]} -gt 0 ]; then echo "===== FAILED: ${FAILED[*]}" >&2; exit 1; fi
echo "===== all flows passed"
