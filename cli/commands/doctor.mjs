import { harnessFile, hostDirs } from '../lib/paths.mjs';
import { readJson } from '../lib/fsutil.mjs';
import { hosts } from '../hosts/index.mjs';
import { loadManifest } from '../lib/manifest.mjs';
import { c, sym, heading, table } from '../lib/ui.mjs';

// Doctor is the ONE runtime-aware command: it compares the saved (portable)
// configuration against what this particular machine can actually run.
// A configured-but-not-installed host is a normal state, not a failure.

export async function doctor() {
  const state = readJson(harnessFile, { hosts: {} });
  const hd = hostDirs();
  const configuredIds = Object.keys(state.hosts || {}).filter((id) => state.hosts[id].configured);

  heading('Harness doctor');

  if (configuredIds.length === 0) {
    console.log(`${sym.warn} No hosts configured yet. Run: harness setup`);
    return;
  }

  console.log(c.bold('Configured hosts:') + '\n');
  table(hosts.map((h) => [
    h.label,
    configuredIds.includes(h.id) ? `${sym.ok} configured` : `${sym.off} not configured`,
  ]));

  console.log('\n' + c.bold('Current machine:') + '\n');
  const detections = {};
  const rows = [];
  for (const h of hosts) {
    const det = h.detect(hd);
    detections[h.id] = det;
    rows.push([
      h.label,
      det.installed ? `${sym.ok} installed` : `${sym.off} not installed`,
      det.installed ? c.dim(det.version || '') : '',
    ]);
  }
  table(rows);

  console.log('\n' + c.bold('Result:') + '\n');
  const resultRows = [];
  for (const h of hosts) {
    if (!configuredIds.includes(h.id)) continue;
    const det = detections[h.id];
    const manifest = loadManifest(h.id);
    const auth = h.authInfo(hd);

    let status;
    let detail = [];
    if (!manifest) {
      status = c.yellow('CONFIGURED — RUN `harness install`');
    } else if (!det.installed) {
      status = c.yellow('CONFIGURED — INSTALLATION REQUIRED');
      detail.push(`install ${h.label} on this machine, then sign in`);
    } else if (auth.status === 'signed-in') {
      status = c.green('READY');
    } else {
      status = c.green('READY') + c.dim(' (sign-in not verified)');
      detail.push(auth.detail);
    }
    resultRows.push([h.label, status, c.dim(detail.join('; '))]);
  }
  table(resultRows);

  console.log('\n' + c.dim('A configured host that is not installed here is informational, not an error.'));
  console.log(c.dim('Auth checks are best-effort file/CLI probes; credentials are never read or stored.'));
}
