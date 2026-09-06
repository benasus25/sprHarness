---
name: delegate-codex
description: Delegate a task or get a second opinion from OpenAI Codex CLI non-interactively, using the machine's ChatGPT subscription sign-in. Use for cross-checking a design/diagnosis with a different model family, or parallel mechanical work, when the codex CLI is available.
---

# Delegating to Codex (cross-host worker)

Codex runs on the machine's ChatGPT subscription sign-in — no API keys.

## Availability check (always first)

```bash
codex --version
```

If that fails, Codex is not installed on this machine — say so and continue
without it (`harness doctor` shows the state). Do not try to install it.

## Non-interactive invocation

```bash
codex exec --profile sprharness "Review the approach in FILE and list risks as bullets"
```

- `codex exec` runs one task and exits; output goes to stdout.
- `--profile sprharness` applies the harness-managed model/approval profile
  (skip the flag if the profile isn't configured).
- Add `--sandbox read-only` for advisory/review tasks so it cannot edit.
- Keep the prompt self-contained: Codex shares no context with you — name
  files by path, paste the minimal relevant snippet, say exactly what form
  the answer should take.

## Good uses

- Second opinion on a diagnosis or design from a different model family.
- Parallel mechanical task in another directory while you keep working.

## Poor uses

- Anything requiring this conversation's context (it has none).
- Tasks the local `bulk-reader`/`code-writer` subagents already cover more
  cheaply.
