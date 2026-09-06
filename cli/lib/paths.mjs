import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from './fsutil.mjs';

// The content root (harness.json, config/, shared/, profiles/) defaults to
// this repo. SPRHARNESS_ROOT (or `harness --root <dir>`) points the same CLI
// at a different content repo — the engine/content split for distribution.
export const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const repoRoot = process.env.SPRHARNESS_ROOT ? path.resolve(process.env.SPRHARNESS_ROOT) : cliRoot;

export const dirs = {
  config: path.join(repoRoot, 'config'),
  shared: path.join(repoRoot, 'shared'),
  profiles: path.join(repoRoot, 'profiles'),
  templates: path.join(cliRoot, 'templates'),
  bench: path.join(repoRoot, 'bench'),
  local: path.join(repoRoot, 'local'),
  manifests: path.join(repoRoot, 'local', 'manifests'),
  backups: path.join(repoRoot, 'local', 'backups'),
};

export const harnessFile = path.join(repoRoot, 'harness.json');
export const machineFile = path.join(dirs.local, 'machine.json');

// SPRHARNESS_HOME_OVERRIDE exists for tests/CI: point the installer at a fake
// home so nothing touches the real user profile.
export function homeDir() {
  return process.env.SPRHARNESS_HOME_OVERRIDE || os.homedir();
}

export function loadMachine() {
  return readJson(machineFile, {});
}

// Host base directories. Precedence: local machine override → host's own
// env variable → conventional default under the home directory.
// None of these require the host to be installed; they are just paths.
export function hostDirs() {
  const machine = loadMachine();
  const home = homeDir();
  const p = machine.paths || {};
  return {
    claudeDir: p.claudeDir || process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'),
    claudeStateFile: p.claudeStateFile || path.join(home, '.claude.json'),
    cursorDir: p.cursorDir || path.join(home, '.cursor'),
    codexDir: p.codexDir || process.env.CODEX_HOME || path.join(home, '.codex'),
  };
}
