import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test, tmpDir, rmrf, writeLines } from './lib.mjs';
import { upsertBlock, removeBlock } from '../cli/lib/markers.mjs';
import { mergeIntoJsonFile, revertJsonChanges } from '../cli/lib/jsonmerge.mjs';
import { parseFrontmatter } from '../cli/lib/frontmatter.mjs';
import { tomlTable } from '../cli/lib/toml.mjs';
import { median, delta } from '../cli/lib/stats.mjs';

test('markers: upsert creates, replaces in place, is idempotent, removes cleanly', () => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'CLAUDE.md');
    fs.writeFileSync(file, '# mine\nkeep me\n');
    assert.equal(upsertBlock(file, 'x', 'v1', 'html').changed, true);
    assert.equal(upsertBlock(file, 'x', 'v1', 'html').changed, false);
    assert.equal(upsertBlock(file, 'x', 'v2', 'html').changed, true);
    const text = fs.readFileSync(file, 'utf8');
    assert.match(text, /# mine\nkeep me/);
    assert.equal((text.match(/sprharness:x/g) || []).length, 2, 'exactly one block (start+end markers)');
    assert.match(text, /v2/);
    assert.doesNotMatch(text, /v1/);
    removeBlock(file, 'x', 'html');
    assert.equal(fs.readFileSync(file, 'utf8'), '# mine\nkeep me\n');
  } finally { rmrf(dir); }
});

test('jsonmerge: tracked merge skips nulls, records prev, reverts exactly', () => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'settings.json');
    const original = { model: 'sonnet', permissions: { allow: ['Bash(npm test)'] } };
    fs.writeFileSync(file, JSON.stringify(original));
    const changes = mergeIntoJsonFile(file, { model: 'opus', env: { A: '1' }, hooks: null, permissions: { deny: ['rm'] } });
    const merged = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(merged.model, 'opus');
    assert.deepEqual(merged.env, { A: '1' });
    assert.deepEqual(merged.permissions, { allow: ['Bash(npm test)'], deny: ['rm'] });
    assert.equal('hooks' in merged, false, 'null patch values are skipped');
    assert.equal(changes.find((c) => c.path.join('.') === 'model').prev, 'sonnet');
    revertJsonChanges(file, changes);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), original);
  } finally { rmrf(dir); }
});

test('frontmatter: parses keys, quotes, booleans; flags malformed; null without fences', () => {
  const { data, body } = parseFrontmatter('---\nname: x-y\ndescription: "Use when foo"\nreadonly: true\nbad line\n---\nBody here\n');
  assert.equal(data.name, 'x-y');
  assert.equal(data.description, 'Use when foo');
  assert.equal(data.readonly, true);
  assert.deepEqual(data.__malformed, ['bad line']);
  assert.equal(body.trim(), 'Body here');
  assert.equal(parseFrontmatter('no fences').data, null);
  assert.equal(parseFrontmatter('﻿---\nname: a\n---\n').data.name, 'a', 'BOM tolerated');
});

test('toml: emits tables with strings, arrays, inline env; skips nulls', () => {
  const out = tomlTable(['mcp_servers', 'x'], { command: 'npx', args: ['-y', 'pkg'], env: { K: 'v' }, nothing: null, n: 3, b: true });
  assert.equal(out, '[mcp_servers.x]\ncommand = "npx"\nargs = ["-y", "pkg"]\nenv = { K = "v" }\nn = 3\nb = true');
});

test('stats: median and delta', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
  assert.equal(delta(100, 50), -0.5);
  assert.equal(delta(0, 5), null);
});

test('writeLines helper produces the requested line count', () => {
  const dir = tmpDir();
  try {
    const f = path.join(dir, 'big.txt');
    writeLines(f, 600);
    assert.equal(fs.readFileSync(f, 'utf8').split('\n').length, 601);
  } finally { rmrf(dir); }
});
