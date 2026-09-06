import { harnessFile } from '../lib/paths.mjs';
import { readJson } from '../lib/fsutil.mjs';
import { hostDirs } from '../lib/paths.mjs';
import { hosts, getHost } from '../hosts/index.mjs';
import { loadContent, loadHostConfig, activeProfile } from '../lib/content.mjs';
import { newManifest, saveManifest, loadManifest, undoActions } from '../lib/manifest.mjs';
import { makeOps } from '../lib/ops.mjs';
import { c, sym, heading } from '../lib/ui.mjs';

// Install = materialize the portable configuration into this machine's
// user-level host locations. It writes plain files, so it works whether or
// not the host application is installed — a missing host is informational.

export async function install(args) {
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const requested = args.filter((a) => !a.startsWith('--'));

  const state = readJson(harnessFile, null);
  if (!state || Object.keys(state.hosts || {}).length === 0) {
    console.error(`${sym.err} No hosts configured yet. Run: harness setup`);
    process.exitCode = 1;
    return;
  }

  let targets = Object.keys(state.hosts).filter((id) => state.hosts[id].configured);
  if (requested.length > 0) {
    for (const id of requested) {
      if (!getHost(id)) {
        console.error(`${sym.err} Unknown host '${id}'. Supported: ${hosts.map((h) => h.id).join(', ')}`);
        process.exitCode = 1;
        return;
      }
      if (!targets.includes(id)) {
        console.error(`${sym.err} Host '${id}' is not configured. Run: harness setup --hosts ${id}`);
        process.exitCode = 1;
        return;
      }
    }
    targets = requested;
  }

  const content = loadContent();
  const hd = hostDirs();
  const profile = activeProfile();

  heading(dryRun ? 'Install plan (dry run — nothing will be written)' : 'Installing harness configuration');
  if (profile) console.log(c.dim(`  active profile overlay: profiles/${profile}/\n`));

  for (const id of targets) {
    const host = getHost(id);
    const cfg = loadHostConfig(id) || {};
    console.log(c.bold(`${host.label}`));

    // Idempotent re-install: undo the previous install first so removed
    // skills/agents don't linger. (Dry runs never touch the manifest.)
    const previous = loadManifest(id);
    // Only files the harness actually wrote count as owned — a 'skipped'
    // record points at the USER's file and must never license an overwrite.
    const ownedTargets = new Set(
      ((previous && previous.actions) || [])
        .filter((a) => a.target && (a.type === 'copyDir' || a.type === 'copyFile'))
        .map((a) => a.target)
    );
    if (previous && !dryRun) {
      undoActions(previous.actions);
    }

    const manifest = newManifest();
    const ops = makeOps({ manifest, dryRun, force, ownedTargets, log: (line) => console.log(line) });
    try {
      host.install({ cfg, content, hd, ops, dryRun });
      if (!dryRun) saveManifest(id, manifest);
    } catch (err) {
      console.error(`${sym.err} ${host.label} install failed: ${err.message}`);
      if (!dryRun) saveManifest(id, manifest); // keep record of partial work for uninstall
      process.exitCode = 1;
    }

    const det = host.detect(hd);
    const verb = dryRun ? 'would be installed' : 'installed';
    if (det.installed) {
      console.log(`${sym.ok} ${host.label} integration ${verb} ${c.dim('(' + det.version + ')')}`);
    } else {
      console.log(`${sym.ok} ${host.label} integration ${verb}`);
      console.log(c.dim(`  ${host.label} itself is not present on this machine yet — the configuration\n  will be picked up when you install and sign in to it.`));
    }
    console.log('');
  }

  if (!dryRun) {
    console.log(c.dim('Run `harness doctor` to see readiness per host.'));
  }
}
