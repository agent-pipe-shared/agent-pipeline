feat(agy-native): land a branch child's own commits by fast-forward (ADR-0099)

Antigravity run 3 (R5, Toil P3): the Elephant harvested Workspace
"branch" children by hand, and the Critic noted that the landed commit
was the orchestrator's, not the child's. PO tile 2026-11-13: build a
harvest command that keeps the authorship.

agy-native-integrate.mjs plan now reports fastForward: eligible only
when the merge base is the current HEAD and every commit of the branch
carries exactly one "Dispatch: <id> (goldfish)" trailer (one id) and
"AI-Assisted: true". A fast-forward runs no commit-msg hook, so the
script checks the trailers per commit. apply --keep-authorship <id>
then lands those commits unchanged with git merge --ff-only after the
usual take-over record, and refuses a different briefed id. Anything
else keeps the patch route.

The evidence label stays honest: no dispatch record is written here,
and next names the attested writer over exactly the landed commits
(orchestrator-attested, no host observation). Binding the host's
per-child descriptor is left as an open PO question.

The guard admits one --keep-authorship <id> on apply in place of
--commit-dispatch-id. ADR-0099, register D251, the ADR index, the
doc-governance registration and the antigravity-native-dispatch
reference record it. Pins: two "C29 R5" cases and the argv case.

AI-Assisted: true
Dispatch: stage-0 (elephant)
