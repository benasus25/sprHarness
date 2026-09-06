Delegate a review of the current uncommitted changes (or, if the working
tree is clean, the last commit) to the `reviewer` subagent. Give it the list
of changed files from `git status --short` / `git diff --stat`. Then relay
its findings to me verbatim, ranked by severity, and stop — do not fix
anything yet. $ARGUMENTS
