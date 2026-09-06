#!/usr/bin/env node
import { setup } from './commands/setup.mjs';
import { install } from './commands/install.mjs';
import { uninstall } from './commands/uninstall.mjs';
import { doctor } from './commands/doctor.mjs';
import { status } from './commands/status.mjs';
import { profile } from './commands/profile.mjs';
import { link } from './commands/link.mjs';
import { c } from './lib/ui.mjs';

const HELP = `
${c.bold('sprHarness')} — portable configuration harness for AI coding agents

  ${c.cyan('CONFIGURE')} (portable — commit the result; no host needs to be installed)
    harness setup                     interactive host selection
    harness setup --hosts claude,codex     non-interactive
    harness setup --all

  ${c.cyan('INSTALL')} (this machine — materialize config into user-level host dirs)
    harness install [host...]         install all configured hosts, or specific ones
    harness install --dry-run         show the plan without writing
    harness uninstall [host...]       undo exactly what install wrote here

  ${c.cyan('INSPECT')}
    harness status                    portable config + what's installed here
    harness doctor                    runtime checks: binaries, versions, sign-in

  ${c.cyan('PER-MACHINE / PER-PROJECT')}
    harness profile [use <name>|clear]   personal overlay (profiles/<name>/)
    harness link [dir]                stamp AGENTS.md + CLAUDE.md shim into a project

  Concepts: configuration (what) / integration (how each host consumes it) /
  installation (making it available here) / runtime (is the host present &
  signed in) / diagnostics (doctor) are separate steps by design.
  Docs: docs/ARCHITECTURE.md, docs/HOSTS.md, docs/WORKFLOWS.md
`;

const commands = { setup, install, uninstall, doctor, status, profile, link };

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(HELP);
    return;
  }
  const fn = commands[cmd];
  if (!fn) {
    console.error(`Unknown command '${cmd}'. Run: harness help`);
    process.exitCode = 1;
    return;
  }
  await fn(args);
}

main().catch((err) => {
  console.error('Error: ' + err.message);
  process.exitCode = 1;
});
