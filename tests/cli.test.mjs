import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test, rmrf, makeContentRoot, makeHome, runCli, readJson } from './lib.mjs';

function seedHome(home) {
  const claude = path.join(home, '.claude');
  fs.mkdirSync(path.join(claude, 'skills', 'tdd'), { recursive: true });
  fs.writeFileSync(path.join(claude, 'skills', 'tdd', 'SKILL.md'), '---\nname: tdd\ndescription: USER OWNED\n---\nmine\n');
  fs.writeFileSync(path.join(claude, 'settings.json'), JSON.stringify({ model: 'sonnet', permissions: { allow: ['Bash(npm test)'] } }, null, 2));
  fs.writeFileSync(path.join(claude, 'CLAUDE.md'), '# personal notes\nkeep\n');
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(home, '.codex', 'config.toml'), 'model = "gpt-5"\n\n[mcp_servers.mine]\ncommand = "mine"\n');
}

test('install: merges into existing files, skips user-owned collisions, is idempotent; diff reports in sync', () => {
  const root = makeContentRoot();
  const home = makeHome();
  try {
    seedHome(home);
    const r = runCli(['install'], { root, home });
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /skill tdd skipped/, 'user-owned skill with the same name is skipped');
    assert.equal(fs.readFileSync(path.join(home, '.claude', 'skills', 'tdd', 'SKILL.md'), 'utf8').includes('USER OWNED'), true);
    assert.equal(fs.existsSync(path.join(home, '.claude', 'skills', 'token-thrift', 'SKILL.md')), true);
    assert.equal(fs.existsSync(path.join(home, '.claude', 'agents', 'bulk-reader.md')), true);
    assert.equal(fs.existsSync(path.join(home, '.claude', 'hooks', 'sprharness', 'hooklib.mjs')), true, 'shared hook lib installed');

    const settings = readJson(path.join(home, '.claude', 'settings.json'));
    assert.equal(settings.model, 'sonnet', 'null config model leaves the user value alone');
    assert.deepEqual(settings.permissions, { allow: ['Bash(npm test)'] });
    const pre = settings.hooks.PreToolUse;
    assert.ok(pre.some((e) => e.matcher === 'Read'), 'read-size hook wired');
    assert.ok(settings.hooks.UserPromptSubmit, 'bypass hook wired');
    assert.ok(settings.hooks.SessionEnd[0].hooks[0].command.includes('sessions.csv'), 'session-log gets --log arg with resolved placeholder');

    const claudeMd = fs.readFileSync(path.join(home, '.claude', 'CLAUDE.md'), 'utf8');
    assert.match(claudeMd, /# personal notes\nkeep/);
    assert.match(claudeMd, /Model routing/);
    const toml = fs.readFileSync(path.join(home, '.codex', 'config.toml'), 'utf8');
    assert.match(toml, /^model = "gpt-5"/);
    assert.match(toml, /\[mcp_servers\.mine\]/);

    // idempotent
    const r2 = runCli(['install', 'claude'], { root, home });
    assert.equal(r2.status, 0, r2.out);
    const s2 = readJson(path.join(home, '.claude', 'settings.json'));
    assert.equal(s2.hooks.PreToolUse.filter((e) => e.matcher === 'Read').length, 1, 'no duplicate hook entries');

    const d = runCli(['diff'], { root, home });
    assert.equal(d.status, 0, d.out);
    assert.match(d.out, /skill tdd: not installed — your own copy exists/);
    assert.match(d.out, /in sync \(1 user-owned item left alone\)/);
    assert.doesNotMatch(d.out, /changed in repo|modified locally|missing on disk|in repo, not installed here/);
  } finally { rmrf(root); rmrf(home); }
});

test('diff detects repo changes; uninstall restores every merged file exactly', () => {
  const root = makeContentRoot();
  const home = makeHome();
  try {
    seedHome(home);
    const before = {
      settings: fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'),
      claudeMd: fs.readFileSync(path.join(home, '.claude', 'CLAUDE.md'), 'utf8'),
      toml: fs.readFileSync(path.join(home, '.codex', 'config.toml'), 'utf8'),
    };
    assert.equal(runCli(['install'], { root, home }).status, 0);
    fs.appendFileSync(path.join(root, 'shared', 'skills', 'token-thrift', 'SKILL.md'), '\nchanged\n');
    const d = runCli(['diff', '--exit-code'], { root, home });
    assert.equal(d.status, 1);
    assert.match(d.out, /skill token-thrift: changed in repo/);

    const u = runCli(['uninstall'], { root, home });
    assert.equal(u.status, 0, u.out);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8')), JSON.parse(before.settings));
    assert.equal(fs.readFileSync(path.join(home, '.claude', 'CLAUDE.md'), 'utf8'), before.claudeMd);
    assert.equal(fs.readFileSync(path.join(home, '.codex', 'config.toml'), 'utf8'), before.toml);
    assert.equal(fs.existsSync(path.join(home, '.claude', 'skills', 'token-thrift')), false);
    assert.equal(fs.existsSync(path.join(home, '.claude', 'skills', 'tdd', 'SKILL.md')), true, 'user-owned skill survives uninstall');
  } finally { rmrf(root); rmrf(home); }
});

