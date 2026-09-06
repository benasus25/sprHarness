---
name: pr-description
description: Structure for pull request titles and descriptions, and how to have the pr-writer worker draft one from the branch diff. Use when opening or updating a PR.
---

# PR descriptions

Delegate the draft to `pr-writer` (it reads the diff and commits, not whole
files). Review the draft for accuracy — especially the Testing section,
which must describe only what was actually run.

**Title:** ≤70 chars, imperative, Conventional Commits prefix if the repo
uses it (`feat(auth): add refresh-token rotation`).

**Body:**

```
## What
- bullets of concrete changes (file/behavior level)

## Why
1–3 sentences: the problem or goal

## Testing
exact commands run and their outcome

## Risks / follow-ups
what could break, what was deliberately deferred — or "none"
```

If the security-review or reviewer workers produced findings, list how each
was resolved or explicitly accepted.
