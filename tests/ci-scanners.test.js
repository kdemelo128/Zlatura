// The security-scan workflow must keep all four scanners, each at an exact version and checked against a
// SHA-256 before it runs. Reads the workflow as text; nothing is run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const wf = read('.github/workflows/security-scan.yml');
const zreq = read('.github/zizmor-requirements.txt');
const thirdParty = read('THIRD_PARTY.md');

// each tool: the env names holding its version and checksum, and the download path
const TOOLS = [
  { name: 'actionlint', ver: 'ACTIONLINT_VERSION', sum: 'ACTIONLINT_SHA256' },
  { name: 'gitleaks', ver: 'GITLEAKS_VERSION', sum: 'GITLEAKS_SHA256' },
  { name: 'osv-scanner', ver: 'OSV_VERSION', sum: 'OSV_SHA256' },
];

for (const t of TOOLS) {
  test(`${t.name} is present, pinned to an exact version and checksum-verified`, () => {
    assert.ok(wf.includes(t.name), `${t.name} missing from security-scan.yml`);
    const ver = wf.match(new RegExp(`${t.ver}: (\\S+)`));
    assert.ok(ver && /^\d+\.\d+\.\d+$/.test(ver[1]), `${t.name} version is not an exact x.y.z`);
    const sum = wf.match(new RegExp(`${t.sum}: ([0-9a-f]{64})\\b`));
    assert.ok(sum, `${t.name} has no hard-coded 64-hex SHA-256`);
    assert.match(wf, new RegExp(`echo "\\$\\{${t.sum}\\}  [^"]+" \\| sha256sum -c -`), `${t.name} checksum is never checked`);
    assert.ok(thirdParty.includes(sum[1]), `${t.name} checksum is not listed in THIRD_PARTY.md`);
  });
}

test('zizmor is installed at an exact version with --require-hashes', () => {
  assert.match(wf, /zizmor/);
  assert.match(wf, /pip install --require-hashes -r \.github\/zizmor-requirements\.txt/);
  assert.match(wf, /zizmor --no-progress \.github\/workflows/);
  assert.match(zreq, /^zizmor==\d+\.\d+\.\d+ \\\n\s+--hash=sha256:[0-9a-f]{64}$/m);
  const sum = zreq.match(/--hash=sha256:([0-9a-f]{64})/)[1];
  assert.ok(thirdParty.includes(sum), 'zizmor hash is not listed in THIRD_PARTY.md');
});

test('the workflow runs on push and pull_request and has no unpinned download', () => {
  assert.match(wf, /^on:\n  push:\n  pull_request:/m);
  assert.doesNotMatch(wf.replace(/#.*$/gm, ''), /@latest|\/latest\/|\|\s*(sh|bash)\b/, 'unpinned tool or curl|sh');
  assert.match(wf, /osv-scanner" scan source -L package-lock\.json -L server\/package-lock\.json/);
  assert.match(wf, /gitleaks" git .*--log-opts=/, 'pull requests must scan their own commits');
});

test('every checkout drops credentials and every action is pinned to a commit SHA', () => {
  for (const f of ['security-scan.yml', 'test.yml']) {
    const text = read(`.github/workflows/${f}`);
    const checkouts = text.match(/actions\/checkout@/g) || [];
    const dropped = text.match(/persist-credentials: false/g) || [];
    assert.equal(dropped.length, checkouts.length, `${f}: a checkout keeps its credentials`);
    for (const m of text.matchAll(/uses: (\S+)@(\S+)/g)) assert.match(m[2], /^[0-9a-f]{40}$/, `${f}: ${m[1]} not SHA-pinned`);
  }
});

test('the gitleaks allowlist names exact paths and says they are not secrets', () => {
  const g = read('.gitleaks.toml');
  assert.match(g, /useDefault = true/);
  assert.match(g, /targetRules = \["generic-api-key"\]/);
  assert.match(g, /^paths = \[\n(\s+'''\^[^\n]+\$''',\n)+\]/m);
  assert.match(g, /not secrets/);
});
