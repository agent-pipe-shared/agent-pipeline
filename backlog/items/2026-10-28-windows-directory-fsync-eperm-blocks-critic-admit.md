---
schema: pipeline.backlog-item.v1
id: pipeline.windows-directory-fsync-eperm-blocks-critic-admit
type: defect
owner: pipeline
status: open
created: 2026-10-28
sprint: alfred
source: "PO relay of a consumer session, 2026-10-28 (see the item body)"
done_when: manual
---

# On Windows the Critic batch admit aborts with CGB-PHYSICAL because the directory fsync is refused (Toolbox D58, P0), and the attested record scope refusal does not say how to repair it (D59)

Relayed 2026-10-28 by the PO from the Toolbox session (its handover is in that repository, not readable here; the facts
below are the relayed summary, re-verified in this repository's source by the held patch notes).

## D58 observed

On Windows, `admit` of the generic Critic batch aborts with `CGB-PHYSICAL`. `plugins/pipeline-core/lib/critic-generic-batch.mjs`
`durable()` (lines 92-102) fsyncs the PARENT DIRECTORY after writing and Windows refuses a directory fsync with `EPERM`; the
bare catch at line 99 drops the errno. The consumer reproduced it with a small read test: every directory gives `EPERM`, a
retry never helps, the folder permissions are fine, every Windows project is affected, and the tool reports only
`CGB-PHYSICAL` with no cause. `CGB-PHYSICAL` has at least two causes: this one and the PF-93 version skew.

## D59 observed

An orchestrator-attested dispatch record refuses any commit that contains paths outside the briefing, so the queue file has
to go in its own commit. This is a security property and stays. The refusal in
`plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs` (lines 633-637) did not name the path class or the repair.

## Wanted

- The directory fsync after a write tolerates `EPERM` on win32 only; the file fsync and every other platform stay strict;
  `CGB-PHYSICAL` carries the underlying code and the failing step, no paths.
- The attested-record refusal keeps its code and names the offending path class, the rule and the repair.
- Native Windows qualification and a sweep of the other directory fsync sites (listed in the held patch notes).

Held patch: `specs/sprint-alfred-epic/evidence/held-patches/w7-d58-d59-windows-dir-fsync-and-attested-scope-hint-c2.patch`
with its notes.
