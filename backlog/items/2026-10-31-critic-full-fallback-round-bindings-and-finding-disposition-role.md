---
schema: pipeline.backlog-item.v1
id: pipeline.critic-full-fallback-round-bindings-and-finding-disposition-role
type: defect
owner: pipeline
status: open
release: 0.7.0
created: 2026-10-31
sprint: alfred
source: "Consumer hand-over of 2026-10-31, retested on the installed stamp a2099ff5f (0.7.0+claude.20261031060558.62b553e); both causes checked by the Elephant against the tree."
---

# An effective full Critic round cannot start: its bindings are checked over the wrong range, and the finding-disposition role has no producer

## What happened

A consumer's course round was requested as a delta that moves a trust boundary, so the admission turned it into an effective full
round (`RE-DELTA-FALLBACK-FULL`, D204) over the course genesis base (248 commits). Two separate stops followed, both before the
Critic read any content.

1. The dispatch preflight accepted only the bindings file for the correction range and refused one derived over the full range with
   `CDP-CORRECTION-INPUT-STALE`. The Critic then correctly stopped: the bindings covered 20 of the 248 commits.
2. With bindings derived by hand over the full range, the Critic stopped again: a backlog item in the range quotes earlier Critic
   findings verbatim, so the derivation put a file with prior verdicts among the source paths.

## Cause (verified against the tree)

- Finding 1: `plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs` line 324 checks the bindings against `baseCommit`
  (the correction range) before the course admission is read; the review base moves to the genesis base only at line 466 when
  `fallbackFull` holds. The admission binds no bindings digest. D204 widened the review range but not the bindings check.
- Finding 2: the canon (`harness/review-protocol.md` section 2.2, `templates/prompts/critic-review.md` line 252, ADR-0014) admits
  three exclusion roles: retained prior result, finding-disposition record and project-state record. The derivation
  (`plugins/pipeline-core/lib/critic-correction-input-bindings.mjs` lines 11-12 and `classify()` lines 56-61) produces only two.
  A file whose role the canon names has no tool route, so a long-lived project range that holds such a file never admits a full round.

## Fix

- Finding 1 (no decision needed): when the admission yields `RE-DELTA-FALLBACK-FULL`, the preflight checks the bindings over the
  genesis base to the candidate, and its refusal text names that base in the derive command; a pin covers both ranges.
- Finding 2: needs a PO decision on how a finding-disposition record is identified (calibrated path list, file marker, or the role
  is dropped from the canon), then the derivation, canon and pins follow.

## Further notes in the same hand-over (2026-10-30, not yet triaged)

- The Critic template does not fix how commit metadata is read; a `%B` read of commit texts that name earlier rounds stopped one
  round and not another.
- A Goldfish budget checkpoint leaves green work uncommitted; a follow-up dispatch is refused with `AGY-HOST-BASELINE-DIRTY`.
- `verify-evidence-producer.mjs --out` on a tracked evidence file removes it first and ends in `VEP-DRIFT` after about a minute.
- The dispatch builder admits only `.test.mjs/.cjs/.js` or a registered command as a check (`DBG-CHECK-NOT-TEST` for `*.test.ts`).
- The guard asks for the full prompt inline; a prompt-file pointer is refused (to check against the installed D183 route).
