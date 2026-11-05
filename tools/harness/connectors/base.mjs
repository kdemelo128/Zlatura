// Shared connector contract. A connector turns a worker into one of three things:
//   agent : Claude does it inside its own session (nothing to run here)
//   cli   : a command-line tool the owner is logged in to; run with the packet on stdin
//   relay : a chat the owner pastes the packet into; the reply is pasted back
// No connector holds a key or opens a network connection. The only thing run on this
// machine is the vendor's own CLI, by the owner, when `run` is used.
import { spawnSync } from 'node:child_process';

/** Pull a unified diff out of a chat reply (fences and chatter stripped). Returns '' if none. */
export function extractDiff(reply) {
  const text = String(reply ?? '').replace(/\r\n/g, '\n');
  const fenced = [...text.matchAll(/```(?:diff|patch)?\n([\s\S]*?)```/g)].map((m) => m[1]);
  const body = fenced.find((f) => /^(?:diff --git|--- )/m.test(f)) ?? text;
  const start = body.search(/^(?:diff --git |--- a\/)/m);
  if (start < 0) return '';
  const lines = body.slice(start).split('\n');
  const out = [];
  for (const l of lines) {
    if (/^(?:diff --git|index |--- |\+\+\+ |@@|[ +\-\\])/.test(l) || l === '') out.push(l);
    else break; // prose after the patch
  }
  return out.join('\n').trimEnd() + '\n';
}

/** Is a command on this machine? `run` is injectable so tests never spawn anything. */
export function haveCommand(bin, run = spawnSync) {
  const r = run(bin, ['--version'], { encoding: 'utf8', timeout: 10000 });
  return !r.error && r.status === 0;
}

export function makeConnector({ id, vendor, mode, bin = null, args = null, verified = false, relayUrl = null, note = '' }) {
  return {
    id, vendor, mode, verified, note,
    /** What `doctor` shows: can this connector work on this machine right now? */
    check(run) {
      if (mode === 'agent') return { ok: true, how: 'runs inside Claude' };
      if (mode === 'relay') return { ok: true, how: `paste-in chat${relayUrl ? ' at ' + relayUrl : ''}` };
      const ok = haveCommand(bin, run);
      return { ok, how: ok ? `${bin} found` : `${bin} not installed or not logged in on this machine` };
    },
    /** The command to run for a cli worker, or null. */
    invocation() { return mode === 'cli' ? { command: [bin, ...args] } : null; },
    /** Turn a worker reply into a diff. */
    parseReply: extractDiff,
    relayInstructions() {
      return mode === 'relay'
        ? `Open ${relayUrl ?? vendor}, paste the packet file, and ask for "a unified diff only". Save the reply as reply.diff.`
        : '';
    },
  };
}
