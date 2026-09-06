import path from 'node:path';
import { exists, writeText, isDir } from '../lib/fsutil.mjs';
import { c, sym, heading } from '../lib/ui.mjs';

// Stamps the *project layer* into a coding repo: an AGENTS.md (the
// cross-tool convention Cursor and Codex read natively) plus a CLAUDE.md
// shim that imports it (Claude Code does not read AGENTS.md natively; the
// officially documented bridge is an @AGENTS.md import or a symlink).
// Never overwrites existing files.

const AGENTS_TEMPLATE = `# Project guide for AI coding agents

<!-- Read natively by Cursor and Codex; Claude Code reads it via the
     @AGENTS.md import in CLAUDE.md. Keep this file host-agnostic. -->

## What this project is

(one paragraph: what the codebase does and who uses it)

## Commands

- build: \`...\`
- test: \`...\`
- lint: \`...\`

## Conventions

- (code style, branching, review expectations)
`;

const CLAUDE_SHIM = `@AGENTS.md

<!-- Claude Code shim: project instructions live in AGENTS.md so that
     Cursor and Codex read the same file. Add Claude-specific notes below. -->
`;

export async function link(args) {
  const target = path.resolve(args[0] || process.cwd());
  if (!isDir(target)) {
    console.error(`${sym.err} Not a directory: ${target}`);
    process.exitCode = 1;
    return;
  }

  heading(`Linking project layer into ${target}`);

  const agentsFile = path.join(target, 'AGENTS.md');
  if (exists(agentsFile)) {
    console.log(`${sym.off} AGENTS.md already exists — left untouched`);
  } else {
    writeText(agentsFile, AGENTS_TEMPLATE);
    console.log(`${sym.ok} created AGENTS.md ${c.dim('(edit it with project specifics, then commit)')}`);
  }

  const claudeFile = path.join(target, 'CLAUDE.md');
  if (exists(claudeFile)) {
    console.log(`${sym.off} CLAUDE.md already exists — left untouched`);
    console.log(c.dim('  tip: add a line containing "@AGENTS.md" to it so Claude Code reads AGENTS.md too'));
  } else {
    writeText(claudeFile, CLAUDE_SHIM);
    console.log(`${sym.ok} created CLAUDE.md ${c.dim('(imports AGENTS.md for Claude Code)')}`);
  }

  console.log(c.dim('\nCommit both files in that project. User-level config stays with `harness install`.'));
}
