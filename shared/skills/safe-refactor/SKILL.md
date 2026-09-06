---
name: safe-refactor
description: Behavior-preserving refactor workflow - scope it, prove the occurrence count, delegate the mechanical edit to the refactorer worker, verify with grep and tests. Use for renames, API migrations, and structural moves that touch more than one file.
---

# Safe refactor

1. **Define the exact change** in one sentence with the before/after form
   (`oldName(x)` → `newName(x)`; `import a from 'b'` → `import { a } from 'c'`).
2. **Count occurrences** with `scout` or a single Grep. Decide whether the
   count is what you expect; surprises mean the scope is wrong.
3. **Delegate the mechanical edit** to `refactorer` with the sentence from
   step 1 and the expected count. It must report zero stale occurrences and
   a verification command result.
4. **Verify yourself**: run the type check / tests nearest the change.
5. **Commit separately** from any behavior change (conventional-commits
   `refactor:` type). Reviewers can then skim the refactor and focus on the
   behavior commit.

Never mix "while I'm here" improvements into a refactor commit.
