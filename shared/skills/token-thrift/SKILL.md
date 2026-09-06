---
name: token-thrift
description: How to work token-efficiently in this environment - delegate bulk reading and mechanical code generation to cheap worker subagents instead of pulling large content into the main context. Consult when a read is blocked by the token-thrift hook, or before reading big files / generating boilerplate.
---

# Token thrift (Spotify "shunt" pattern)

Most agent tokens are spent on I/O, not reasoning. Keep the main context for
reasoning; route I/O through cheap workers that run in their own context.

## The workers

| Worker | Model | Use for |
|---|---|---|
| `scout` | haiku | finding files, mapping structure, locating usages |
| `bulk-reader` | haiku | answering a question about large files / many files |
| `code-writer` | sonnet | tests, configs, stubs, boilerplate, mechanical refactors |
| `reviewer` | sonnet | reviewing a finished change |

## Rules of thumb

- Need to know *where* something is → `scout`, not tree exploration here.
- Need to know *what a big file says* → ask `bulk-reader` a specific
  question; never read >400-line files untargeted (a hook enforces this).
  For a small slice you genuinely need verbatim, use Read with
  offset/limit or Grep with context lines.
- Need predictable code written → give `code-writer` a spec + a reference
  file to imitate; it writes to disk and returns only a summary.
- Re-asking is cheap: workers are ephemeral; a second question to
  `bulk-reader` costs less than holding the corpus in this context.

## If a hook blocked you

That was the `max-read-size` / `no-bulk-cat` enforcement layer. Do not retry
the same read. Delegate the underlying *question* to `bulk-reader`, or make
the read targeted (offset/limit, grep, `head -n 50`).
