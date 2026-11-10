// The project registry: which folders the hub may work in. Dev tooling on the owner's computer.
// Two sources: projects named in tools/harness/workers.json (kept in the repository, read-only here) and projects the
// owner adds by folder path (kept in ~/.zlatura-hub/projects.json, owner-only). The page can only ADD a folder that
// passes `checkFolder` and REMOVE one of its own additions; it can never name a repository, a command or a protected path.
import { execFile as nodeExecFile } from 'node:child_process';
import { statSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve, isAbsolute, basename, sep } from 'node:path';
import { hubDir, readJson, writeJsonAtomic } from './store.mjs';
import { isSlug } from './github.mjs';
import { applyProfile, validateCfg } from '../harness/lib.mjs';

export const PROJECTS_FILE = (env = process.env) => join(hubDir(env), 'projects.json');
export class ProjectError extends Error { constructor(message) { super(message); this.name = 'ProjectError'; } }

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const NAME = /^[\w][\w .,'&()-]{0,59}$/;
export const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const within = (parent, child) => { const r = relative(parent, child); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };
const strList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x && x.length < 200 && !x.includes('..')).slice(0, 100) : undefined);

/** A registry entry reduced to the fields the hub understands. Anything else in the file is ignored. */
function cleanEntry(e) {
  if (!e || typeof e !== 'object' || !ID.test(String(e.id)) || typeof e.folder !== 'string' || !isAbsolute(e.folder)) return null;
  const out = { id: e.id, name: typeof e.name === 'string' && NAME.test(e.name) ? e.name : e.id, folder: e.folder, source: 'user' };
  if (typeof e.github === 'string' && isSlug(e.github)) out.github = e.github;
  for (const k of ['protectedPaths', 'extraProtected', 'requiresDesign']) { const l = strList(e[k]); if (l) out[k] = l; }
  if (e.roles && typeof e.roles === 'object' && !Array.isArray(e.roles)) out.roles = e.roles;
  if (e.kinds && typeof e.kinds === 'object' && !Array.isArray(e.kinds)) out.kinds = e.kinds;
  return out;
}

/** Config projects (workers.json) first, then the owner's additions. The home project is the one whose folder is the folder the hub runs from. */
export function loadRegistry({ env = process.env, root, cfg }) {
  const file = readJson(PROJECTS_FILE(env), {});
  const ids = Object.keys(cfg.projects ?? {}).filter((k) => k !== 'default');
  const fromConfig = (ids.length ? ids : ['default']).map((id) => {
    const p = cfg.projects?.[id] ?? {};
    const folder = p.folder ? String(p.folder).replace(/^~(?=\/|$)/, homedir()) : root;
    return { id, name: id, folder, ...(typeof p.github === 'string' ? { github: p.github } : {}), source: 'config' };
  });
  const taken = new Set(fromConfig.map((p) => p.id));
  const mine = (Array.isArray(file.projects) ? file.projects : []).map(cleanEntry).filter((e) => e && !taken.has(e.id) && taken.add(e.id));
  const n = Number(file.concurrency);
  return { projects: [...fromConfig, ...mine], home: fromConfig.find((p) => resolve(p.folder) === resolve(root))?.id ?? fromConfig[0].id, concurrency: Number.isInteger(n) && n >= 1 && n <= 8 ? n : 3 };
}

const save = (env, reg) => {
  const file = readJson(PROJECTS_FILE(env), {});
  writeJsonAtomic(PROJECTS_FILE(env), { version: 1, concurrency: reg.concurrency ?? file.concurrency ?? 3, projects: reg.projects.filter((p) => p.source === 'user').map(({ source, ...rest }) => { void source; return rest; }) });
};

const git = (exec, folder, args) => new Promise((resolveP, reject) => {
  exec('git', args, { cwd: folder, timeout: 20000, maxBuffer: 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, out) => (err ? reject(new Error('git said no')) : resolveP(String(out).trim())));
});

/** A folder may be added only if it is an existing, real (no link in the path), absolute folder that is the top of a git work tree,
 *  does not overlap another project, is not a private/ folder of one, and does not hold the hub's own key store. Returns its real path. */
