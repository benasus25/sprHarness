---
name: benchmarking
description: How to measure whether the harness actually saves tokens - running `harness bench` A/B suites, reading the passive session log, and interpreting orchestrator-vs-worker token splits honestly. Consult when asked about harness effectiveness, token usage, or before changing routing rules.
---

# Benchmarking the harness

The Spotify claim is about **orchestrator-model tokens**, not total tokens.
Delegation often raises total tokens (a worker reads the file too) while
collapsing what the expensive model consumes. Measure the right thing.

## Two data sources

1. **Passive log** — every Claude Code session appends a row to
   `local/bench/sessions.csv` (via the `session-log` hook): orchestrator vs
   worker tokens, per-model totals, worker invocations, and whether `bare:`
   was used. Summarize with:

   ```
   harness bench sessions
   ```

2. **Controlled A/B suite** — fixed tasks, fixed target repo, N runs per
   condition, success verification:

   ```
   harness bench run --n 3            # conditions: harness + bare
   harness bench report                # latest run → markdown table
   ```

   Conditions: `harness` (normal), `bare` (SPRHARNESS_BYPASS=1 + bare: prefix,
   same install), and with `--hard-baseline`, `uninstalled` (harness fully
   removed for the run, then reinstalled).

## Reading the report

- Primary metric: **orchestrator input tokens** (input + cache-create +
  cache-read on non-sidechain messages). That is what rate limits weigh most.
- Guard metric: **success rate** must not drop. A cheaper failure is a loss.
- Expect: big wins on read-heavy tasks, modest on generation, slightly
  negative on tiny edits. Uniform 90% everywhere means the suite is wrong.
- Use medians; N=1 is noise. Paired per-task deltas beat global averages.

## Acting on results

Categories that lose with the harness are exactly what `bare:` is for
(see the harness-bypass skill). Tune `SPRHARNESS_MAX_READ_LINES` or worker
descriptions in `shared/agents/`, re-run, compare.
