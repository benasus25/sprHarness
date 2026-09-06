import path from 'node:path';
import { readJson } from '../lib/fsutil.mjs';
import { replaceHarnessEntries } from '../lib/ops.mjs';
import { repoRoot, dirs } from '../lib/paths.mjs';
import { loadLocalEnv, materializeMcpEnv, hookCommandArgs } from '../lib/content.mjs';
import { runVersion, runCommand } from './detect.mjs';

// ── Cursor ───────────────────────────────────────────────────────────────
// Config surface (researched 2026-09, see docs/HOSTS.md):
//   ~/.cursor/skills/       skills (SKILL.md folders; Cursor 2.4+). Cursor
//                           also reads ~/.claude/skills and ~/.codex/skills.
//   ~/.cursor/agents/       subagents (same markdown+frontmatter family as
//                           Claude's; .cursor/ wins on name conflicts)
//   ~/.cursor/hooks.json    user-level hooks (version 1 schema)
//   ~/.cursor/mcp.json      user-level MCP servers
//   ~/.cursor/commands/     user-level slash commands
// Model selection is primarily an in-app setting; `defaultModel` in
// config/cursor.json is used for subagent frontmatter defaults only.
// Project instructions: Cursor reads AGENTS.md / CLAUDE.md / .cursor/rules
// in each repo — there is no user-level instructions *file*; user rules are
// set in the app. Use `harness link <project>` for the project layer.

export default {
  id: 'cursor',
  label: 'Cursor',
  binaries: ['cursor-agent', 'cursor'],
  supports: { skills: true, agents: true, prompts: true, instructions: false, hooks: true, mcp: true },

  detect() {
    return runVersion(this.binaries);
  },

  authInfo() {
    const probe = runCommand('cursor-agent status', 8000);
    if (probe.status === 0 && /logged in/i.test(probe.stdout)) {
      return { status: 'signed-in', detail: 'cursor-agent reports a session' };
    }
    return { status: 'unknown', detail: 'Cursor auth is managed in the app (subscription sign-in)' };
  },

  install({ cfg, content, hd, ops }) {
    const inst = cfg.install || {};

    if (inst.skills !== false) {
      for (const skill of content.skills) {
        ops.copyDir(skill.dir, path.join(hd.cursorDir, 'skills', skill.name), `skill ${skill.name}`);
      }
    }

    if (inst.agents !== false) {
      for (const agent of content.agents) {
        ops.copyFile(agent.file, path.join(hd.cursorDir, 'agents', `${agent.name}.md`), `agent ${agent.name}`);
      }
    }

    if (inst.commands !== false) {
      for (const prompt of content.prompts) {
        ops.copyFile(prompt.file, path.join(hd.cursorDir, 'commands', `${prompt.name}.md`), `command /${prompt.name}`);
      }
    }

    if (inst.hooks !== false) {
      const wired = {};
      const vars = { repoRoot, localDir: dirs.local, hostDir: hd.cursorDir };
      const applicable = content.hooks.filter((h) => h.cursor);
      if (applicable.length > 0) {
        for (const lib of content.hookShared) {
          ops.copyFile(path.join(lib.root, lib.file), path.join(hd.cursorDir, 'hooks', 'sprharness', path.basename(lib.file)), `hook lib ${path.basename(lib.file)}`);
        }
      }
      for (const hook of applicable) {
        const spec = hook.cursor;
        const src = path.join(hook.root, spec.script);
        const relDest = path.join('hooks', 'sprharness', path.basename(spec.script));
        ops.copyFile(src, path.join(hd.cursorDir, relDest), `hook ${hook.id} (${spec.event})`);
        // User-level hook commands resolve relative to ~/.cursor/
        const args = hookCommandArgs(spec, vars).map((a) => ` "${a}"`).join('');
        const entry = { command: `node ${relDest.split(path.sep).join('/')}${args}` };
        (wired[spec.event] = wired[spec.event] || []).push(entry);
      }
      if (Object.keys(wired).length > 0) {
        const hooksFile = path.join(hd.cursorDir, 'hooks.json');
        const existing = readJson(hooksFile, {}) || {};
        const hooksPatch = {};
        for (const [event, entries] of Object.entries(wired)) {
          hooksPatch[event] = replaceHarnessEntries((existing.hooks || {})[event], entries);
        }
        ops.jsonMerge(hooksFile, { version: 1, hooks: hooksPatch }, 'hook wiring');
      } else {
        ops.skip('hooks', 'no enabled hooks with a Cursor mapping');
      }
    }

    if (inst.mcp !== false) {
      const servers = {};
      const localEnv = loadLocalEnv();
      for (const [name, def] of Object.entries(content.mcpServers)) {
        if (def.hosts && !def.hosts.includes('cursor')) continue;
        const { env, unresolved } = materializeMcpEnv(def, localEnv);
        if (unresolved.length) ops.skip(`MCP ${name} env`, `unresolved ${unresolved.map((u) => '${' + u + '}').join(', ')} — set with \`harness env set\``);
        servers[name] = def.url
          ? { url: def.url }
          : { command: def.command, args: def.args || [], env };
      }
      if (Object.keys(servers).length > 0) {
        ops.jsonMerge(path.join(hd.cursorDir, 'mcp.json'), { mcpServers: servers }, 'MCP servers');
      } else {
        ops.skip('MCP servers', 'none defined in shared/mcp/servers.json');
      }
    }

    if (content.instructions) {
      ops.skip(
        'shared instructions',
        'Cursor has no user-level instructions file; use `harness link <project>` to stamp AGENTS.md per repo'
      );
    }
  },
};
