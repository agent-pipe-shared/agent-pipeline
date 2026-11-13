fix(guard): an agent's own write never lands in .git/agent-pipeline

The host records what it observed under the pipeline-owned private state
(a design review's model since D247, readiness host receipts, override
requests). The canon always said agents never write there, but a live
probe on 2026-11-13 showed a native Write into
.git/agent-pipeline/design-review-observations/ admitted, so a forged
observation could have stamped a receipt "host-observed".

guard-gate-strength now refuses a Write or Edit whose lexical target, or
the real location behind its deepest existing ancestor (a symlink into
.git), lies inside a .git/agent-pipeline directory. No override; the
plugin's scripts write there with the file system, never through an
agent tool call. A hand-made receipt that claims a host observation is
pinned as refused by the existing content check.

Checkpoint-Intent: candidate 29c, Claude run 3 L3 part 3
AI-Assisted: true
Dispatch: stage-0 (elephant)