export async function checkFolder(input, { registry, exec = nodeExecFile, env = process.env }) {
  if (typeof input !== 'string' || !input.trim() || input.length > 1000 || input.includes('\0')) throw new ProjectError('Type the full folder path.');
  const typed = input.trim().replace(/^~(?=\/|$)/, homedir());
  if (!isAbsolute(typed)) throw new ProjectError('Give the full path, starting with / or ~.');
  if (typed.split(/[\\/]+/).includes('..')) throw new ProjectError('A path with ".." in it is not accepted: type the folder\'s real path.');
  const lexical = resolve(typed);
  let st; try { st = statSync(lexical); } catch { throw new ProjectError('That folder does not exist.'); }
  if (!st.isDirectory()) throw new ProjectError('That is a file, not a folder.');
  const real = realpathSync.native(lexical);
  if (real !== lexical) throw new ProjectError(`That path goes through a link (it really is ${real}). Type the real path instead.`);
  if (real === sep || real === homedir() || within(real, hubDir(env)) || within(hubDir(env), real)) throw new ProjectError('That folder is too broad or holds the hub\'s own files.');
  for (const p of registry.projects) {
    const pf = p.folder;
    if (within(pf, real)) {
      const first = relative(pf, real).split(sep)[0];
      throw new ProjectError(first.toLowerCase() === 'private' ? `That folder is inside the private folder of ${p.name}. It can never be used.` : relative(pf, real) === '' ? `Already added as ${p.name}.` : `That folder is inside the project ${p.name}.`);
    }
    if (within(real, pf)) throw new ProjectError(`That folder contains the project ${p.name}. Add the specific project folder.`);
  }
  let top; try { top = await git(exec, real, ['rev-parse', '--show-toplevel']); } catch { throw new ProjectError('That folder is not a git work tree. Run git init in it first.'); }
  let topReal; try { topReal = realpathSync.native(top); } catch { topReal = top; }
  if (topReal !== real) throw new ProjectError('That folder is inside a git work tree but is not its top folder.');
  return real;
}

export async function addProject({ env = process.env, root, cfg, folder, name, github, exec }) {
  const reg = loadRegistry({ env, root, cfg });
  const real = await checkFolder(folder, { registry: reg, exec, env });
  if (github != null && github !== '' && !isSlug(github)) throw new ProjectError('GitHub address must look like owner/repo.');
  const nm = String(name ?? '').trim() || basename(real);
  if (!NAME.test(nm)) throw new ProjectError('Use a short name of letters, numbers and spaces.');
  let id = slugify(nm) || 'project'; const base = id; let n = 2;
  while (reg.projects.some((p) => p.id === id)) id = `${base}-${n++}`.slice(0, 40);
  const entry = { id, name: nm, folder: real, ...(github ? { github } : {}), source: 'user' };
  reg.projects.push(entry); save(env, reg);
  return entry;
}

export function removeProject({ env = process.env, root, cfg, id }) {
  const reg = loadRegistry({ env, root, cfg });
  const p = reg.projects.find((x) => x.id === id);
  if (!p) throw new ProjectError('Unknown project.');
  if (p.source !== 'user') throw new ProjectError('That project is listed in tools/harness/workers.json, so it stays. Edit that file to change it.');
  reg.projects = reg.projects.filter((x) => x.id !== id); save(env, reg);
}

export function setConcurrency({ env = process.env, root, cfg, n }) {
  const k = Number(n);
  if (!Number.isInteger(k) || k < 1 || k > 8) throw new ProjectError('Choose a number from 1 to 8.');
  const reg = loadRegistry({ env, root, cfg }); reg.concurrency = k; save(env, reg); return k;
}

/** The harness config for one project: shared workers, with the project's own roles, kinds and protected paths on top.
 *  Throws ProjectError when the project's own roles or kinds do not make sense. */
export function projectCfg(cfg, entry) {
  const base = cfg.projects?.[entry.id] ?? cfg.projects?.default ?? {};
  const profile = {
    protectedPaths: entry.protectedPaths, // undefined keeps the shared list
    extraProtected: entry.extraProtected ?? base.extraProtected ?? [],
    requiresDesign: entry.requiresDesign ?? base.requiresDesign ?? [],
  };
  let merged = { ...cfg, roles: { ...cfg.roles, ...(entry.roles ?? {}) }, kinds: { ...cfg.kinds, ...(entry.kinds ?? {}) } };
  try { validateCfg(merged); } catch (e) { throw new ProjectError(`The roles or kinds of project ${entry.name} are not valid: ${e.message}`); }
  merged = applyProfile(merged, profile);
  return { cfg: merged, profile: { protectedPaths: merged.protectedPaths, extraProtected: profile.extraProtected, requiresDesign: profile.requiresDesign } };
}

/** At the moment of use: the folder must still be the real folder that was approved when it was added (a link swapped in later is refused). */
export function ensureFolder(entry) {
  let st; try { st = statSync(entry.folder); } catch { throw new ProjectError(`The folder of ${entry.name} is missing.`); }
  if (!st.isDirectory()) throw new ProjectError(`The folder of ${entry.name} is not a folder.`);
  if (entry.source === 'user' && realpathSync.native(entry.folder) !== entry.folder) throw new ProjectError(`The folder of ${entry.name} changed since it was added (it now goes through a link). Remove the project and add it again.`);
  return entry.folder;
}
