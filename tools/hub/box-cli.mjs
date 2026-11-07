// Command line for the Box folder downloader. Dev tooling, runs on the owner's computer only.
//   node tools/hub/box-cli.mjs search [--names "due diligence,analysis,sale"]
//   node tools/hub/box-cli.mjs plan <folderId...>
//   node tools/hub/box-cli.mjs download <folderId...> [--to <dir>] [--yes]
//   echo TOKEN | node tools/hub/box-cli.mjs save-token     (reads stdin, never argv)
import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readKeys, saveKey } from './providers.mjs';
import { searchFolders, listTree, planDownload, downloadPlan, safeText, BoxError } from './box.mjs';

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_NAMES = ['due diligence', 'analysis', 'sale'];
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

function parse(argv) {
  const pos = [], flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--yes') flags.yes = true;
    else if (a === '--names' || a === '--to') flags[a.slice(2)] = argv[++i];
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else pos.push(a);
  }
  return { cmd: pos[0], ids: pos.slice(1), flags };
}

// Real path of the nearest existing ancestor, plus the not-yet-created rest.
function realish(p) {
  let cur = resolve(p), rest = '';
  while (!existsSync(cur)) { rest = join(cur.slice(dirname(cur).length + 1), rest); cur = dirname(cur); }
  return join(realpathSync(cur), rest);
}
/** Returns an error string if dest is inside the project or any git working tree, else null. */
export function destProblem(dest, project = PROJECT) {
  const d = realish(dest), proj = realish(project);
  if (d === proj || d.startsWith(proj + sep)) return 'the destination is inside the Zlatura project folder';
  for (let cur = d; ; cur = dirname(cur)) {
    if (existsSync(join(cur, '.git'))) return `the destination is inside a git repository (${cur})`;
    if (dirname(cur) === cur) return null;
  }
}

async function readAll(stream) {
  let s = '';
  for await (const c of stream) s += typeof c === 'string' ? c : Buffer.from(c).toString('utf8');
  return s;
}

export async function run({ argv = process.argv.slice(2), stdin = process.stdin, env = process.env, fetch = globalThis.fetch, out = console.log, err = console.error, home = homedir() } = {}) {
  const kenv = { ...env, HOME: home };
  const token = env.BOX_ACCESS_TOKEN || readKeys(kenv).BOX_ACCESS_TOKEN || null;
  const o = (s) => out(safeText(s, token)), e = (s) => err(safeText(s, token));
  try {
    const { cmd, ids, flags } = parse(argv);
    if (cmd === 'save-token') {
      const t = (await readAll(stdin)).trim();
      saveKey('BOX_ACCESS_TOKEN', t, kenv);
      o('Saved. The token stays on this computer (keys file, owner-only). Box developer tokens expire quickly: save a new one when it does.');
      return 0;
    }
    if (!['search', 'plan', 'download'].includes(cmd)) {
      e('usage: box-cli.mjs search [--names "a,b"] | plan <folderId...> | download <folderId...> --to <dir> --yes | save-token (token on stdin)');
      return 2;
    }
    if (!token) { e('no token: set BOX_ACCESS_TOKEN or run save-token (token on stdin)'); return 2; }
    const opts = { fetch };
    if (cmd === 'search') {
      const names = flags.names ? flags.names.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_NAMES;
      const found = await searchFolders(token, names, opts);
      for (const f of found) o(`${f.id}\t${f.path}`);
      o(`${found.length} folder(s) found`);
      return 0;
    }
    if (!ids.length) { e('give at least one folder id'); return 2; }
    const dest = resolve(flags.to || join(home, 'Zlatura-data', 'box'));
    if (cmd === 'download') {
      const bad = destProblem(dest);
      if (bad) { e(`refused: ${bad}. Pick a folder outside every repository.`); return 2; }
    }
    const trees = [];
    for (const id of ids) trees.push(await listTree(token, id, opts));
    const plan = planDownload(trees, dest);
    o(`${plan.entries.length} file(s) to download, ${mb(plan.totalBytes)} total`);
    for (const [x, v] of Object.entries(plan.byExt).sort()) o(`  .${x}: ${v.count} file(s), ${mb(v.bytes)}`);
    const sk = Object.entries(plan.skipped).sort();
    o(`skipped (other types): ${sk.length ? sk.map(([x, n]) => `.${x} ${n}`).join(', ') : 'none'}`);
    if (cmd === 'plan' || !flags.yes) {
      if (cmd === 'download') o('Nothing downloaded. Add --yes to download.');
      return 0;
    }
    const r = await downloadPlan(plan, dest, { fetch, token, onProgress: ({ done, total }) => { if (done % 25 === 0 || done === total) o(`  ${done}/${total}`); } });
    o(`done: ${r.downloaded} downloaded, ${r.alreadyHad} already there, ${r.failed.length} failed -> ${dest}`);
    for (const f of r.failed.slice(0, 20)) e(`  failed file ${f.id}: ${f.error}`);
    return r.failed.length ? 1 : 0;
  } catch (x) {
    e(x instanceof BoxError || x?.message ? x.message : 'unexpected error');
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().then((c) => { process.exitCode = c; });
}
