// Small shared helpers for the hub's own files in ~/.zlatura-hub (outside every repository).
import { mkdirSync, chmodSync, writeFileSync, renameSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

export const hubDir = (env = process.env) => join(env.HOME || homedir(), '.zlatura-hub');

/** Read a JSON file; a missing or damaged file gives `fallback` (the caller then starts clean, it never throws). */
export function readJson(file, fallback) {
  try { const j = JSON.parse(readFileSync(file, 'utf8')); return j && typeof j === 'object' && !Array.isArray(j) ? j : fallback; } catch { return fallback; }
}

/** Write a JSON file atomically (temp file, then rename) with owner-only permissions. */
export function writeJsonAtomic(file, value) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  try { chmodSync(dirname(file), 0o700); } catch { /* best effort */ }
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
  try { chmodSync(tmp, 0o600); } catch { /* best effort */ }
  renameSync(tmp, file);
}
