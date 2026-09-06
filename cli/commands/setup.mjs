import path from 'node:path';
import { harnessFile, dirs, hostDirs } from '../lib/paths.mjs';
import { readJson, writeJson, exists, copyFile } from '../lib/fsutil.mjs';
import { hosts, getHost } from '../hosts/index.mjs';
import { c, sym, heading, confirm } from '../lib/ui.mjs';

// Configuration-first setup. Deliberately does NOT detect installed hosts to
// decide anything: you configure the hosts you *intend* to use, and whether
// they exist on this machine is purely informational. Saved configuration is
// portable and meant to be committed.

export async function setup(args) {
  const flagHosts = flagValue(args, '--hosts');
  const nonInteractive = flagHosts !== null || args.includes('--all');

  let chosen;
  if (args.includes('--all')) {
    chosen = hosts.map((h) => h.id);
  } else if (flagHosts !== null) {
    chosen = flagHosts.split(',').map((s) => s.trim()).filter(Boolean);
    for (const id of chosen) {
      if (!getHost(id)) {
        console.error(`${sym.err} Unknown host '${id}'. Supported: ${hosts.map((h) => h.id).join(', ')}`);
        process.exitCode = 1;
        return;
      }
    }
  } else {
    heading('Agent Harness Setup');
    console.log('  Choose the hosts you want to configure. A host does NOT need to be');
    console.log('  installed on this machine — configuration is portable and travels');
    console.log('  through git; installation and sign-in happen per machine, later.\n');
    chosen = [];
    for (const host of hosts) {
      if (await confirm(`  Configure ${host.label}?`, true)) chosen.push(host.id);
    }
  }

  if (chosen.length === 0) {
    console.log(`\n${sym.warn} Nothing selected — no changes made.`);
    return;
  }

  const state = readJson(harnessFile, { version: 1, hosts: {} });
  console.log('');
  for (const id of chosen) {
    const host = getHost(id);
    state.hosts[id] = {
      configured: true,
      configuredAt: (state.hosts[id] && state.hosts[id].configuredAt) || new Date().toISOString(),
    };

    // Seed the host's editable config from its template — only if absent, so
    // re-running setup never clobbers tuned configuration.
    const cfgFile = path.join(dirs.config, `${id}.json`);
    if (!exists(cfgFile)) {
      copyFile(path.join(dirs.templates, 'hosts', `${id}.json`), cfgFile);
    }

    console.log(`${sym.ok} ${host.label} configuration saved ${c.dim('(config/' + id + '.json)')}`);

    const det = host.detect(hostDirs());
    if (!det.installed) {
      console.log(
        c.dim(`  ${host.label} is not currently installed on this machine.\n` +
              `  The configuration will be available when you install it.`)
      );
    }
  }

  writeJson(harnessFile, state);
  console.log(`\n${sym.ok} Saved ${c.cyan('harness.json')} — commit this file and config/ to share the setup.`);
  console.log(c.dim('  Next: tune config/<host>.json and shared/, then run `harness install` on any machine.'));
}

function flagValue(args, flag) {
  const i = args.indexOf(flag);
  if (i === -1) return null;
  return args[i + 1] || '';
}
