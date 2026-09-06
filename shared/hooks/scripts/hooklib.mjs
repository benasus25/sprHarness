// Shared helpers for sprHarness hook scripts. Installed next to the scripts
// (~/.claude/hooks/sprharness/, ~/.cursor/hooks/sprharness/) and also
// imported by the CLI's benchmark tooling from the repo. Zero dependencies,
// Node >= 16. Every helper fails soft: a hook bug must never brick a session.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BYPASS_ENV = 'SPRHARNESS_BYPASS';
export const THRESHOLD_ENV = 'SPRHARNESS_MAX_READ_LINES';
export const DEFAULT_THRESHOLD = 400;

// The prefix a user types to run ONE prompt without token-thrift routing.
// `/bare ...` (slash command) and `bare: ...` (plain) both work.
export const BARE_RE = /^\s*(?:\/bare\b|bare:)/i;

export function stateDir() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = path.join(here, '.state');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* read-only fs: flags just won't persist */ }
  return dir;
}

export function readStdinJson() {
  return new Promise((resolve) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => (input += d));
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(input || '{}')); } catch { resolve({}); }
    });
    process.stdin.on('error', () => resolve({}));
  });
}

export function threshold() {
  const n = parseInt(process.env[THRESHOLD_ENV] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_THRESHOLD;
}

function sessionKey(payload) {
  return String(payload.session_id || payload.conversation_id || 'global').replace(/[^A-Za-z0-9_-]/g, '_');
}

function bypassFlagFile(payload) {
  return path.join(stateDir(), `bypass-${sessionKey(payload)}`);
}

// Token-thrift hooks call this. Safety hooks (secrets, destructive git) must NOT.
export function thriftBypassed(payload) {
  if (process.env[BYPASS_ENV] === '1') return true;
  try { return fs.existsSync(bypassFlagFile(payload)); } catch { return false; }
}

export function setThriftBypass(payload, on) {
  const file = bypassFlagFile(payload);
  try {
    if (on) fs.writeFileSync(file, new Date().toISOString());
    else if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch { /* soft */ }
}

// Per-session counter of bare prompts, so session-log can label the session.
export function noteBarePrompt(payload) {
  const file = path.join(stateDir(), `bare-count-${sessionKey(payload)}`);
  try {
    const n = parseInt(fs.readFileSync(file, 'utf8'), 10) || 0;
    fs.writeFileSync(file, String(n + 1));
  } catch {
    try { fs.writeFileSync(file, '1'); } catch { /* soft */ }
  }
}

export function readBareCount(payload) {
  try { return parseInt(fs.readFileSync(path.join(stateDir(), `bare-count-${sessionKey(payload)}`), 'utf8'), 10) || 0; } catch { return 0; }
}

export function clearSessionState(payload) {
  const key = sessionKey(payload);
  for (const name of [`bypass-${key}`, `bare-count-${key}`]) {
    try { fs.unlinkSync(path.join(stateDir(), name)); } catch { /* absent */ }
  }
}

export const BINARY_EXT = /\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|gz|tar|exe|dll|woff2?|ttf|mp[34]|mov|bin|lock)$/i;

// Line count with a cheap size pre-check; returns 0 for unreadable/binary.
export function lineCount(filePath, limit) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return 0;
    if (stat.size < limit * 20) return 0; // can't exceed `limit` lines at ~20 bytes/line
    return fs.readFileSync(filePath, 'utf8').split('\n').length;
  } catch { return 0; }
}

// ── Transcript analysis (used by session-log hook and `harness bench`) ──
// Claude Code writes one JSON object per line. Assistant lines carry
// message.usage and message.model; `isSidechain: true` marks subagent
// (worker) traffic. Streaming can repeat a message across lines, so usage
// is de-duplicated by message.id.
export function analyzeTranscript(transcriptPath) {
  const empty = () => ({ input: 0, cacheCreate: 0, cacheRead: 0, output: 0 });
  const result = {
    turns: 0,
    orchestrator: empty(),
    workers: empty(),
    byModel: {},
    toolCalls: {},
    workerInvocations: 0,
    userPrompts: 0,
    compactions: 0,
  };
  let text;
  try { text = fs.readFileSync(transcriptPath, 'utf8'); } catch { return result; }
  const seen = new Set();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.type === 'summary') { result.compactions += 1; continue; }
    const msg = entry.message;
    if (!msg) continue;
    if (entry.type === 'user' && !entry.isSidechain && typeof msg.content === 'string') result.userPrompts += 1;
    if (entry.type !== 'assistant') continue;
    const blocks = Array.isArray(msg.content) ? msg.content : [];
    for (const b of blocks) {
      if (b && b.type === 'tool_use' && b.name) {
        result.toolCalls[b.name] = (result.toolCalls[b.name] || 0) + 1;
        if (b.name === 'Task' || b.name === 'Agent') result.workerInvocations += 1;
      }
    }
    const id = msg.id || entry.uuid;
    if (!msg.usage || (id && seen.has(id))) continue;
    if (id) seen.add(id);
    result.turns += 1;
    const u = msg.usage;
    const bucket = entry.isSidechain ? result.workers : result.orchestrator;
    bucket.input += u.input_tokens || 0;
    bucket.cacheCreate += u.cache_creation_input_tokens || 0;
    bucket.cacheRead += u.cache_read_input_tokens || 0;
    bucket.output += u.output_tokens || 0;
    const model = msg.model || 'unknown';
    const m = (result.byModel[model] = result.byModel[model] || { ...empty(), sidechain: !!entry.isSidechain });
    m.input += u.input_tokens || 0;
    m.cacheCreate += u.cache_creation_input_tokens || 0;
    m.cacheRead += u.cache_read_input_tokens || 0;
    m.output += u.output_tokens || 0;
  }
  return result;
}

export function totalTokens(b) {
  return b.input + b.cacheCreate + b.cacheRead + b.output;
}

export function appendCsvRow(file, header, row) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const needHeader = !fs.existsSync(file) || fs.statSync(file).size === 0;
    const esc = (v) => {
      const s = String(v == null ? '' : v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const line = row.map(esc).join(',') + '\n';
    fs.appendFileSync(file, (needHeader ? header.join(',') + '\n' : '') + line);
  } catch { /* soft */ }
}

export function argValue(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
