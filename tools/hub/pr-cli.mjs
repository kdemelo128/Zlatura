#!/usr/bin/env node
// Pull requests from a terminal, with the same rules as the hub's Pull requests tab.
//   npm run pr -- list | check <n> | create <branch> [--yes] | merge <n> [--yes] | update <n> [--yes] | auto <n> [--off] [--yes] | save-token
// Add --project <name> to pick a project from workers.json (default: zlatura). Anything that changes GitHub
// only runs with --yes; without it the command shows what it would do. The token is read from the key store
// (HUB_GITHUB_TOKEN) and never printed.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveKey } from './providers.mjs';
import { loadWorkers } from '../harness/lib.mjs';
import { PrError, getToken, ghClient, projectInfo, listPrs, checkPr, prefill, createPr, mergePr, updateBranch, setAutoMerge } from './github.mjs';
import { safeText } from './hub-lib.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
async function readAll(stream) { let s = ''; for await (const c of stream) s += typeof c === 'string' ? c : Buffer.from(c).toString('utf8'); return s; }
function parse(argv) {
  const flags = {}; const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--yes' || a === '--off') flags[a.slice(2)] = true;
    else if (a === '--project') flags.project = argv[++i];
    else rest.push(a);
  }
  return { cmd: rest[0], arg: rest[1], flags };
}

export async function run({ argv = process.argv.slice(2), stdin = process.stdin, env = process.env, fetch, exec, out = console.log, err = console.error, root = ROOT, cfg = loadWorkers(), sleep } = {}) {
  const token = getToken(env);
  const o = (s) => out(safeText(String(s).split(token || '\u0000').join('…'))), e = (s) => err(safeText(String(s).split(token || '\u0000').join('…')));
  try {
    const { cmd, arg, flags } = parse(argv);
    if (cmd === 'save-token') { saveKey('HUB_GITHUB_TOKEN', (await readAll(stdin)).trim(), env); o('Saved. The token stays on this computer (keys file, owner-only).'); return 0; }
    if (!['list', 'check', 'create', 'merge', 'update', 'auto'].includes(cmd)) { e('usage: pr-cli.mjs list | check <n> | create <branch> [--yes] | merge <n> [--yes] | update <n> [--yes] | auto <n> [--off] [--yes] | save-token (token on stdin)  [--project <name>]'); return 2; }
    const gh = ghClient({ token, fetch });
    const info = await projectInfo({ cfg, project: flags.project || 'zlatura', root, exec });
    const common = { gh, repo: info.repo, inspectOpts: sleep ? { sleep } : undefined };
    const line = (p) => `#${p.number}  ${p.title}\n    ${p.branch} into ${p.base} · checks ${p.checks.state} (${p.checks.passing}/${p.checks.total}) · ${p.mergeState} · review ${p.review}${p.autoMerge ? ' · auto-merge on' : ''}`;
    if (cmd === 'list') { const l = await listPrs(gh, info.repo, common.inspectOpts); o(`${info.repo}: ${l.length} open`); l.forEach((p) => o(line(p))); return 0; }
    if (cmd === 'create') {
      const pf = await prefill({ folder: info.folder, branch: arg, exec });
      o(`Title: ${pf.title}\n${pf.notes.join(' ')}\n---\n${pf.body}`);
      if (!flags.yes) { o('\nNothing created. Add --yes to push the branch and open this pull request.'); return 0; }
      const r = await createPr({ ...common, folder: info.folder, branch: arg, title: pf.title, body: pf.body, confirm: true, exec });
      o(`Opened #${r.number}${r.url ? ' ' + r.url : ''}`); return 0;
    }
    const n = Number(arg); if (!Number.isInteger(n) || n < 1) { e('give a pull request number'); return 2; }
    const p = await checkPr(gh, info.repo, n, common.inspectOpts); o(line(p));
    if (cmd === 'check') { p.reasons.forEach((r) => o('  cannot merge: ' + r)); return 0; }
    const refused = cmd === 'merge' ? p.reasons : cmd === 'auto' && !flags.off ? p.autoReasons : [];
    if (refused.length) { refused.forEach((r) => e('refused: ' + r)); return 1; }
    if (!flags.yes) { o(`\nNothing changed. Add --yes to ${cmd === 'merge' ? 'squash-merge' : cmd === 'update' ? 'update the branch of' : flags.off ? 'turn auto-merge off for' : 'turn on auto-merge for'} #${n}.`); return 0; }
    const args = { ...common, number: n, sha: p.sha, confirm: true };
    if (cmd === 'merge') { const r = await mergePr(args); o(r.merged ? `Merged #${n}.` : `Not merged: ${r.message}`); return r.merged ? 0 : 1; }
    if (cmd === 'update') { o((await updateBranch(args)).message); return 0; }
    o((await setAutoMerge({ ...args, enable: !flags.off })).message); return 0;
  } catch (x) { e(x instanceof PrError || x?.message ? x.message : 'unexpected error'); return 1; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run().then((c) => { process.exitCode = c; });
