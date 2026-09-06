# sprHarness

**A portable harness for AI coding agents — Claude Code, Cursor, and Codex —
that routes work to cheaper models, keeps your main context clean, and
proves it with a benchmark.**

One `install` gives every machine you use the same fleet of model-tiered
workers, enforcement hooks, skills, and slash commands, working on your
existing subscriptions (Claude Pro/Max, Cursor, ChatGPT) — no API keys, no
dependencies, nothing to `npm install`.

```
git clone https://github.com/benasus25/sprHarness.git && cd sprHarness
node cli/harness.mjs setup --all
node cli/harness.mjs install
node cli/harness.mjs doctor
```

Requires Node.js ≥ 16 (18+ recommended). Windows, macOS, Linux.

## What you get

**Workers** (subagents that run in their *own* context window on a cheaper
model — the orchestrator only ever sees their summary):

| Tier | Workers | Used for |
|---|---|---|
| haiku | `scout`, `bulk-reader`, `git-historian`, `dependency-scout`, `doc-writer`, `pr-writer` | locating, reading, history, packages, docs, PR text |
| sonnet | `code-writer`, `test-writer`, `refactorer`, `reviewer`, `security-auditor` | boilerplate, tests, mechanical edits, review, security |
| inherit | `debugger` | hard root-causing (keeps your main model) |

Automatic delegation is driven by each worker's description ("Use
PROACTIVELY when…") plus a short routing policy installed into your
user-level `CLAUDE.md`.

**Enforcement hooks** (the [Spotify "shunt" pattern](https://engineering.atspotify.com/2026/9/portal-by-spotify-cut-my-claude-code-token-usage-by-90),
rebuilt on subscription-native subagents):

| Hook | What it does | Bypassable |
|---|---|---|
| `max-read-size` | blocks untargeted reads of files over 400 lines → "ask `bulk-reader`" | yes (`bare:`) |
| `no-bulk-cat` | blocks `cat`/`type` dumps of large files | yes |
| `bypass-toggle` | implements the `bare:` switch (below) | — |
| `session-log` | appends token stats per session to `local/bench/sessions.csv` | — |
| `block-destructive` | stops force-push to main, `reset --hard`, `clean -x`, `rm -rf /` | **never** |
| `protect-secrets` | blocks reading/editing `.env`-style files (opt-in) | never |

**Skills**: `token-thrift`, `harness-bypass`, `benchmarking`, `tdd`,
`debugging`, `codebase-onboarding`, `safe-refactor`, `context-hygiene`,
`security-review`, `pr-description`, `delegate-codex`, `delegate-cursor`,
`conventional-commits`.

**Slash commands**: `/bare`, `/review`, `/explain`, `/tests`, `/pr`,
`/audit`, `/onboard`, `/standup`, `/handoff`.

## Running a prompt without the harness

Not every task benefits from delegation. Prefix a prompt with `bare:` (or
use `/bare`) and, for that prompt only, the token-thrift hooks stand down
and the model is told to work directly:

```
bare: rename parseFoo to parseBar in utils.js and fix the two callers
```

The next normal prompt restores routing automatically. Safety hooks are
never bypassed. `SPRHARNESS_BYPASS=1` in the environment does the same for
a whole process (the benchmark uses this).

## Benchmarking: does it actually save tokens?

```
harness bench run --n 3          # 8 tasks × {harness, bare} × 3 runs
harness bench report             # markdown: by condition / category / task
harness bench sessions           # trend from your real sessions (passive log)
```

The primary metric is **orchestrator context tokens** — what the expensive
model consumes and what subscription rate limits weigh most. Success rate is
the guard metric: a cheaper failure is a loss. The report ends with a
verdict per category, including where to use `bare:` instead.

The runner drives the Claude Code CLI headlessly (`claude -p`) against a
pinned clone of Express (edit `bench/suite.json` to change tasks or target).
It needs the `claude` CLI on PATH — the desktop app alone is not enough:

```bash
# Windows
irm https://claude.ai/install.ps1 | iex
# macOS / Linux
curl -fsSL https://claude.ai/install.sh | bash
```

`--runner mock` exercises the full pipeline with synthetic numbers (CI uses it).
`--hard-baseline` adds a condition with the harness fully uninstalled.

## Commands

| Command | |
|---|---|
| `setup [--all \| --hosts a,b]` | choose hosts to configure — **no host needs to be installed** |
| `install [host…] [--dry-run] [--force]` | materialize into `~/.claude`, `~/.cursor`, `~/.codex` (idempotent, tracked) |
| `uninstall [host…]` | undo exactly what install wrote here |
| `check [--strict]` | validate all content (pre-commit / CI gate) |
| `diff [--exit-code]` | repo vs installed drift |
| `status` / `doctor` | portable state / runtime readiness (binaries, versions, sign-in) |
| `bench run\|report\|sessions\|list\|init` | measurement |
| `profile use <name>` | activate a committed personal overlay (`profiles/<name>/`) |
| `env set K V` | machine-local secrets for `${VAR}` in MCP definitions |
| `link [dir]` | stamp `AGENTS.md` + `CLAUDE.md` shim into a project |

`--root <dir>` (or `SPRHARNESS_ROOT`) points the CLI at another content repo.

## How it stays safe on your machine

- JSON files the host also owns (`settings.json`, `mcp.json`, `hooks.json`)
  are **merged key-by-key with tracked undo**; your keys are never touched.
- Shared text files (`CLAUDE.md`, `AGENTS.md`, `config.toml`) get one
  **marker-managed block**; everything outside it is yours.
- A skill/agent/command of yours with the same name as a harness one is
  **skipped with a warning** (`--force` to replace).
- Credentials are never read, written, or committed. `local/` (manifests,
  backups, secrets, benchmark data) is gitignored.
- Every hook fails open.

## Repo layout

```
harness.json            which hosts are configured        (portable)
config/<host>.json      per-host preferences              (portable)
shared/                 skills/ agents/ prompts/ hooks/ instructions/ mcp/   (portable)
profiles/<name>/        committed personal overlays       (portable)
bench/suite.json        benchmark tasks                   (portable)
local/                  manifests, backups, env.json, bench results   (never committed)
cli/                    zero-dependency Node CLI + host adapters
tests/                  node tests/run.mjs
```

## Hosts

| | Claude Code | Cursor | Codex |
|---|---|---|---|
| skills | ✅ | ✅ | ✅ |
| workers (subagents) | ✅ | ✅ | ✗ (none in Codex) |
| hooks | ✅ | ✅ (bypass, read-size) | ✗ (none in Codex) |
| instructions | user-level `CLAUDE.md` | per-project via `link` | `~/.codex/AGENTS.md` |
| model prefs | `settings.json` | in-app only | `[profiles.sprharness]` in `config.toml` |
| routing engine | ✅ | partial | ✗ |

Auth is each product's own subscription sign-in (`claude`, the Cursor app,
`codex` → ChatGPT).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Run `node cli/harness.mjs check --strict`
and `node tests/run.mjs` before opening a PR; token-saving claims need a
real `harness bench` report.
