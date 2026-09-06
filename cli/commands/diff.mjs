import { harnessFile, hostDirs } from '../lib/paths.mjs';
import { readJson, exists, hashFile, hashDir, sha256 } from '../lib/fsutil.mjs';
import { hosts } from '../hosts/index.mjs';
import { loadManifest } from '../lib/manifest.mjs';
import { loadContent } from '../lib/content.mjs';
import { c, sym, heading } from '../lib/ui.mjs';

// Drift report: what the repo now says vs. what this machine has installed.
// Three drift kinds per item: changed in repo (re-install to apply), modified
// locally (someone edited the installed copy — re-install would overwrite),
// missing on disk. Plus content in the repo that was never installed.

export async function diff(args) {
  const exitCode = args.includes('--exit-code');
  const state = readJson(harnessFile, { hosts: {} });
  const content = loadContent();
  hostDirs(); // validates machine.json parses
  let drift = 0;

  heading('Harness diff (repo vs. installed)');

  for (const host of hosts) {
    if (!(state.hosts || {})[host.id] || !state.hosts[host.id].configured) continue;
    const manifest = loadManifest(host.id);
    console.log(c.bold(host.label));
    if (!manifest) { console.log(`  ${sym.off} not installed on this machine\n`); drift++; continue; }

    const installedSources = new Set();
    let lines = 0;
    let skipped = 0;
    for (const a of manifest.actions) {
      if (a.type === 'skipped') {
        installedSources.add(a.source);
        skipped++;
        console.log(`  ${sym.off} ${a.label}: ${c.dim('not installed — your own copy exists at ' + a.target + ' (harness install --force to replace)')}`);
      } else if (a.type === 'copyFile' || a.type === 'copyDir') {
        installedSources.add(a.source);
        const isDirAction = a.type === 'copyDir';
        const srcHash = a.source ? (isDirAction ? hashDir(a.source) : hashFile(a.source)) : null;
        const dstHash = isDirAction ? hashDir(a.target) : hashFile(a.target);
        const label = a.label || a.target;
        if (a.source && !exists(a.source)) { console.log(`  ${sym.warn} ${label}: ${c.yellow('removed from repo')} ${c.dim('(re-install removes it here)')}`); lines++; }
        else if (dstHash === null) { console.log(`  ${sym.err} ${label}: ${c.red('missing on disk')}`); lines++; }
        else if (a.hash && srcHash !== a.hash && dstHash !== a.hash) { console.log(`  ${sym.err} ${label}: ${c.red('changed in repo AND modified locally')} ${c.dim('(conflict — re-install overwrites the local edit)')}`); lines++; }
        else if (a.hash && srcHash !== a.hash) { console.log(`  ${sym.warn} ${label}: ${c.yellow('changed in repo')} ${c.dim('→ harness install')}`); lines++; }
        else if (a.hash && dstHash !== a.hash) { console.log(`  ${sym.warn} ${label}: ${c.yellow('modified locally')} ${c.dim('(copy the edit back into the repo, or re-install to reset)')}`); lines++; }
      } else if (a.type === 'marker' && a.hash) {
        const now = sha256(content.instructionsFor(host.id).trimEnd());
        if (now !== a.hash) { console.log(`  ${sym.warn} ${a.label || a.id}: ${c.yellow('instructions changed in repo')} ${c.dim('→ harness install')}`); lines++; }
      }
    }
    // Content present in the repo but never installed for this host — only
    // for content kinds the host actually supports (Codex has no agents…).
    const sup = host.supports || {};
    const candidates = [
      ...(sup.skills ? content.skills.map((s) => ({ src: s.dir, label: `skill ${s.name}` })) : []),
      ...(sup.agents ? content.agents.map((a) => ({ src: a.file, label: `agent ${a.name}` })) : []),
      ...(sup.prompts ? content.prompts.map((p) => ({ src: p.file, label: `command /${p.name}` })) : []),
    ];
    for (const cand of candidates) {
      if (!installedSources.has(cand.src)) { console.log(`  ${sym.off} ${cand.label}: ${c.dim('in repo, not installed here')}`); lines++; }
    }
    if (lines === 0) console.log(`  ${sym.ok} in sync${skipped ? c.dim(` (${skipped} user-owned item${skipped === 1 ? '' : 's'} left alone)`) : ''}`);
    drift += lines;
    console.log('');
  }

  if (drift === 0) console.log(c.dim('Everything installed matches the repo.'));
  else {
    console.log(c.dim(`${drift} item(s) differ. \`harness install\` applies the repo state (local edits are backed up to local/backups/ first).`));
    if (exitCode) process.exitCode = 1;
  }
}
