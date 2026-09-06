# Contributing

Thanks for helping make AI coding agents cheaper and more predictable for
everyone. The bar for content is *measured usefulness*; the bar for engine
code is *zero dependencies and a passing matrix*.

## Ground rules

- **Zero runtime dependencies.** The CLI and every hook script run on plain
  Node ≥ 16 with nothing to install. PRs that add a dependency will be asked
  to remove it.
- **Configuration never requires a host to be installed.** Detection is
  informational (`doctor`) and never a prerequisite.
- **Never overwrite user content.** Merges are tracked and revertible;
  same-named user files are skipped unless `--force`.
- **Hooks fail open.** A hook bug must never brick a session.

## Adding content

| What | Where | Checked by |
|---|---|---|
| Skill | `shared/skills/<name>/SKILL.md` — `name` equals the folder, `description` says *when* to use it | `harness check` |
| Worker (subagent) | `shared/agents/<name>.md` — description should say "Use PROACTIVELY when…"; pin `model:` to the cheapest tier that does the job | `harness check` |
| Slash command | `shared/prompts/<name>.md` (`$ARGUMENTS` available) | `harness check` |
| Hook | entry in `shared/hooks/hooks.json` + Node script in `shared/hooks/scripts/`; set `category` (thrift hooks honor `bare:`) | `harness check`, `tests/hooks.test.mjs` |
| MCP server | `shared/mcp/servers.json`; secrets as `${VAR}` | `harness check` |

Before opening a PR:

```
node cli/harness.mjs check --strict
node tests/run.mjs
```

For worker/hook changes that claim a token saving, include a
`harness bench run` report (n ≥ 3) in the PR description — the mock runner
does not count.

## Adding a host

1. `cli/hosts/<id>.mjs` exporting `{ id, label, binaries, detect, authInfo, install }`.
2. Register in `cli/hosts/index.mjs`; add `templates/hosts/<id>.json`.
3. Document the host's real mechanisms and asymmetries in `docs/HOSTS.md`
   with sources — do not assume it mirrors another host.
4. Add an install/uninstall round-trip case to `tests/cli.test.mjs`.

## Commit style

Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:` …). One logical
change per commit; refactors separate from behavior changes.
