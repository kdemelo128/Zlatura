// Pull requests from the hub, through GitHub's REST API (and one GraphQL call: auto-merge has no REST route).
// Dev tooling on the owner's computer. The token is read from the key store, goes only into the
// Authorization header of requests to api.github.com, and is never returned, logged or put in an error.
// Nothing here merges by itself: merge, update and auto-merge need `confirm === true` from the caller.
import { execFile as nodeExecFile } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { keyFor } from './providers.mjs';
import { screenPrompt, safeText } from './hub-lib.mjs';
import { summarizeChecks, reviewState, mergeLabel, mergeGate, autoMergeGate } from './pr-gate.mjs';

const API = 'https://api.github.com';
const MAX_PRS = 20;
const TOKEN_NAME = 'HUB_GITHUB_TOKEN';
export class PrError extends Error { constructor(message, extra = {}) { super(message); Object.assign(this, extra); } }

export const getToken = (env = process.env) => keyFor(TOKEN_NAME, env);

/** Minimal GitHub client. Every message that leaves it has the token removed. */
export function ghClient({ token, fetch: f = globalThis.fetch, timeoutMs = 30000 }) {
  if (!token) throw new PrError('Connect GitHub first: paste a token in the left panel.', { needsToken: true });
  const scrub = (s) => safeText(String(s).split(token).join('…'));
  async function call(method, path, body) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await f(path === '/graphql' ? `${API}/graphql` : `${API}${path}`, {
        method, redirect: 'error', signal: ctl.signal,
        headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'zlatura-model-hub', ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await r.text();
      let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = null; }
      if (!r.ok) {
        const hint = r.status === 401 ? 'GitHub refused the token (wrong or expired). Paste a new one.'
          : r.status === 404 ? 'GitHub says not found. Either it does not exist or the token has no access to this repository.'
          : `GitHub said ${r.status}: ${String(json?.message ?? text).slice(0, 300)}`;
        throw new PrError(scrub(hint), { status: r.status });
      }
      if (json?.errors && path === '/graphql') throw new PrError(scrub('GitHub said: ' + json.errors.map((e) => e.message).join('; ').slice(0, 300)));
      return json;
    } catch (e) {
      if (e instanceof PrError) throw e;
      throw new PrError(scrub(e.name === 'AbortError' ? 'GitHub took too long to answer.' : 'Could not reach GitHub: ' + e.message));
    } finally { clearTimeout(t); }
  }
  return { get: (p) => call('GET', p), post: (p, b) => call('POST', p, b), put: (p, b) => call('PUT', p, b), graphql: (query, variables) => call('POST', '/graphql', { query, variables }).then((j) => j?.data) };
}

// ----- which repository -----
const SLUG = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/;
export const isSlug = (s) => typeof s === 'string' && SLUG.test(s);
/** owner/repo from a git remote URL (https or ssh form). Credentials in the URL are ignored and never returned. */
export function slugFromRemote(url) {
  const u = String(url ?? '').trim();
  const m = /^https:\/\/(?:[^@/\s]+@)?github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(u) || /^(?:ssh:\/\/)?git@github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(u);
  const slug = m ? `${m[1]}/${m[2]}` : null;
  return slug && isSlug(slug) ? slug : null;
}

const git = (exec, folder, args, { timeout = 20000 } = {}) => new Promise((resolve, reject) => {
  // never let a remote address run a program (ext::), whatever the folder's own config says
  exec('git', ['-c', 'protocol.ext.allow=never', ...args], { cwd: folder, timeout, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, out, errOut) => (err ? reject(new Error(String(errOut || err.message).trim().slice(0, 300))) : resolve(String(out))));
});

/** The projects the panel offers. The folder and repo come only from the hub's own config, never from the page. */
export function listProjects(cfg) {
  const ids = Object.keys(cfg.projects ?? {}).filter((k) => k !== 'default');
  return ids.length ? ids : ['default'];
}
export async function projectInfo({ cfg, project, root, exec = nodeExecFile }) {
  const p = cfg.projects?.[project];
  if (!p || typeof project !== 'string') throw new PrError('Unknown project.');
  const folder = p.folder ? String(p.folder).replace(/^~(?=\/|$)/, homedir()) : root;
  if (p.github != null) {
    if (!isSlug(p.github)) throw new PrError('The project config has a bad github value (use owner/repo).');
    return { project, folder, repo: p.github, source: 'config' };
  }
  let url; try { url = (await git(exec, folder, ['remote', 'get-url', 'origin'])).trim(); } catch { throw new PrError('Could not read the git remote of the project folder. Add "github": "owner/repo" to the project in workers.json.'); }
  const repo = slugFromRemote(url);
  if (!repo) throw new PrError('The git remote is not a GitHub address. Add "github": "owner/repo" to the project in workers.json.');
  return { project, folder, repo, source: 'git remote' };
}

// ----- reading -----
const safeHttps = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === 'github.com' ? x.href : null; } catch { return null; } };
const MAX_CHECKS = 100;

