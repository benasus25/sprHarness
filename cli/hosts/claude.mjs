import path from 'node:path';
import { readJson, readText, exists } from '../lib/fsutil.mjs';
import { replaceHarnessEntries } from '../lib/ops.mjs';
import { runVersion } from './detect.mjs';

// ── Claude Code ──────────────────────────────────────────────────────────
// Config surface (researched 2026-09, see docs/HOSTS.md):
//   ~/.claude/settings.json   user settings (model, env, hooks, permissions)
//   ~/.claude/skills/         Agent Skills (SKILL.md folders)
//   ~/.claude/agents/         subagents (markdown + YAML frontmatter)
//   ~/.claude/commands/       user slash commands
//   ~/.claude/CLAUDE.md       user-level memory/instructions
//   ~/.claude.json            state file; user-scoped MCP servers live here
// Auth: `claude` login with a Claude Pro/Max subscription (OAuth); nothing
// for the harness to manage — credentials never travel through this repo.

export default {
  id: 'claude',
  label: 'Claude Code',
  binaries: ['claude'],

  detect(hd) {
    const probe = runVersion(this.binaries);
    if (probe.installed || !hd) return probe;
    // The desktop app and IDE extensions run Claude Code without putting
    // `claude` on PATH. Its state file is solid evidence it runs here.
    if (exists(hd.claudeStateFile)) {
      return { installed: true, binary: 'claude', version: 'desktop/IDE app (CLI not on PATH)' };
    }
    return probe;
  },

  authInfo(hd) {
    // Best-effort heuristics only; we never read credential contents.
    if (exists(path.join(hd.claudeDir, '.credentials.json'))) {
      return { status: 'signed-in', detail: 'credentials file present' };
    }
    const state = readText(hd.claudeStateFile, '');
    if (state.includes('oauthAccount')) {
      return { status: 'signed-in', detail: 'OAuth account in ~/.claude.json' };
    }
    return { status: 'unknown', detail: 'run `claude` once to sign in with your subscription' };
  },

  install({ cfg, content, hd, ops }) {
    const inst = cfg.install || {};

    if (inst.skills !== false) {
      for (const skill of content.skills) {
        ops.copyDir(skill.dir, path.join(hd.claudeDir, 'skills', skill.name), `skill ${skill.name}`);
      }
    }

    if (inst.agents !== false) {
      for (const agent of content.agents) {
        ops.copyFile(agent.file, path.join(hd.claudeDir, 'agents', `${agent.name}.md`), `agent ${agent.name}`);
      }
    }

    if (inst.prompts !== false) {
      for (const prompt of content.prompts) {
        ops.copyFile(prompt.file, path.join(hd.claudeDir, 'commands', `${prompt.name}.md`), `command /${prompt.name}`);
      }
    }

    const instructions = content.instructionsFor('claude');
    if (inst.instructions !== false && instructions) {
      ops.marker(
        path.join(hd.claudeDir, 'CLAUDE.md'),
        'instructions',
        instructions,
        'html',
        'shared instructions'
      );
    }

    // settings.json: model preference, env, plus any raw settings keys.
    if (inst.userSettings !== false) {
      const patch = {};
      if (cfg.model) patch.model = cfg.model;
      if (cfg.env && Object.keys(cfg.env).length) patch.env = cfg.env;
      for (const [k, v] of Object.entries(cfg.settings || {})) {
        if (!k.startsWith('$')) patch[k] = v;
      }
      if (Object.keys(patch).length > 0) {
        ops.jsonMerge(path.join(hd.claudeDir, 'settings.json'), patch, 'model & settings');
      } else {
        ops.skip('model & settings', 'nothing set in config/claude.json (host defaults apply)');
      }
    }

    // Hooks: copy scripts, then wire them into settings.json's hooks map.
    if (inst.hooks !== false) {
      const wired = {};
      for (const hook of content.hooks) {
        const spec = hook.claude;
        if (!spec) continue;
        const src = path.join(hook.root, spec.script);
        const dest = path.join(hd.claudeDir, 'hooks', 'sprharness', path.basename(spec.script));
        ops.copyFile(src, dest, `hook script ${hook.id}`);
        const entry = {
          ...(spec.matcher ? { matcher: spec.matcher } : {}),
          hooks: [{ type: 'command', command: `node "${dest}"` }],
        };
        (wired[spec.event] = wired[spec.event] || []).push(entry);
      }
      if (Object.keys(wired).length > 0) {
        const settingsFile = path.join(hd.claudeDir, 'settings.json');
        const existing = readJson(settingsFile, {}) || {};
        const hooksPatch = {};
        for (const [event, entries] of Object.entries(wired)) {
          hooksPatch[event] = replaceHarnessEntries((existing.hooks || {})[event], entries);
        }
        ops.jsonMerge(settingsFile, { hooks: hooksPatch }, 'hook wiring');
      } else {
        ops.skip('hooks', 'no enabled hooks with a Claude mapping');
      }
    }

    // User-scoped MCP servers live in ~/.claude.json (also readable before
    // Claude Code is first run — it merges its own state in later).
    if (inst.mcp !== false) {
      const servers = {};
      for (const [name, def] of Object.entries(content.mcpServers)) {
        if (def.hosts && !def.hosts.includes('claude')) continue;
        servers[name] = def.url
          ? { type: def.transport === 'sse' ? 'sse' : 'http', url: def.url }
          : { type: 'stdio', command: def.command, args: def.args || [], env: def.env || {} };
      }
      if (Object.keys(servers).length > 0) {
        ops.jsonMerge(hd.claudeStateFile, { mcpServers: servers }, 'MCP servers (user scope)');
      } else {
        ops.skip('MCP servers', 'none defined in shared/mcp/servers.json');
      }
    }
  },
};
