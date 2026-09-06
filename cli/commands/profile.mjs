import path from 'node:path';
import { machineFile, dirs } from '../lib/paths.mjs';
import { readJson, writeJson, isDir, listDirs } from '../lib/fsutil.mjs';
import { c, sym } from '../lib/ui.mjs';

// Profiles are committed personal overlays (profiles/<name>/ mirrors
// shared/). WHICH profile a machine uses is machine-local state.

export async function profile(args) {
  const sub = args[0];
  const machine = readJson(machineFile, {});

  if (sub === 'use') {
    const name = args[1];
    if (!name) {
      console.error(`${sym.err} Usage: harness profile use <name>`);
      process.exitCode = 1;
      return;
    }
    if (!isDir(path.join(dirs.profiles, name))) {
      console.error(`${sym.err} profiles/${name}/ does not exist. Create it (mirroring shared/) and commit it.`);
      process.exitCode = 1;
      return;
    }
    machine.profile = name;
    writeJson(machineFile, machine);
    console.log(`${sym.ok} This machine now uses profile overlay ${c.cyan('profiles/' + name + '/')}`);
    console.log(c.dim('  Run `harness install` to re-materialize with the overlay applied.'));
    return;
  }

  if (sub === 'clear') {
    delete machine.profile;
    writeJson(machineFile, machine);
    console.log(`${sym.ok} Profile overlay cleared — shared/ only.`);
    return;
  }

  const names = listDirs(dirs.profiles).filter((n) => !n.startsWith('.'));
  console.log('\nActive profile: ' + (machine.profile ? c.cyan(machine.profile) : c.dim('none')));
  console.log('Available profiles: ' + (names.length ? names.join(', ') : c.dim('none — create profiles/<name>/')));
  console.log(c.dim('\nUsage: harness profile use <name> | harness profile clear'));
}
