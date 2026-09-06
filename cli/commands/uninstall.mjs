import { harnessFile } from '../lib/paths.mjs';
import { readJson } from '../lib/fsutil.mjs';
import { hosts, getHost } from '../hosts/index.mjs';
import { loadManifest, deleteManifest, undoActions } from '../lib/manifest.mjs';
import { c, sym, heading } from '../lib/ui.mjs';

// Undo exactly what `install` recorded in this machine's manifest: remove
// copied files, strip managed marker blocks, revert merged JSON keys. Never
// touches anything the harness didn't write.

export async function uninstall(args) {
  const requested = args.filter((a) => !a.startsWith('--'));
  const state = readJson(harnessFile, { hosts: {} });
  const targets = requested.length > 0 ? requested : Object.keys(state.hosts || {});

  heading('Uninstalling harness integration from this machine');
  let any = false;
  for (const id of targets) {
    const host = getHost(id);
    if (!host) {
      console.error(`${sym.err} Unknown host '${id}'. Supported: ${hosts.map((h) => h.id).join(', ')}`);
      continue;
    }
    const manifest = loadManifest(id);
    if (!manifest) {
      console.log(`${sym.off} ${host.label}: nothing installed on this machine`);
      continue;
    }
    any = true;
    console.log(c.bold(host.label));
    undoActions(manifest.actions, (line) => console.log('  - ' + line));
    deleteManifest(id);
    console.log(`${sym.ok} ${host.label} integration removed\n`);
  }

  if (any) {
    console.log(c.dim('Portable configuration in the repo is untouched — only this machine changed.'));
  }
}
