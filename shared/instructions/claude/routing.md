# Model routing (token thrift)

Reserve this context for reasoning; route I/O to workers (they run in their
own context on cheaper models): `scout` (haiku) to locate things,
`bulk-reader` (haiku) to answer questions about large/many files,
`code-writer` (sonnet) for tests/configs/stubs/boilerplate, `reviewer`
(sonnet) before committing non-trivial changes. Never read a >400-line file
untargeted — a hook enforces this; delegate the question or use
offset/limit/grep. Details: the `token-thrift` skill. For a second opinion
from another model family, see the `delegate-codex` / `delegate-cursor`
skills (subscription CLIs, availability-checked).
