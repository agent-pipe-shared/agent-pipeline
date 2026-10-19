---
schema: pipeline.backlog-item.v1
id: pipeline.a-restore-of-a-protected-file-to-its-committed-bytes-is-refused
type: improvement
owner: pipeline
status: open
created: 2026-10-19
source: "Elephant decision E25 (2026-10-19, under PO decision D26): TR-L-F (toil-resolution-2026-10-08 row T84, section 5 row 9) leaves 0.7.0"
sprint: none
done_when: manual
---

# A restore of a protected file to its committed bytes is refused

## Description

Toil row T84 (`specs/sprint-alfred-epic/design/toil-resolution-2026-10-08.md`) asks for
two things:

- one protection decision per file across hunks;
- a `git restore` that puts a protected file back to its committed HEAD bytes, admitted
  because a revert only reduces risk.

The pins landed as tranche-2 post-images (TR-L-T, 2eb6c2732): TP19 to TP21 in
`hooks/guard-testpath.test.mjs` and OT20 to OT23 in
`hooks/guard-testpath-override.test.mjs`. The guard change TR-L-F was queued and never built.
The shell lane still refuses every `git restore` of a protected path
(`protectedTestPathShellHit`, lane `git-working-tree-write`, rule TP-3), so OT21 and OT23 are
red. Each revert of a protected file therefore costs an override ceremony.

Elephant decision E25 rates this a medium hygiene item under D6/D10 and moves it out of
0.7.0. The C5 drop-in for TP-7 marks OT21 and OT23 as typed pending. Their assertions run
unchanged, the red is printed, and the case fails as soon as the assertions hold, so the
marker cannot go stale.

## Proposal

Build TR-L-F as the design row describes: a GUARDRAIL and SECURITY change with an Opus
Critic. Admit the restore only when it is bound to HEAD bytes:

- `git restore -- <file>` when the index equals HEAD (OT21);
- the explicit `git restore --source=HEAD --staged --worktree -- <file>` (OT23).

A restore from any other ref, and every other writer of the path, stays refused (OT22). The
change touches the protected guard library, so it needs a signed ceremony.

## Acceptance

- OT21 and OT23 pass, and their pending markers are removed in the same ceremony.
- OT20, OT22 and TP19 to TP21 stay green.
- A restore from a ref other than HEAD is still refused.