/** Checks, reviews and merge state for one pull request, fetched fresh. */
export async function inspect(gh, repo, number, { sleep = (ms) => new Promise((r) => setTimeout(r, ms)), retries = 2 } = {}) {
  const n = Number(number); if (!Number.isInteger(n) || n < 1) throw new PrError('Bad pull request number.');
  let pr = await gh.get(`/repos/${repo}/pulls/${n}`);
  for (let i = 0; i < retries && pr.state === 'open' && pr.mergeable == null; i++) { await sleep(1500); pr = await gh.get(`/repos/${repo}/pulls/${n}`); } // GitHub works mergeable out in the background
  const sha = pr.head?.sha;
  const [runs, status, reviews, repoInfo] = await Promise.all([
    gh.get(`/repos/${repo}/commits/${sha}/check-runs?per_page=${MAX_CHECKS}`),
    gh.get(`/repos/${repo}/commits/${sha}/status?per_page=${MAX_CHECKS}`),
    gh.get(`/repos/${repo}/pulls/${n}/reviews?per_page=100`),
    gh.get(`/repos/${repo}`),
  ]);
  const truncated = (runs.total_count ?? 0) > MAX_CHECKS || (status.total_count ?? 0) > MAX_CHECKS;
  const checks = summarizeChecks({ runs: runs.check_runs ?? [], statuses: status.statuses ?? [], truncated });
  const repoRules = { allow_squash_merge: repoInfo.allow_squash_merge };
  const reasons = mergeGate({ pr, checks, repo: repoRules });
  return {
    number: n, nodeId: pr.node_id, title: String(pr.title ?? '').slice(0, 300), branch: pr.head?.ref, base: pr.base?.ref, author: pr.user?.login ?? '', draft: !!pr.draft,
    url: safeHttps(pr.html_url), updated: pr.updated_at, sha, checks, mergeState: mergeLabel(pr), review: reviewState(reviews),
    autoMerge: !!pr.auto_merge, canMerge: reasons.length === 0, reasons, autoReasons: autoMergeGate({ pr, checks, repo: repoRules }), defaultBranch: repoInfo.default_branch,
    squashAllowed: repoInfo.allow_squash_merge !== false, autoAllowed: !!repoInfo.allow_auto_merge, _pr: pr,
  };
}
const publicPr = ({ _pr, nodeId, ...rest }) => { void _pr; void nodeId; return rest; };

export async function listPrs(gh, repo, opts) {
  const list = await gh.get(`/repos/${repo}/pulls?state=open&per_page=${MAX_PRS}`);
  const out = await Promise.all(list.slice(0, MAX_PRS).map((p) => inspect(gh, repo, p.number, { ...opts, retries: 0 }).then(publicPr)));
  return out;
}
export const checkPr = async (gh, repo, number, opts) => publicPr(await inspect(gh, repo, number, opts));

// ----- local branches and the create form -----
const BRANCH = /^(?!-)(?!.*\.\.)[A-Za-z0-9._/-]{1,100}$/;
export const isBranch = (b) => typeof b === 'string' && BRANCH.test(b) && !b.endsWith('/') && !b.endsWith('.lock');
const TEMPLATES = ['.github/pull_request_template.md', '.github/PULL_REQUEST_TEMPLATE.md', 'docs/pull_request_template.md', 'pull_request_template.md', 'PULL_REQUEST_TEMPLATE.md'];

