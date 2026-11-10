// The merge rule, on its own and with no imports so a test can mutate it: a pull request merges only when
// every check is green, nothing conflicts, and GitHub says it is ready. Anything else is refused (default deny).
// There is no override on purpose.

const GOOD = new Set(['success', 'neutral', 'skipped']);

/** One verdict from check runs (GitHub Actions) and commit statuses (older CI). `truncated` means there were more than we could read. */
export function summarizeChecks({ runs = [], statuses = [], truncated = false } = {}) {
  let passing = 0, failing = 0, pending = 0; const failed = [];
  for (const r of runs) {
    if (r.status !== 'completed') pending++;
    else if (GOOD.has(r.conclusion)) passing++;
    else { failing++; failed.push(String(r.name ?? 'check').slice(0, 80)); }
  }
  for (const s of statuses) {
    if (s.state === 'success') passing++;
    else if (s.state === 'pending') pending++;
    else { failing++; failed.push(String(s.context ?? 'status').slice(0, 80)); }
  }
  const total = passing + failing + pending;
  let state;
  if (failing) state = 'red';
  else if (pending) state = 'pending';
  else if (truncated) state = 'unknown';
  else if (total === 0) state = 'none';
  else state = 'green';
  return { state, total, passing, failing, pending, failed: failed.slice(0, 10), truncated: !!truncated };
}

/** Latest verdict per reviewer; comments and pending drafts do not count. */
export function reviewState(reviews = []) {
  const last = new Map();
  for (const r of reviews) if (r.state === 'APPROVED' || r.state === 'CHANGES_REQUESTED' || r.state === 'DISMISSED') last.set(r.user?.login ?? '?', r.state);
  const v = [...last.values()];
  if (v.includes('CHANGES_REQUESTED')) return 'changes requested';
  if (v.includes('APPROVED')) return 'approved';
  return 'none';
}

/** Plain label for GitHub's mergeable_state. */
export function mergeLabel(pr) {
  if (pr.state && pr.state !== 'open') return 'closed';
  if (pr.mergeable === false || pr.mergeable_state === 'dirty') return 'conflict';
  if (pr.draft || pr.mergeable_state === 'draft') return 'draft';
  if (pr.mergeable == null || pr.mergeable_state === 'unknown') return 'checking';
  return { clean: 'clean', behind: 'behind', blocked: 'blocked', unstable: 'unstable', has_hooks: 'clean' }[pr.mergeable_state] ?? 'blocked';
}

/** Why a pull request may not be merged right now. Empty list means it may. */
export function mergeGate({ pr, checks, repo = {} }) {
  const why = [];
  const label = mergeLabel(pr);
  if (pr.merged || (pr.state && pr.state !== 'open')) why.push('This pull request is not open.');
  if (label === 'draft') why.push('It is a draft. Mark it ready for review first.');
  if (label === 'conflict') why.push('It conflicts with the main branch. Fix the conflict first.');
  if (label === 'checking') why.push('GitHub has not finished working out whether it merges. Try again in a moment.');
  if (label === 'behind') why.push('The branch is behind main. Update the branch first.');
  if (label === 'blocked') why.push('GitHub says it is blocked (a required review or check is missing).');
  if (checks.state === 'red') why.push(`Checks are failing${checks.failed?.length ? ': ' + checks.failed.join(', ') : ''}.`);
  else if (checks.state === 'pending') why.push(`Checks are still running (${checks.pending} of ${checks.total} not finished).`);
  else if (checks.state === 'none') why.push('No checks have reported yet, so there is nothing to show it is safe.');
  else if (checks.state !== 'green') why.push('The checks could not be read in full, so they cannot be shown green.');
  if (repo.allow_squash_merge === false) why.push('This repository does not allow squash merges.');
  return why;
}

/** Auto-merge may wait for running checks, but not for a failure, a conflict, a draft or a closed pull request. */
export function autoMergeGate({ pr, checks, repo = {} }) {
  const why = [];
  const label = mergeLabel(pr);
  if (pr.merged || (pr.state && pr.state !== 'open')) why.push('This pull request is not open.');
  if (label === 'draft') why.push('It is a draft. Mark it ready for review first.');
  if (label === 'conflict') why.push('It conflicts with the main branch. Fix the conflict first.');
  if (checks.state === 'red') why.push(`Checks are failing${checks.failed?.length ? ': ' + checks.failed.join(', ') : ''}.`);
  if (repo.allow_squash_merge === false) why.push('This repository does not allow squash merges.');
  return why;
}
