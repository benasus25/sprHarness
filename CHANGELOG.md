# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and versions follow SemVer.

## [0.2.0] — 2026-09-07

### Added
- `bare:` / `/bare` per-prompt bypass: run any prompt without token-thrift routing; safety hooks stay on.
- Benchmark system: `harness bench run|report|sessions|init|list` — A/B suite against a pinned target repo with success verification, plus a passive per-session log (`session-log` hook).
- `harness check` — validates skills, agents, prompts, hooks, MCP definitions, host configs, and the bench suite; CI gate.
- `harness diff` — drift between repo and installed files (changed in repo / modified locally / missing / user-owned).
- `harness env` — machine-local `${VAR}` values for MCP secrets (`local/env.json`).
- `--root <dir>` / `SPRHARNESS_ROOT` — run the CLI against another content repo.
- Worker fleet: `scout`, `bulk-reader`, `git-historian`, `dependency-scout`, `doc-writer`, `pr-writer` (haiku); `code-writer`, `test-writer`, `refactorer`, `reviewer`, `security-auditor` (sonnet); `debugger` (inherit).
- Skills: `token-thrift`, `harness-bypass`, `benchmarking`, `tdd`, `debugging`, `codebase-onboarding`, `safe-refactor`, `context-hygiene`, `security-review`, `pr-description`, `delegate-codex`, `delegate-cursor`, `conventional-commits`.
- Commands: `/bare`, `/review`, `/explain`, `/tests`, `/pr`, `/audit`, `/onboard`, `/standup`, `/handoff`.
- Hooks: `bypass-toggle`, `max-read-size`, `no-bulk-cat`, `session-log`, `block-destructive` (enabled); `protect-secrets` (opt-in). Cursor mappings for bypass and read-size.
- Per-host instructions (`shared/instructions/<host>/`), shared hook library, `{{placeholder}}` args.
- Test suite (`node tests/run.mjs`), GitHub Actions matrix (3 OS × Node 18/20/22), JSON Schemas.

### Changed
- Install records source hashes and skipped collisions in the manifest.
- `removeBlock` restores files byte-for-byte on uninstall.

## [0.1.0] — 2026-09-06

### Added
- Initial configuration-first harness: `setup`, `install`, `uninstall`, `doctor`, `status`, `profile`, `link`; Claude Code / Cursor / Codex adapters; tracked JSON merges; marker-managed blocks; collision guard; profiles.
