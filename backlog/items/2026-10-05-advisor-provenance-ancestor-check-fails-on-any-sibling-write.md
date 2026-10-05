---
schema: pipeline.backlog-item.v1
id: pipeline.advisor-provenance-ancestor-check-fails-on-any-sibling-write
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Observed live under parallel agents, Alfred session, 2026-10-05; diagnosis specs/sprint-alfred-epic/evidence/verify-2026-10-05/flap3-devplan-diagnosis.md."
sprint: alfred
done_when: manual
---

# The advisor provenance ancestor check fails on any sibling write

## Description

`readAdvisorPhysicalBytes` in `plugins/pipeline-core/lib/design-advisor-provenance.mjs`
re-checks every ancestor directory up to the repository root after the read and
compares `mtimeNs`, `size` and `nlink`. Any file created or deleted next to an
ancestor (for example a parallel agent writing `evidence/dispatch-record-*.json`)
changes those values and throws `DAP-PHYSICAL-PARENT-DRIFT`.
`design-workflow-package-v2.mjs` relabels it `DWP2-PHYSICAL-OR-GIT`, and the
dev-plan guard refuses the call as `DAA-DWP2-PHYSICAL-OR-GIT`. Stress probe on
native Windows: 10.2 % of reads failed with one sibling write per 5 ms.

Commit `92b4e15ce` added a bounded retry (3 attempts) for that exact code, which
cut the rate to 1.5 % but does not remove the class. Sustained churn still fails.
On POSIX, a sibling subdirectory also changes a directory's `nlink`, so the
predicate is more fragile there.

## Triggering situation

Six or more concurrent agents in one checkout. Writes were refused intermittently
by the dev-plan gate, and an agent that did not know the flap stopped its dispatch
as "missing access".

## Affected artifact

`plugins/pipeline-core/lib/design-advisor-provenance.mjs` (ancestor identity
predicate) and `plugins/pipeline-core/lib/design-workflow-package-v2.mjs:142`
(catch-all that discards the cause).

## Proposal

Narrow the ancestor identity to `dev`/`ino`/`mode` plus the existing realpath,
`isDirectory` and not-symlink checks. Those values detect a swapped or replaced
ancestor, which is the threat the check exists for. Drop `mtimeNs`/`size`/`nlink`
for ancestors. This is a security-predicate change and needs a PO decision and an
architecture/security Critic. Separately, keep the original cause as a
non-authoritative `cause` field instead of discarding it at
`design-workflow-package-v2.mjs:142`.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
