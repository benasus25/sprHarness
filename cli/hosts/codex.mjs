import path from 'node:path';
import { exists } from '../lib/fsutil.mjs';
import { tomlTable } from '../lib/toml.mjs';
import { loadLocalEnv, materializeMcpEnv } from '../lib/content.mjs';
import { runVersion } from './detect.mjs';

// ── OpenAI Codex ─────────────────────────────────────────────────────────
// Config surface (researched 2026-09, see docs/HOSTS.md):
//   ~/.codex/config.toml    main config (model, approval, sandbox, MCP)
//   ~/.codex/skills/        skills (SKILL.md folders)
//   ~/.codex/prompts/       custom slash prompts
//   ~/.codex/AGENTS.md      global instructions
//   ~/.codex/auth.json      ChatGPT sign-in credential cache (never touched)
// Codex has no hooks and no subagents — those harness features are skipped
// here by design; see docs/HOSTS.md for the asymmetry table.
//
// Model/approval preferences are written as a [profiles.<name>] table inside
// a marker-delimited managed block appended to config.toml. A managed block
// may only contain TOML *tables*: appending a bare top-level key after any
// existing table would silently become part of that table. Users activate it
// with `codex --profile <name>` or by setting `profile = "<name>"` at the top
// of their config.toml.

export default {
  id: 'codex',
  label: 'Codex',
  binaries: ['codex'],
  supports: { skills: true, agents: false, prompts: true, instructions: true, hooks: false, mcp: true },

  detect() {
    return runVersion(this.binaries);
  },

  authInfo(hd) {
    if (exists(path.join(hd.codexDir, 'auth.json'))) {
      return { status: 'signed-in', detail: 'auth.json present (ChatGPT sign-in)' };
    }
    return { status: 'unknown', detail: 'run `codex` once and sign in with ChatGPT (subscription)' };
  },

  install({ cfg, content, hd, ops }) {
    const inst = cfg.install || {};

    if (inst.skills !== false) {
      for (const skill of content.skills) {
        ops.copyDir(skill.dir, path.join(hd.codexDir, 'skills', skill.name), `skill ${skill.name}`);
      }
    }

    if (inst.prompts !== false) {
      for (const prompt of content.prompts) {
        ops.copyFile(prompt.file, path.join(hd.codexDir, 'prompts', `${prompt.name}.md`), `prompt /${prompt.name}`);
      }
    }

    const instructions = content.instructionsFor('codex');
    if (inst.instructions !== false && instructions) {
      ops.marker(
        path.join(hd.codexDir, 'AGENTS.md'),
        'instructions',
        instructions,
        'html',
        'shared instructions'
      );
    }

    if (inst.profile !== false || inst.mcp !== false) {
      const parts = [];
      const profileName = cfg.profileName || 'sprharness';

      if (inst.profile !== false) {
        const profile = {
          model: cfg.model || null,
          model_reasoning_effort: cfg.modelReasoningEffort || null,
          approval_policy: cfg.approvalPolicy || null,
          sandbox_mode: cfg.sandboxMode || null,
        };
        const hasAny = Object.values(profile).some((v) => v !== null);
        if (hasAny) {
          parts.push(tomlTable(['profiles', profileName], profile));
        } else {
          ops.skip('profile', 'nothing set in config/codex.json (host defaults apply)');
        }
      }

      if (inst.mcp !== false) {
        const localEnv = loadLocalEnv();
        for (const [name, def] of Object.entries(content.mcpServers)) {
          if (def.hosts && !def.hosts.includes('codex')) continue;
          const { env, unresolved } = materializeMcpEnv(def, localEnv);
          if (unresolved.length) ops.skip(`MCP ${name} env`, `unresolved ${unresolved.map((u) => '${' + u + '}').join(', ')} — set with \`harness env set\``);
          const entry = def.url
            ? { url: def.url }
            : { command: def.command, args: def.args || [], ...(Object.keys(env).length ? { env } : {}) };
          parts.push(tomlTable(['mcp_servers', name], entry));
        }
      }

      if (parts.length > 0) {
        ops.marker(
          path.join(hd.codexDir, 'config.toml'),
          'config',
          parts.join('\n\n') +
            `\n\n# Activate with:  codex --profile ${profileName}` +
            `\n# or put  profile = "${profileName}"  at the TOP of this file (above any [table]).`,
          '#',
          `config profile [profiles.${profileName}]`
        );
      }
    }

    if (content.agents.length > 0) {
      ops.skip('agents', 'Codex has no subagent mechanism (see docs/HOSTS.md)');
    }
    if (content.hooks.length > 0) {
      ops.skip('hooks', 'Codex has no hooks mechanism (see docs/HOSTS.md)');
    }
  },
};
