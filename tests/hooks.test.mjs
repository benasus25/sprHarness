import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, tmpDir, rmrf, writeLines, copyHookScripts, runHook, repoRoot } from './lib.mjs';

function bigFile(dir) {
  const f = path.join(dir, 'big.txt');
  writeLines(f, 600);
  return f;
}

test('check-read-size: blocks untargeted big read, allows targeted, allows small, honors env bypass', () => {
  const hooks = copyHookScripts();
  const data = tmpDir();
  try {
    const big = bigFile(data);
    const small = path.join(data, 'small.txt');
    writeLines(small, 20);
    const s = 'check-read-size.claude.mjs';
    const blocked = runHook(hooks, s, { session_id: 'a', tool_name: 'Read', tool_input: { file_path: big } });
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr, /bulk-reader/);
    assert.equal(runHook(hooks, s, { session_id: 'a', tool_name: 'Read', tool_input: { file_path: big, limit: 50 } }).status, 0);
    assert.equal(runHook(hooks, s, { session_id: 'a', tool_name: 'Read', tool_input: { file_path: small } }).status, 0);
    assert.equal(runHook(hooks, s, { session_id: 'a', tool_name: 'Read', tool_input: { file_path: big } }, { env: { SPRHARNESS_BYPASS: '1' } }).status, 0);
    assert.equal(runHook(hooks, s, { session_id: 'a', tool_name: 'Read', tool_input: { file_path: big } }, { env: { SPRHARNESS_MAX_READ_LINES: '1000' } }).status, 0, 'threshold env respected');
    assert.equal(runHook(hooks, s, {}).status, 0, 'empty payload fails open');
  } finally { rmrf(hooks); rmrf(data); }
});

test('bypass-toggle: bare: prompt sets a session flag that thrift hooks honor; next prompt clears it', () => {
  const hooks = copyHookScripts();
  const data = tmpDir();
  try {
    const big = bigFile(data);
    const read = (sid) => runHook(hooks, 'check-read-size.claude.mjs', { session_id: sid, tool_name: 'Read', tool_input: { file_path: big } }).status;
    assert.equal(read('s1'), 2, 'blocked before bypass');
    const on = runHook(hooks, 'bypass-toggle.claude.mjs', { session_id: 's1', prompt: 'bare: read the whole file' });
    assert.equal(on.status, 0);
    assert.match(on.stdout, /BYPASS is active/);
    assert.equal(read('s1'), 0, 'allowed for the bypassed session');
    assert.equal(read('s2'), 2, 'other sessions unaffected');
    const slash = runHook(hooks, 'bypass-toggle.claude.mjs', { session_id: 's2', prompt: '/bare do it' });
    assert.match(slash.stdout, /BYPASS is active/, '/bare form works too');
    const off = runHook(hooks, 'bypass-toggle.claude.mjs', { session_id: 's1', prompt: 'normal prompt' });
    assert.equal(off.stdout, '', 'no context injected for normal prompts');
    assert.equal(read('s1'), 2, 'blocked again after a normal prompt');
  } finally { rmrf(hooks); rmrf(data); }
});

test('check-bash-read: blocks cat of big file, allows pipes and small files', () => {
  const hooks = copyHookScripts();
  const data = tmpDir();
  try {
    const big = bigFile(data);
    const s = 'check-bash-read.claude.mjs';
    assert.equal(runHook(hooks, s, { session_id: 'b', tool_input: { command: `cat "${big}"` } }).status, 2);
    assert.equal(runHook(hooks, s, { session_id: 'b', tool_input: { command: `cat "${big}" | head -n 5` } }).status, 0);
    assert.equal(runHook(hooks, s, { session_id: 'b', tool_input: { command: `head -n 5 "${big}"` } }).status, 0);
    assert.equal(runHook(hooks, s, { session_id: 'b', tool_input: { command: 'cat nonexistent.txt' } }).status, 0);
  } finally { rmrf(hooks); rmrf(data); }
});

test('block-destructive: blocks force-push to main and reset --hard; allows normal git; ignores bypass', () => {
  const hooks = copyHookScripts();
  try {
    const s = 'block-destructive.claude.mjs';
    const run = (command, env) => runHook(hooks, s, { session_id: 'd', tool_input: { command } }, { env }).status;
    assert.equal(run('git push --force origin main'), 2);
    assert.equal(run('git push origin main --force'), 2);
    assert.equal(run('git reset --hard HEAD~1'), 2);
    assert.equal(run('git clean -fdx'), 2);
    assert.equal(run('rm -rf /'), 2);
    assert.equal(run('git push origin feature-branch'), 0);
    assert.equal(run('git push --force origin feature-branch'), 0, 'force-push to a feature branch is allowed');
    assert.equal(run('git clean -fd'), 0);
    assert.equal(run('rm -rf build/'), 0);
    assert.equal(run('git reset --hard HEAD~1', { SPRHARNESS_BYPASS: '1' }), 2, 'safety hooks ignore bypass');
  } finally { rmrf(hooks); }
});

