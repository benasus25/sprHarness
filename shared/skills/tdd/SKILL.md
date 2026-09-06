---
name: tdd
description: Red-green-refactor workflow using the test-writer and reviewer workers - write a failing test first, make it pass minimally, then clean up. Use when implementing a feature or fixing a bug in a codebase that has tests.
---

# Test-driven loop

1. **Red** — delegate to `test-writer`: "write a failing test for <behavior>
   in the style of <existing test file>; run it; confirm it fails for the
   right reason." Read only its summary.
2. **Green** — implement the minimal change yourself (this is the reasoning
   step; keep it in the main context). Run the narrowest test command.
3. **Refactor** — if the change left duplication or awkward structure,
   delegate mechanical cleanup to `refactorer` with an explicit scope, and
   have it re-run the tests.
4. **Review** — delegate to `reviewer` before committing anything
   non-trivial.

Rules: never write the implementation before the test exists; never widen
scope inside a red-green cycle; if a test needs the whole world mocked, the
design is wrong — say so.
