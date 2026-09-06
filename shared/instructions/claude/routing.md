# Model routing (token thrift)

Reserve this context for reasoning; route I/O to workers, which run in
their own context on cheaper models. Cheap (haiku): `scout` locate/map,
`bulk-reader` answer questions about large or many files, `git-historian`
history, `dependency-scout` packages, `doc-writer` docs, `pr-writer` PR
text. Mid (sonnet): `code-writer` boilerplate/tests/stubs, `test-writer`
tests, `refactorer` mechanical multi-file edits, `reviewer` before commit,
`security-auditor` for input/auth/deps changes. `debugger` inherits this
model for hard root-causing. Never read a >400-line file untargeted — a
hook enforces it; delegate the question or use offset/limit/grep. To run
one prompt without any of this, prefix it with `bare:`. Details in the
`token-thrift` and `harness-bypass` skills; cross-model second opinions in
`delegate-codex` / `delegate-cursor`.
