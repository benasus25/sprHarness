---
name: security-review
description: When and how to run a security pass on changes using the security-auditor worker, plus the minimum checklist for input handling, auth, secrets, and dependencies. Use before merging anything that touches user input, authentication, file or network access, or adds a dependency.
---

# Security review

**Trigger** a review (delegate to `security-auditor` with the diff or file
list) when a change touches: request/CLI/env input parsing, authentication
or authorization, file paths, shell or SQL construction, outbound HTTP,
serialization, crypto, or the dependency manifest.

**Minimum checklist** the auditor is asked to confirm:

- Every external input reaches a sink (shell, SQL, eval, path, URL, HTML)
  only through a safe API or explicit validation.
- New endpoints / privileged operations check *authorization*, not just
  identity.
- No credentials, tokens, or keys in code or committed config.
- New dependencies are pinned and their use is limited to what's needed.

**Act on findings** by severity; fix or explicitly accept each one in the
PR description (`pr-writer` will include a Risks section). A review that
finds nothing must say so explicitly.
