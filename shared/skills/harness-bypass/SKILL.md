---
name: harness-bypass
description: How to run a single prompt WITHOUT the harness's token-thrift routing (the `bare:` / `/bare` prefix) - when to use it, what it does and does not switch off, and how it feeds the benchmark. Consult when a task is small, latency-sensitive, or was measured to do worse with delegation.
---

# Harness bypass (`bare:` mode)

Not every task benefits from delegation. Tiny edits, one-file questions, and
quick shell work often finish faster and cheaper when the main model just
does them. The harness gives you a per-prompt escape hatch.

## How to use it

Prefix the prompt:

```
bare: rename the `foo` helper in utils.js to `parseFoo` and fix its two callers
/bare what does this error mean: <paste>
```

Effects, for **that prompt only**:

- `max-read-size` and `no-bulk-cat` hooks stop blocking large reads.
- The routing instructions are countermanded by an injected note: work
  directly, do not delegate to scout / bulk-reader / code-writer / reviewer.
- The session is tagged `bare` (or `mixed`) in `local/bench/sessions.csv`.

The next prompt without the prefix restores normal routing automatically —
no state to clean up.

## What bypass never switches off

Safety hooks: `block-destructive` (force-push, reset --hard, recursive
deletes) and `protect-secrets` if enabled. Bypass is about token routing,
not guardrails.

## Global bypass (benchmarks, scripts)

Set `SPRHARNESS_BYPASS=1` in the environment of the Claude Code process; all
thrift hooks then pass unconditionally. `harness bench` uses this for its
baseline condition.

## When to reach for it

- The task touches one small file you can name.
- You need a verbatim large slice (config, schema) and grep isn't enough.
- A category measured "weaker with harness" in `harness bench report`.
