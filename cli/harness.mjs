#!/usr/bin/env node
// Entry point. Commands are imported lazily so that `--root <dir>` /
// SPRHARNESS_ROOT can redirect the content root before any module resolves
// its paths — the engine/content split used for distribution.

const argv = process.argv.slice(2);
const rootIdx = argv.indexOf('--root');
if (rootIdx !== -1 && argv[rootIdx + 1]) {
  process.env.SPRHARNESS_ROOT = argv[rootIdx + 1];
  argv.splice(rootIdx, 2);
}

const { c } = await import('./lib/ui.mjs');

const HELP = `
${c.bold('sprHarness')} — portable configuration harness for AI coding agents

  ${c.cyan('CONFIGURE')} (portable — commit the result; no host needs to be installed)
    harness setup                     interactive host selection
    harness setup --hosts claude,codex     non-interactive   |   harness setup --all
    harness check [--strict]          validate skills/agents/hooks/MCP/config before commit or install

  ${c.cyan('INSTALL')} (this machine — materialize config into user-level host dirs)
    harness install [host...] [--dry-run] [--force]
    harness uninstall [host...]       undo exactly what install wrote here
    harness diff [--exit-code]        drift between the repo and what is installed

  ${c.cyan('INSPECT')}
    harness status                    portable config + what's installed here
    harness doctor                    runtime checks: binaries, versions, sign-in

  ${c.cyan('MEASURE')}
    harness bench run|report|sessions|init|list      A/B benchmark + passive session log

  ${c.cyan('PER-MACHINE / PER-PROJECT')}
    harness profile [use <name>|clear]   personal overlay (profiles/<name>/)
    harness env [set K V|unset K]     machine-local secrets for \${VAR} in MCP definitions
    harness link [dir]                stamp AGENTS.md + CLAUDE.md shim into a project

  ${c.cyan('BYPASS')}  prefix any prompt with  bare:  (or /bare) to run it without token-thrift routing

  Global: --root <dir> (or SPRHARNESS_ROOT) uses another content repo with this CLI.
  Docs: README.md, docs/ (local)
`;

const commands = {
  setup: () => import('./commands/setup.mjs').then((m) => m.setup),
  install: () => import('./commands/install.mjs').then((m) => m.install),
  uninstall: () => import('./commands/uninstall.mjs').then((m) => m.uninstall),
  doctor: () => import('./commands/doctor.mjs').then((m) => m.doctor),
  status: () => import('./commands/status.mjs').then((m) => m.status),
  profile: () => import('./commands/profile.mjs').then((m) => m.profile),
  link: () => import('./commands/link.mjs').then((m) => m.link),
  check: () => import('./commands/check.mjs').then((m) => m.check),
  diff: () => import('./commands/diff.mjs').then((m) => m.diff),
  env: () => import('./commands/env.mjs').then((m) => m.env),
  bench: () => import('./commands/bench.mjs').then((m) => m.bench),
};

const [cmd, ...args] = argv;
if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  console.log(HELP);
} else if (cmd === '--version' || cmd === '-v') {
  const { readJson } = await import('./lib/fsutil.mjs');
  const { cliRoot } = await import('./lib/paths.mjs');
  const path = await import('node:path');
  console.log((readJson(path.join(cliRoot, 'package.json'), {}) || {}).version || '?');
} else if (!commands[cmd]) {
  console.error(`Unknown command '${cmd}'. Run: harness help`);
  process.exitCode = 1;
} else {
  try {
    const fn = await commands[cmd]();
    await fn(args);
  } catch (err) {
    console.error('Error: ' + (err && err.stack ? err.stack.split('\n').slice(0, 3).join('\n') : err));
    process.exitCode = 1;
  }
}
