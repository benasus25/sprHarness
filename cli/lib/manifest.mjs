import path from 'node:path';
import { dirs } from './paths.mjs';
import { readJson, writeJson, exists, removePath } from './fsutil.mjs';
import { removeBlock } from './markers.mjs';
import { revertJsonChanges } from './jsonmerge.mjs';

// The install manifest is the machine-local record of exactly what `install`
// wrote on THIS machine, so `uninstall` can undo it precisely. It never
// travels through git.

function manifestFile(host) {
  return path.join(dirs.manifests, `${host}.json`);
}

export function loadManifest(host) {
  return readJson(manifestFile(host), null);
}

export function saveManifest(host, manifest) {
  writeJson(manifestFile(host), manifest);
}

export function deleteManifest(host) {
  removePath(manifestFile(host));
}

export function newManifest() {
  return { installedAt: new Date().toISOString(), actions: [] };
}

// Action shapes:
//   { type: 'copyDir',  target }                    — directory we own outright
//   { type: 'copyFile', target }                    — file we own outright
//   { type: 'marker',   file, id, style }           — managed block in a shared file
//   { type: 'jsonKeys', file, changes: [...] }      — tracked deep-merge into shared JSON
//   { type: 'custom',   note }                      — informational, nothing to undo
export function undoActions(actions, log = () => {}) {
  for (const action of [...actions].reverse()) {
    try {
      if (action.type === 'copyDir' || action.type === 'copyFile') {
        if (exists(action.target)) {
          removePath(action.target);
          log(`removed ${action.target}`);
        }
      } else if (action.type === 'marker') {
        const { changed } = removeBlock(action.file, action.id, action.style);
        if (changed) log(`removed managed block '${action.id}' from ${action.file}`);
      } else if (action.type === 'jsonKeys') {
        revertJsonChanges(action.file, action.changes);
        log(`reverted harness keys in ${action.file}`);
      }
    } catch (err) {
      log(`could not undo ${action.type} (${action.target || action.file}): ${err.message}`);
    }
  }
}
