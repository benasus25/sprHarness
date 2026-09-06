---
name: debugging
description: Systematic protocol for non-obvious bugs - reproduce, hypothesize, test each hypothesis with targeted evidence, fix the cause not the symptom - and when to hand the whole investigation to the debugger worker. Use when a first look didn't reveal the cause.
---

# Debugging protocol

**Reproduce first.** No reproduction, no fix. Find the narrowest command
that shows the failure and record it.

**Then decide who investigates:**

- Cause probably in one place you already have in context → do it here.
- Cause unknown, needs reading several files or running experiments →
  delegate the whole investigation to the `debugger` worker with the
  reproduction command and the symptom; read back its diagnosis.
- Need to know when/why the code changed → `git-historian` first.

**Hypothesis discipline:** list 2–3 candidates, rank by likelihood, test
the cheapest-to-disprove first. Evidence beats intuition; "it works now"
without a known cause is not fixed.

**Fix the cause.** Then re-run the reproduction, then the nearest tests.
Remove temporary logging. Consider whether the same class of bug exists
elsewhere (one grep) before declaring done.
