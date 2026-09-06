# sprHarness

A portable, host-agnostic configuration harness for AI coding agents:
**Claude Code**, **Cursor**, and **Codex** — designed for subscription-based
usage (Claude Pro/Max, Cursor plans, ChatGPT plans), not API credits.

The core principle: **configuration is independent of installation.** You can
configure every host today on a laptop that has none of them installed, commit
the result, and any machine that later clones this repo — yours or a
colleague's — materializes the same setup with one command.

## Quick start

```
git clone <this-repo>
cd sprHarness
node cli/harness.mjs setup        # or: .\harness setup   /  ./harness setup
node cli/harness.mjs install
node cli/harness.mjs doctor
```

Requires only Node.js ≥ 16 — no npm install, no dependencies.

## Commands

| Command | What it does |
|---|---|
| `harness setup` | Choose hosts to configure (interactive, or `--hosts claude,cursor,codex`, or `--all`). Saves portable config. **Never requires the host to be installed.** |
| `harness install [host…]` | Materializes the portable config into this machine's user-level host locations (`~/.claude`, `~/.cursor`, `~/.codex`). `--dry-run` shows the plan. |
| `harness uninstall [host…]` | Undoes exactly what install wrote here (tracked in a machine-local manifest). |
| `harness status` | Portable config summary + what's installed on this machine. |
| `harness doctor` | Runtime diagnostics: binaries, versions, sign-in state vs. saved config. |
| `harness profile use <name>` | Activate a committed personal overlay from `profiles/<name>/` on this machine. |
| `harness link [dir]` | Stamp `AGENTS.md` + a `CLAUDE.md` shim into a coding project (the project-level layer). |

## What travels through git, what stays local

**Committed (portable):** `harness.json` (which hosts are configured),
`config/<host>.json` (per-host preferences: models, reasoning effort, install
toggles), everything under `shared/` (skills, agents/workers, prompts,
instructions, hook definitions + scripts, MCP server definitions), and
`profiles/<name>/` personal overlays.

**Never committed (machine-local, gitignored `local/`):** install manifests,
backups, the active profile choice, machine path overrides.

**Never touched at all:** credentials. Each machine signs in through each
host's own supported flow (`claude` login, Cursor app sign-in, `codex`
ChatGPT sign-in). Auth state stays wherever the host puts it.

## What one `harness install` sets up

A working token-thrift worker system (the
[Spotify "shunt" pattern](https://engineering.atspotify.com/2026/9/portal-by-spotify-cut-my-claude-code-token-usage-by-90),
adapted to subscription usage — see docs/ARCHITECTURE.md):

- **Workers** with model tiers: `scout` + `bulk-reader` on **haiku**,
  `code-writer` + `reviewer` on **sonnet** — the orchestrating session stays
  on your default model and delegates I/O-heavy work automatically.
- **Enforcement hooks** (Claude Code): untargeted reads of >400-line files
  and `cat`-style dumps are blocked and redirected to `bulk-reader`
  (threshold: `SPRHARNESS_MAX_READ_LINES`; disable in `shared/hooks/hooks.json`).
- **Skills**: `token-thrift` (the routing rules), `delegate-codex` /
  `delegate-cursor` (cross-host second opinions via `codex exec` /
  `cursor-agent -p` on each machine's own subscription sign-in),
  `conventional-commits`.

Your pre-existing config is safe: JSON files (`mcp.json`, `settings.json`,
`hooks.json`) are merged key-by-key with tracked undo, shared text files get
a marker-managed block, and a skill/agent/prompt of yours with the same name
as a harness one is **skipped with a warning**, never overwritten
(`--force` to override).

## Adding content

- **Skill**: `shared/skills/<name>/SKILL.md` (works in all three hosts).
- **Worker/subagent**: `shared/agents/<name>.md` (Claude Code + Cursor; Codex has no subagents).
- **Slash prompt**: `shared/prompts/<name>.md` (all three hosts).
- **Instructions**: `shared/instructions/*.md` (Claude + Codex user-level; Cursor per-project via `harness link`).
- **Hook**: define in `shared/hooks/hooks.json`, script in `shared/hooks/scripts/` (Claude + Cursor; ships disabled — enable deliberately).
- **MCP server**: `shared/mcp/servers.json` (all three hosts).

Then commit, and every machine picks it up with `git pull && harness install`.

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — the five separated concerns and how the repo maps to them
- [docs/HOSTS.md](docs/HOSTS.md) — researched per-host capabilities and the asymmetries the harness respects
- [docs/WORKFLOWS.md](docs/WORKFLOWS.md) — multi-machine and team workflows
