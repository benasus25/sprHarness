---
name: conventional-commits
description: Write git commit messages in the team's Conventional Commits style. Use whenever composing a commit message.
---

# Conventional commits

Format: `<type>(<scope>): <subject>`

- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.
- Subject: imperative mood, no trailing period, ≤ 72 characters.
- Body (optional): explain *why*, not *what* — the diff shows the what.
- Breaking changes: add a `BREAKING CHANGE:` footer describing the migration.

Examples:

```
feat(auth): add refresh-token rotation
fix(parser): handle CRLF line endings in lockfiles
chore: bump CI node image to 22
```
