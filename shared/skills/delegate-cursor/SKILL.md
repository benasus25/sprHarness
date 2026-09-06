---
name: delegate-cursor
description: Delegate a task to the Cursor CLI agent non-interactively, using the machine's Cursor subscription sign-in. Use for a second opinion or parallel work when cursor-agent is available.
---

# Delegating to Cursor (cross-host worker)

Cursor's CLI agent runs on the machine's Cursor subscription sign-in.

## Availability check (always first)

```bash
cursor-agent --version
```

If that fails, the Cursor CLI is not installed here — say so and continue
without it. (The Cursor IDE being installed is not enough; the CLI is a
separate install.)

## Non-interactive invocation

```bash
cursor-agent -p "Summarize what src/server does and list its external dependencies"
```

- `-p` (print mode) runs one task and exits; output goes to stdout.
- Prompts must be self-contained — cursor-agent shares no context with you:
  name files by path and state the expected output format.
- Prefer read-only/advisory phrasing; treat any edit it makes as needing
  your review afterwards.

## Good uses

- Second opinion from whatever model the user's Cursor plan runs.
- Parallel read-only analysis of another part of the repo.

## Poor uses

- Anything the local `scout`/`bulk-reader` subagents cover — those are
  cheaper and faster than shelling out cross-host.
