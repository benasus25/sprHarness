import path from 'node:path';
import { readJson } from '../lib/fsutil.mjs';
import { replaceHarnessEntries } from '../lib/ops.mjs';
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
      for (const hook of content.hooks) {
        const spec = hook.cursor;
        if (!spec) continue;
        const src = path.join(hook.root, spec.script);
        const relDest = path.join('hooks', 'sprharness', path.basename(spec.script));
        ops.copyFile(src, path.join(hd.cursorDir, relDest), `hook script ${hook.id}`);
        // User-level hook commands resolve relative to ~/.cursor/
        const entry = { command: `node ${relDest.split(path.sep).join('/')}` };
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
      for (const [name, def] of Object.entries(content.mcpServers)) {
        if (def.hosts && !def.hosts.includes('cursor')) continue;
        servers[name] = def.url
          ? { url: def.url }
          : { command: def.command, args: def.args || [], env: def.env || {} };
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