export async function localBranches({ folder, base, exec = nodeExecFile }) {
  const out = await git(exec, folder, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']);
  return out.split('\n').map((s) => s.trim()).filter((b) => b && b !== base && isBranch(b));
}

/** Title and body for a new pull request, from the branch's own changelog fragment and the repo's template. */
export async function prefill({ folder, branch, exec = nodeExecFile }) {
  if (!isBranch(branch)) throw new PrError('Bad branch name.');
  const ref = `refs/heads/${branch}`;
  const show = (path) => git(exec, folder, ['show', `${ref}:${path}`]).catch(() => null);
  const notes = [];
  let files = [];
  try { files = (await git(exec, folder, ['ls-tree', '--name-only', ref, 'docs/changelog/unreleased/'])).split('\n').map((s) => s.trim()).filter((f) => /\.md$/.test(f) && !/\/README\.md$/i.test(f)); } catch { /* no such folder */ }
  const mine = `${branch.replace(/\//g, '-')}.md`;
  const pickF = files.find((f) => f.endsWith('/' + mine)) ?? (files.length === 1 ? files[0] : null);
  if (files.length > 1 && !files.some((f) => f.endsWith('/' + mine))) notes.push('Several changelog fragments are on this branch and none is named after it, so none was used.');
  let title = '', body = '';
  if (pickF) {
    const text = (await show(pickF)) ?? '';
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const i = lines.findIndex((l) => /^# \S/.test(l));
    if (i >= 0) { title = lines[i].slice(2).trim().slice(0, 256); body = [...lines.slice(0, i), ...lines.slice(i + 1)].join('\n').trim(); notes.push(`Title and description from ${pickF.split('/').pop()}.`); }
    else notes.push('The changelog fragment has no "# " title line.');
  } else if (!notes.length) notes.push('No changelog fragment on this branch: write the title and description yourself.');
  let template = null;
  for (const t of TEMPLATES) { template = await show(t); if (template != null) { notes.push(`Added the repository's pull request template (${t}).`); break; } }
  if (template != null) body = body ? `${body}\n\n${template.trim()}` : template.trim();
  if (!title) title = branch.replace(/^[^/]+\//, '').replace(/[-_]+/g, ' ');
  return { title, body, notes };
}

// ----- acting (each needs confirm === true; none runs by itself) -----
const need = (confirm) => { if (confirm !== true) throw new PrError('Confirmation is required. Nothing was changed.', { status: 400 }); };

async function ensurePushed({ folder, branch, exec }) {
  if (!isBranch(branch)) throw new PrError('Bad branch name.'); // checked again here so no other caller can pass an option-like value to git
  const local = (await git(exec, folder, ['rev-parse', `refs/heads/${branch}`])).trim();
  const remote = (await git(exec, folder, ['ls-remote', '--heads', '--', 'origin', `refs/heads/${branch}`]).catch(() => '')).split(/\s+/)[0];
  if (remote === local) return false;
  await git(exec, folder, ['push', 'origin', `refs/heads/${branch}:refs/heads/${branch}`], { timeout: 120000 }); // never forced, never another ref
  return true;
}

export async function createPr({ gh, repo, folder, branch, title, body, draft = false, confirm, exec = nodeExecFile }) {
  need(confirm);
  if (!isBranch(branch)) throw new PrError('Bad branch name.');
  const t = String(title ?? '').trim(); if (!t || t.length > 256) throw new PrError('Give the pull request a title (up to 256 characters).');
  const s = screenPrompt(`${t}\n${body ?? ''}`); if (!s.ok) throw new PrError(s.why);
  const info = await gh.get(`/repos/${repo}`);
  const base = info.default_branch;
  if (branch === base) throw new PrError(`Pick a branch other than ${base}.`);
  const pushed = await ensurePushed({ folder, branch, exec }).catch((e) => { throw new PrError('Could not push the branch: ' + safeText(e.message)); });
  const pr = await gh.post(`/repos/${repo}/pulls`, { title: t, head: branch, base, body: String(body ?? ''), draft: !!draft });
  return { number: pr.number, url: safeHttps(pr.html_url), pushed };
}

export async function mergePr({ gh, repo, number, sha, confirm, inspectOpts }) {
  need(confirm);
  const cur = await inspect(gh, repo, number, inspectOpts); // fresh: what the page showed may be minutes old
  if (!sha || sha !== cur.sha) throw new PrError('The branch changed since you looked. Review the checks again.', { status: 409 });
  if (cur.reasons.length) throw new PrError('Not merged: ' + cur.reasons.join(' '), { status: 409, reasons: cur.reasons });
  const r = await gh.put(`/repos/${repo}/pulls/${cur.number}/merge`, { merge_method: 'squash', sha: cur.sha, commit_title: `${cur.title} (#${cur.number})` });
  return { merged: !!r?.merged, message: String(r?.message ?? '').slice(0, 200) };
}

export async function updateBranch({ gh, repo, number, sha, confirm, inspectOpts }) {
  need(confirm);
  const cur = await inspect(gh, repo, number, inspectOpts);
  if (!sha || sha !== cur.sha) throw new PrError('The branch changed since you looked. Refresh and try again.', { status: 409 });
  if (cur._pr.state !== 'open') throw new PrError('This pull request is not open.', { status: 409 });
  await gh.put(`/repos/${repo}/pulls/${cur.number}/update-branch`, { expected_head_sha: cur.sha });
  return { message: 'Asked GitHub to bring the branch up to date with main. New checks will run; refresh in a moment.' };
}

const ENABLE = 'mutation($id:ID!,$sha:GitObjectID){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:SQUASH,expectedHeadOid:$sha}){pullRequest{number}}}';
const DISABLE = 'mutation($id:ID!){disablePullRequestAutoMerge(input:{pullRequestId:$id}){pullRequest{number}}}';
/** GitHub's own auto-merge: GitHub merges later, only when its required checks pass. Turning it on is the explicit step. */
export async function setAutoMerge({ gh, repo, number, enable, sha, confirm, inspectOpts }) {
  need(confirm);
  const cur = await inspect(gh, repo, number, inspectOpts);
  if (enable) {
    if (!sha || sha !== cur.sha) throw new PrError('The branch changed since you looked. Refresh and try again.', { status: 409 });
    if (cur.autoReasons.length) throw new PrError('Auto-merge not turned on: ' + cur.autoReasons.join(' '), { status: 409, reasons: cur.autoReasons });
    if (!cur.autoAllowed) throw new PrError('This repository has auto-merge switched off (GitHub: Settings, General, Allow auto-merge).', { status: 409 });
    await gh.graphql(ENABLE, { id: cur.nodeId, sha: cur.sha });
    return { message: 'Auto-merge is on. GitHub will squash-merge it when its required checks pass. Turn it off here to cancel.' };
  }
  await gh.graphql(DISABLE, { id: cur.nodeId });
  return { message: 'Auto-merge is off.' };
}