test('install --force overwrites a user-owned collision (and records it for uninstall)', () => {
  const root = makeContentRoot();
  const home = makeHome();
  try {
    seedHome(home);
    const r = runCli(['install', 'claude', '--force'], { root, home });
    assert.equal(r.status, 0, r.out);
    assert.doesNotMatch(r.out, /skipped/);
    assert.equal(fs.readFileSync(path.join(home, '.claude', 'skills', 'tdd', 'SKILL.md'), 'utf8').includes('USER OWNED'), false);
  } finally { rmrf(root); rmrf(home); }
});

test('check: passes on shipped content, fails on a broken skill with a precise message', () => {
  const root = makeContentRoot();
  try {
    assert.equal(runCli(['check', '--strict'], { root }).status, 0);
    const skill = path.join(root, 'shared', 'skills', 'tdd', 'SKILL.md');
    fs.writeFileSync(skill, fs.readFileSync(skill, 'utf8').replace('name: tdd', 'name: tdd-typo'));
    const r = runCli(['check'], { root });
    assert.equal(r.status, 1);
    assert.match(r.out, /must equal folder name 'tdd'/);
  } finally { rmrf(root); }
});

test('setup --hosts is configuration-only: succeeds with no host installed', () => {
  const root = makeContentRoot();
  const home = makeHome();
  try {
    fs.rmSync(path.join(root, 'harness.json'));
    fs.rmSync(path.join(root, 'config'), { recursive: true });
    const r = runCli(['setup', '--hosts', 'codex'], { root, home, env: { PATH: '' } });
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /Codex configuration saved/);
    assert.equal(readJson(path.join(root, 'harness.json')).hosts.codex.configured, true);
    assert.equal(fs.existsSync(path.join(root, 'config', 'codex.json')), true);
    assert.equal(runCli(['setup', '--hosts', 'nope'], { root, home }).status, 1);
  } finally { rmrf(root); rmrf(home); }
});

test('bench: mock run produces a report; list and report latest work', () => {
  const root = makeContentRoot();
  try {
    const r = runCli(['bench', 'run', '--runner', 'mock', '--n', '2', '--tasks', 'trivial-edit,explain-routing'], { root });
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /MOCK DATA/);
    assert.match(r.out, /## By category/);
    assert.match(r.out, /use `bare:`/, 'tiny tasks flagged for bypass');
    const runs = fs.readdirSync(path.join(root, 'local', 'bench', 'runs'));
    assert.equal(runs.length, 1);
    assert.equal(fs.existsSync(path.join(root, 'local', 'bench', 'runs', runs[0], 'report.md')), true);
    const lines = fs.readFileSync(path.join(root, 'local', 'bench', 'runs', runs[0], 'runs.jsonl'), 'utf8').trim().split('\n');
    assert.equal(lines.length, 8, '2 tasks × 2 conditions × n=2');
    assert.match(runCli(['bench', 'list'], { root }).out, /mock/);
    assert.equal(runCli(['bench', 'report', 'latest'], { root }).status, 0);
    assert.equal(runCli(['bench', 'sessions'], { root }).status, 0, 'no passive log is not an error');
  } finally { rmrf(root); }
});

test('env: set/list/unset round trip with masking', () => {
  const root = makeContentRoot();
  try {
    assert.equal(runCli(['env', 'set', 'MY_TOKEN', 'supersecretvalue'], { root }).status, 0);
    const l = runCli(['env'], { root });
    assert.match(l.out, /MY_TOKEN = su\*+/);
    assert.doesNotMatch(l.out, /supersecretvalue/);
    assert.equal(runCli(['env', 'unset', 'MY_TOKEN'], { root }).status, 0);
    assert.deepEqual(readJson(path.join(root, 'local', 'env.json')), {});
  } finally { rmrf(root); }
});
