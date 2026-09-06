---
name: context-hygiene
description: Keeping the main context small and useful over a long session - when to compact, when to start a fresh session with a handoff, what never belongs in the orchestrator's context. Consult when a session has grown long, responses degrade, or before a large new task.
---

# Context hygiene

The orchestrator's context is the scarcest, most expensive resource in the
system. Everything that isn't reasoning should live somewhere else.

**Never in the main context:** whole large files (ask `bulk-reader`),
directory tree dumps (ask `scout`), long test output (run the narrow
command, or have `test-writer` summarize), git history (ask
`git-historian`), generated boilerplate (have `code-writer` write it).

**Compaction:** when the conversation is long but the task continues, use
`/compact` with a focus hint ("keep the plan and the list of changed
files"). Compaction is lossy — do it at a natural checkpoint, not
mid-investigation.

**Fresh session:** when switching to an unrelated task, or after two
compactions, run `/handoff`, start a new session, paste the handoff. A
fresh context with a good handoff beats a bloated one every time.

**Signals you are over budget:** re-reading files you already saw, the
model forgetting earlier decisions, slow responses. Act on the first one.
