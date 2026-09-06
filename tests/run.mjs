#!/usr/bin/env node
// Discovers tests/*.test.mjs, runs them sequentially, exits non-zero on failure.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { registry, setCurrentFile } from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] || '';
const files = fs.readdirSync(here).filter((f) => f.endsWith('.test.mjs') && f.includes(filter)).sort();

for (const f of files) {
  setCurrentFile(f);
  await import(pathToFileURL(path.join(here, f)).href);
}

let passed = 0;
const failures = [];
const started = Date.now();
for (const t of registry) {
  const t0 = Date.now();
  try {
    await t.fn();
    passed++;
    console.log(`  ✓ ${t.file.replace('.test.mjs', '')} › ${t.name} (${Date.now() - t0}ms)`);
  } catch (err) {
    failures.push({ t, err });
    console.log(`  ✗ ${t.file.replace('.test.mjs', '')} › ${t.name}`);
    console.log('      ' + String(err && err.stack ? err.stack : err).split('\n').slice(0, 6).join('\n      '));
  }
}
console.log(`\n${passed} passed, ${failures.length} failed, ${registry.length} total (${((Date.now() - started) / 1000).toFixed(1)}s)`);
process.exit(failures.length ? 1 : 0);