function syntheticTranscript(file) {
  const lines = [
    { type: 'user', uuid: 'u1', message: { role: 'user', content: 'do the thing' } },
    { type: 'assistant', uuid: 'a1', message: { id: 'm1', model: 'claude-opus-5', role: 'assistant', usage: { input_tokens: 100, cache_creation_input_tokens: 1000, cache_read_input_tokens: 5000, output_tokens: 50 }, content: [{ type: 'tool_use', name: 'Task', input: {} }] } },
    // streaming duplicate of m1 — must not double count
    { type: 'assistant', uuid: 'a1b', message: { id: 'm1', model: 'claude-opus-5', role: 'assistant', usage: { input_tokens: 100, cache_creation_input_tokens: 1000, cache_read_input_tokens: 5000, output_tokens: 50 }, content: [{ type: 'text', text: 'hi' }] } },
    { type: 'assistant', uuid: 'a2', isSidechain: true, message: { id: 'm2', model: 'claude-haiku-4-5', role: 'assistant', usage: { input_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 30000, output_tokens: 400 }, content: [{ type: 'tool_use', name: 'Read', input: {} }] } },
    { type: 'assistant', uuid: 'a3', message: { id: 'm3', model: 'claude-opus-5', role: 'assistant', usage: { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 6000, output_tokens: 80 }, content: [{ type: 'text', text: 'done' }] } },
  ];
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
}

test('analyzeTranscript: splits orchestrator vs worker tokens, dedupes streamed messages, counts workers', async () => {
  const data = tmpDir();
  try {
    const t = path.join(data, 't.jsonl');
    syntheticTranscript(t);
    const { analyzeTranscript } = await import(pathToFileURL(path.join(repoRoot, 'shared', 'hooks', 'scripts', 'hooklib.mjs')).href);
    const a = analyzeTranscript(t);
    assert.equal(a.turns, 3, 'm1 counted once');
    assert.equal(a.userPrompts, 1);
    assert.deepEqual(a.orchestrator, { input: 110, cacheCreate: 1000, cacheRead: 11000, output: 130 });
    assert.deepEqual(a.workers, { input: 20, cacheCreate: 0, cacheRead: 30000, output: 400 });
    assert.equal(a.workerInvocations, 1);
    assert.equal(a.toolCalls.Read, 1);
    assert.equal(a.byModel['claude-haiku-4-5'].sidechain, true);
    assert.equal(a.byModel['claude-opus-5'].sidechain, false);
  } finally { rmrf(data); }
});

test('session-log: appends a CSV row with mode harness, then bare after a bare prompt', () => {
  const hooks = copyHookScripts();
  const data = tmpDir();
  try {
    const t = path.join(data, 't.jsonl');
    syntheticTranscript(t);
    const log = path.join(data, 'sessions.csv');
    const payload = { session_id: 'L1', transcript_path: t, cwd: data, reason: 'exit' };
    assert.equal(runHook(hooks, 'session-log.claude.mjs', payload, { args: ['--log', log] }).status, 0);
    let rows = fs.readFileSync(log, 'utf8').trim().split('\n');
    assert.equal(rows.length, 2, 'header + 1 row');
    assert.match(rows[0], /^ended_at,session_id,cwd,mode/);
    const cols = rows[1].split(',');
    assert.equal(cols[3], 'harness');
    assert.equal(cols[11], '12240', 'orch_total = 110+1000+11000+130');
    assert.equal(cols[16], '30420', 'worker_total');
    assert.equal(cols[17], '1', 'worker_invocations');
    // bare prompt in a second session → mode bare
    runHook(hooks, 'bypass-toggle.claude.mjs', { session_id: 'L2', prompt: 'bare: x' });
    runHook(hooks, 'session-log.claude.mjs', { ...payload, session_id: 'L2' }, { args: ['--log', log] });
    rows = fs.readFileSync(log, 'utf8').trim().split('\n');
    assert.equal(rows.length, 3);
    assert.equal(rows[2].split(',')[3], 'bare');
    assert.equal(fs.existsSync(path.join(hooks, '.state', 'bypass-L2')), false, 'session state cleared at end');
  } finally { rmrf(hooks); rmrf(data); }
});
