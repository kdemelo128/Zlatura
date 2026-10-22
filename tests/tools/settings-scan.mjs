/* tests/tools/settings-scan.mjs -- a scan of the project's own Claude Code
 * settings for risky grants: any shell command allowed without asking, a hook
 * or tool that downloads and runs code, a secret written into the settings,
 * permission checks switched off, or `private/` no longer denied. The idea
 * comes from ruflo's settings risk scan (dev-tools-and-reuse.md, B5); this is
 * our own code. `npm test` runs it through tests/settings-scan.test.js, and
 *   node tests/tools/settings-scan.mjs
 * prints the findings and exits 1 if any is a fail. */
import fs from 'node:fs';
import path from 'node:path';

/** Text that downloads or runs code, or escalates, wherever it appears in a command or a grant. */
const RISKY = [
  [/\b(curl|wget)\b[^|]*\|\s*(ba|z)?sh\b/, 'downloads and runs a script'],
  [/\bsudo\b/, 'runs as root'],
  [/\brm\s+-[a-z]*[rf]/, 'deletes files recursively or by force'],
  [/\bbase64\s+(-d|--decode)\b/, 'decodes hidden text to run'],
  [/\beval\b/, 'runs text as a command'],
  [/\bnpx\b|@latest\b/, 'fetches a package that is not pinned'],
  [/\bchmod\s+(-R\s+)?777\b/, 'makes files writable by anyone'],
  [/--dangerously|--no-verify\b/, 'switches a safety check off'],
];
const SECRET_KEY = /(TOKEN|SECRET|PASSWORD|API_?KEY|PRIVATE_?KEY)/i;

/**
 * The findings for one settings object: [{ level: 'fail' | 'warn', where, text }].
 * `project` is true for .claude/settings.json, which must deny reading private/.
 */
export function scanSettings(s, { file = 'settings', project = false } = {}) {
  const out = [];
  const add = (level, where, text) => out.push({ level, where: `${file}: ${where}`, text });
  const risky = (where, text) => { for (const [re, why] of RISKY) if (re.test(text)) add('fail', where, `“${text}” ${why}`); };
  const perms = (s && s.permissions) || {};
  for (const g of perms.allow || []) {
    if (/^Bash(\((\*|:\*)?\))?$/.test(g.trim())) add('fail', 'permissions.allow', `“${g}” allows every shell command without asking`);
    risky('permissions.allow', g);
  }
  if (perms.defaultMode === 'bypassPermissions') add('fail', 'permissions.defaultMode', 'bypassPermissions switches every permission check off');
  if (s && s.dangerouslySkipPermissions) add('fail', 'dangerouslySkipPermissions', 'switches every permission check off');
  if (project && !(perms.deny || []).includes('Read(./private/**)')) add('fail', 'permissions.deny', 'Read(./private/**) is missing: the confidential files could be read');
  for (const [event, groups] of Object.entries((s && s.hooks) || {})) {
    for (const g of groups || []) for (const h of g.hooks || []) {
      const cmd = String(h.command || '');
      if (h.type === 'command' && !/^node "\$CLAUDE_PROJECT_DIR"\/\.claude\/hooks\/[\w.-]+\.mjs$/.test(cmd)) add('warn', `hooks.${event}`, `“${cmd}” is not one of the project's own hook files (node .claude/hooks/<name>.mjs)`);
      risky(`hooks.${event}`, cmd);
    }
  }
  for (const [k, v] of Object.entries((s && s.env) || {})) if (SECRET_KEY.test(k) && v) add('fail', `env.${k}`, 'a secret is written into the settings: set it in the environment instead');
  if (s && s.enableAllProjectMcpServers) add('warn', 'enableAllProjectMcpServers', 'every MCP server in .mcp.json is trusted without asking');
  for (const [name, m] of Object.entries((s && s.mcpServers) || {})) {
    risky(`mcpServers.${name}`, [m.command, ...(m.args || [])].filter(Boolean).join(' '));
    for (const [k, v] of Object.entries(m.env || {})) if (SECRET_KEY.test(k) && v && !/^\$\{?\w+\}?$/.test(v)) add('fail', `mcpServers.${name}.env.${k}`, 'a secret is written into the file');
  }
  return out;
}

/** The findings for the repo's settings files that exist: .claude/settings.json, .claude/settings.local.json and .mcp.json. */
export function scanRepo(root) {
  const out = [];
  for (const [rel, project] of [['.claude/settings.json', true], ['.claude/settings.local.json', false], ['.mcp.json', false]]) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) continue;
    let s;
    try { s = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { out.push({ level: 'fail', where: rel, text: `not valid JSON: ${e.message}` }); continue; }
    out.push(...scanSettings(s, { file: rel, project }));
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const found = scanRepo(path.resolve(new URL('../..', import.meta.url).pathname));
  for (const f of found) console.log(`${f.level.toUpperCase()} | ${f.where}: ${f.text}`);
  console.log(found.length ? `${found.length} finding(s)` : 'settings scan: nothing risky found');
  process.exit(found.some((f) => f.level === 'fail') ? 1 : 0);
}
