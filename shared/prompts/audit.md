Delegate a security review of the current uncommitted changes (or the last
commit if the tree is clean) to the `security-auditor` subagent, per the
security-review skill checklist. Relay its findings ranked by severity with
the proposed minimal fix for each. If it found nothing, say so explicitly.
$ARGUMENTS
