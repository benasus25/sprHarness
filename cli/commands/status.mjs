import { harnessFile } from '../lib/paths.mjs';
import { readJson } from '../lib/fsutil.mjs';
import { hosts } from '../hosts/index.mjs';
import { loadManifest } from '../lib/manifest.mjs';
import { loadContent, activeProfile } from '../lib/content.mjs';
import { c, sym, heading, table } from '../lib/ui.mjs';

// Status reads only the repo and local manifests — no machine probing.
// (That's doctor's job.)

export async function status() {
  const state = readJson(harnessFile, { hosts: {} });
  const content = loadContent();
  const profile = activeProfile();

  heading('Harness status');
  console.log(c.bold('Portable configuration') + c.dim(' (committed, travels through git)') + '\n');
  table([
    ['skills', String(content.skills.length)],
    ['agents (workers)', String(content.agents.length)],
    ['prompts/commands', String(content.prompts.length)],
    ['hooks (enabled/total)', `${content.hooks.length}/${content.hooksAll.length}`],
    ['MCP servers', String(Object.keys(content.mcpServers).length)],
    ['profile overlay', profile ? `profiles/${profile}/` : c.dim('none (shared only)')],
  ]);

  console.log('\n' + c.bold('Hosts') + '\n');
  const rows = [];
  for (const h of hosts) {
    const cfg = (state.hosts || {})[h.id];
    const manifest = loadManifest(h.id);
    rows.push([
      h.label,
      cfg && cfg.configured ? `${sym.ok} configured` : `${sym.off} not configured`,
      manifest ? `${sym.ok} installed here ${c.dim(manifest.installedAt.slice(0, 10))}` : c.dim('not installed on this machine'),
    ]);
  }
  table(rows);
  console.log('\n' + c.dim('`harness doctor` adds runtime checks (binaries, versions, sign-in).'));
}
