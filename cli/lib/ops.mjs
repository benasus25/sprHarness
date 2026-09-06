import path from 'node:path';
import { dirs } from './paths.mjs';
import { exists, copyDir, copyFile, backupFile, hashFile, hashDir, sha256 } from './fsutil.mjs';
import { upsertBlock } from './markers.mjs';
import { mergeIntoJsonFile } from './jsonmerge.mjs';
import { c, sym } from './ui.mjs';

// Every write the installer performs goes through one of these operations so
// that (a) --dry-run can show the plan without touching anything, and (b) the
// manifest records enough to undo the install exactly.
//
// Collision guard: a copy target that already exists but is NOT recorded in
// the previous install's manifest belongs to the user (their own skill,
// agent, or prompt with the same name). Those are skipped with a warning
// unless --force — the harness must never eat pre-existing user content.

export function makeOps({ manifest, dryRun, log, ownedTargets = new Set(), force = false }) {
  const backedUp = new Set();

  function backupOnce(file) {
    if (dryRun || backedUp.has(file)) return;
    backedUp.add(file);
    backupFile(file, dirs.backups);
  }

  // In a real run the previous install was already undone before ops run, so
  // anything still present at dest is the user's. In a dry run our own
  // last-install files are still on disk — ownedTargets filters those out.
  function guardedCopy(kind, src, dest, label) {
    if (!force && exists(dest) && !ownedTargets.has(dest)) {
      log(`  ${sym.warn} ${label} ${c.yellow('skipped')} ${c.dim('— ' + dest + ' already exists and is not harness-managed (yours). Use --force to overwrite.')}`);
      // Recorded for `harness diff` only; uninstall ignores it and the next
      // install must NOT treat this target as harness-owned.
      if (!dryRun) manifest.actions.push({ type: 'skipped', target: dest, source: src, label });
      return;
    }
    log(`  + ${label} ${c.dim('→ ' + dest)}`);
    if (dryRun) return;
    if (kind === 'dir') copyDir(src, dest);
    else copyFile(src, dest);
    // source + hash let `harness diff` detect repo changes and local edits.
    const hash = kind === 'dir' ? hashDir(src) : hashFile(src);
    manifest.actions.push({ type: kind === 'dir' ? 'copyDir' : 'copyFile', target: dest, source: src, hash, label });
  }

  return {
    copyDir(src, dest, label) {
      guardedCopy('dir', src, dest, label);
    },

    copyFile(src, dest, label) {
      guardedCopy('file', src, dest, label);
    },

    marker(file, id, body, style, label) {
      log(`  + ${label} ${c.dim('→ managed block in ' + file)}`);
      if (dryRun) return;
      backupOnce(file);
      upsertBlock(file, id, body, style);
      manifest.actions.push({ type: 'marker', file, id, style, hash: sha256(body.trimEnd()), label });
    },

    // Deep-merge keys into a JSON file the host also owns (settings.json,
    // mcp.json, hooks.json). Null values in the patch are skipped; previous
    // values of every changed key are recorded for uninstall.
    jsonMerge(file, patch, label) {
      log(`  + ${label} ${c.dim('→ merge into ' + file)}`);
      if (dryRun) return;
      backupOnce(file);
      const changes = mergeIntoJsonFile(file, patch);
      if (changes.length > 0) {
        manifest.actions.push({ type: 'jsonKeys', file, changes });
      }
    },

    skip(label, reason) {
      log(`  ${c.dim('- ' + label + ' — ' + reason)}`);
    },
  };
}

export function harnessOwnedTag() {
  return 'sprharness';
}

// Remove previously-installed harness entries from a hook array so installs
// are idempotent, then append the current ones.
export function replaceHarnessEntries(existingArray, ourEntries) {
  const kept = (existingArray || []).filter(
    (entry) => !JSON.stringify(entry).includes(harnessOwnedTag())
  );
  return [...kept, ...ourEntries];
}
