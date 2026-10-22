---
schema: pipeline.backlog-item.v1
id: pipeline.mandatory-hook-readiness-returned-refusal-skips-rollback
type: defect
owner: pipeline
status: open
created: 2026-10-06
source: "HOOKREFRESH S5 Critic, finding F3 (specs/sprint-alfred-epic/evidence/critic-2026-10-05/hookrefresh-s1-s5.md)."
sprint: alfred
done_when: manual
---

# Mandatory hook readiness rolls back only on a thrown install, not on a returned refusal

## Description

`plugins/pipeline-core/scripts/clone-hook-readiness.mjs` (`applyMandatoryHookReadiness`, lines 113-122 at
`c974ed27c`) wraps only a THROW from the commit-msg install in the rollback. When the commit-msg installer instead
RETURNS a refusal (only reachable through a plan/install race), the flow skips the rollback, falls through to the
readback, ends as `readback-failed`, and leaves pre-commit installed beside a missing commit-msg hook — the mixed state
design `specs/sprint-alfred-epic/design/bootstrap-hook-refresh-design.md` §3.4 exists to remove. The commit message of
`c974ed27c` discloses the gap without an owner or due date (QG-06).

## Triggering situation

HOOKREFRESH-S5 (`c974ed27c`), Critic finding F3.

## Affected artifact

`plugins/pipeline-core/scripts/clone-hook-readiness.mjs`,
`plugins/pipeline-core/scripts/clone-hook-readiness.rollback.test.mjs`.

## Proposal

Treat a non-applied result from the second install exactly like a throw: roll the first install back through the same
`applyRemoval` route and raise `MandatoryHookReadinessApplyError` with the refusal as the cause. Add a CHRB case that
injects a returned refusal. Due before the 0.7.0 release candidate.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** fixed in source — closes after the 0.7.0 candidate host checklist (status stays `open` until then).
- **Rationale:** commit(s) `ddabe0ae3`.
- **Assignment (if accepted):** sprint-alfred-epic close-out batch.
- **Date:** 2026-10-08.

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **LINUX-RUN** — Triage closes the item only after the 0.7.0 candidate host checklist
  Fix ddabe0ae3 is in source and CHRB cases for a RETURNED refusal exist (clone-hook-readiness.rollback.test.mjs lines 203-256). Running `node scratch/run-in.mjs <clone> <label> plugins/pipeline-core/scripts/clone-hook-readiness.rollback.test.mjs` on Linux with all CHRB cases passing closes the item's own acceptance; the 'host checklist' adds no host behaviour the item names.
