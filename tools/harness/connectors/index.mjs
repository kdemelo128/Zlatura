import { makeConnector } from './base.mjs';

// Command lines marked verified:false come from the vendors' public docs as remembered and
// are confirmed per machine by `doctor` and the dry run (H2). None of them hold a key.
export const CONNECTORS = {
  claude: makeConnector({ id: 'claude', vendor: 'Anthropic', mode: 'agent', verified: true, note: 'This session. A headless `claude -p` can be added on the owner\'s computer in H2.' }),
  openai: makeConnector({ id: 'openai', vendor: 'OpenAI', mode: 'cli', bin: 'codex', args: ['exec', '-'], verified: true, note: 'Codex CLI signed in with the ChatGPT account. Tested on the owner\'s Mac (2026-11-07): `codex exec -` reads the packet on stdin and answers in a read-only sandbox. Outside a git repo it needs --skip-git-repo-check; the harness runs it inside a git worktree.' }),
  gemini: makeConnector({ id: 'gemini', vendor: 'Google', mode: 'relay', relayUrl: 'https://gemini.google.com', note: 'Paste-in chat. The free Gemini command-line tool was tested on the owner\'s Mac (2026-11-07): signing in works but Google answers "no longer supported for Gemini Code Assist for individuals" and points to Antigravity (not evaluated).' }),
  grok: makeConnector({ id: 'grok', vendor: 'xAI', mode: 'relay', relayUrl: 'https://grok.com', note: 'Chat only on a free plan.' }),
  kimi: makeConnector({ id: 'kimi', vendor: 'Moonshot AI', mode: 'relay', relayUrl: 'https://www.kimi.com', note: 'Chat only on a free plan.' }),
  muse: makeConnector({ id: 'muse', vendor: 'Meta', mode: 'relay', relayUrl: 'https://www.meta.ai', note: 'Meta AI (Muse) chat only.' }),
};

export const connectorFor = (worker) => {
  const c = CONNECTORS[worker.connector];
  if (!c) throw new Error(`worker ${worker.id}: unknown connector ${worker.connector}`);
  return c;
};
