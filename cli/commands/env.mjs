import path from 'node:path';
import { dirs } from '../lib/paths.mjs';
import { readJson, writeJson } from '../lib/fsutil.mjs';
import { c, sym } from '../lib/ui.mjs';

// Machine-local secrets for ${VAR} references in shared MCP definitions.
// Stored in local/env.json (gitignored). Values are never printed in full.

const envFile = () => path.join(dirs.local, 'env.json');

export async function env(args) {
  const [sub, key, ...rest] = args;
  const data = readJson(envFile(), {}) || {};

  if (sub === 'set') {
    const value = rest.join(' ');
    if (!key || !value) { console.error(`${sym.err} Usage: harness env set KEY VALUE`); process.exitCode = 1; return; }
    data[key] = value;
    writeJson(envFile(), data);
    console.log(`${sym.ok} ${key} saved to local/env.json ${c.dim('(machine-local, never committed)')}`);
    console.log(c.dim('  Run `harness install` to re-materialize MCP servers with it.'));
    return;
  }
  if (sub === 'unset') {
    if (!key) { console.error(`${sym.err} Usage: harness env unset KEY`); process.exitCode = 1; return; }
    delete data[key];
    writeJson(envFile(), data);
    console.log(`${sym.ok} ${key} removed`);
    return;
  }
  const keys = Object.keys(data);
  console.log('\n' + c.bold('local/env.json') + c.dim(' — machine-local values for ${VAR} in shared/mcp/servers.json\n'));
  if (keys.length === 0) console.log(c.dim('  (empty)  harness env set KEY VALUE'));
  for (const k of keys) {
    const v = String(data[k]);
    console.log(`  ${k} = ${v.slice(0, 2)}${'*'.repeat(Math.max(4, Math.min(12, v.length - 2)))}`);
  }
  console.log('');
}
