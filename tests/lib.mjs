// Tiny zero-dependency test kit (Node >= 16; `node:test` only arrived in 16.17).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const registry = [];

export function test(name, fn) {
  registry.push({ name, fn, file: currentFile });
}
let currentFile = '';
export function setCurrentFile(f) { currentFile = f; }

export function tmpDir(label = 'sprharness') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`));
  return dir;
}

export function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

// A disposable content root: copies harness.json, config/, shared/, bench/
// from the repo so tests run against the real content without touching it.
export function makeContentRoot() {
  const root = tmpDir('sprharness-root');
  for (const item of ['harness.json', 'config', 'shared', 'bench', 'profiles']) {
    const src = path.join(repoRoot, item);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(root, item), { recursive: true });
  }
  return root;
}

export function makeHome() {
  return tmpDir('sprharness-home');
}

export function runCli(args, { root, home, env = {} } = {}) {
  const r = spawnSync(process.execPath, [path.join(repoRoot, 'cli', 'harness.mjs'), ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      NO_COLOR: '1',
      ...(root ? { SPRHARNESS_ROOT: root } : {}),
      ...(home ? { SPRHARNESS_HOME_OVERRIDE: home } : {}),
      ...env,
    },
    timeout: 120000,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', out: (r.stdout || '') + (r.stderr || '') };
}

// Run a hook script (copied to `dir` so its .state/ never lands in the repo).
export function runHook(dir, script, payload, { env = {}, args = [] } = {}) {
  const r = spawnSync(process.execPath, [path.join(dir, script), ...args], {
    input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, ...env }, timeout: 30000,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

export function copyHookScripts() {
  const dir = tmpDir('sprharness-hooks');
  fs.cpSync(path.join(repoRoot, 'shared', 'hooks', 'scripts'), dir, { recursive: true });
  return dir;
}

export function writeLines(file, n, prefix = 'line') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Array.from({ length: n }, (_, i) => `${prefix} ${i + 1} with some padding text to look like code`).join('\n') + '\n');
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}
