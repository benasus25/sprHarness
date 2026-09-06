---
name: codebase-onboarding
description: Fastest cheap way to build a mental map of an unfamiliar repository using the scout and bulk-reader workers, without flooding the main context. Use at the start of work in a new or large codebase, or when asked to "explain this project".
---

# Onboarding to a codebase

Goal: a one-screen map, built by workers, before any reasoning happens here.

1. `scout`: "Map this repo: top-level layout, entry points, build/test
   commands, where config lives, largest source directories." (≤25 lines)
2. `dependency-scout` if the stack is unfamiliar: "What are the 5 most
   important dependencies and what do we use them for?"
3. `bulk-reader` on the 2–3 files the scout flagged as entry points: one
   specific question each ("what does the request lifecycle look like?").
4. `git-historian`: "What changed most in the last 30 commits and why?" —
   recent churn is where the live problems are.

Write the resulting map into the conversation in ≤15 bullets. Only now start
the actual task. If the repo has no AGENTS.md / CLAUDE.md, suggest
`harness link` so the map persists for next time.
