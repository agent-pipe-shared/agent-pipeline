---
schema: pipeline.backlog-item.v1
id: pipeline.gitleaks-repair-does-not-check-that-the-moved-value-is-the-reviewed-one
type: defect
owner: pipeline
status: open
created: 2026-10-06
source: "FX5B Opus Critic round, 2026-10-06 (specs/sprint-alfred-epic/evidence/critic-2026-10-05/fx5b.md), observation outside the review object."
sprint: alfred
done_when: manual
---

# The gitleaks ignore repair does not check that the moved value is the reviewed one

## Description

`plugins/pipeline-core/scripts/gitleaks-repair-ignore.mjs` (around lines 107-126) picks the live finding that replaces
a stale content-v1 entry by path, rule and column only, and writes a new line-bound entry for it without recomputing
the removed entry's digest against the live finding's value. If the reviewed secret-shaped value was replaced by a
different one at the same path, rule and column while lines moved, the repair would silently suppress a value nobody
reviewed. The content-v1 line binding exists precisely to force a fresh review in that case.

## Triggering situation

FX5B repair of the `guard-git.test.mjs` entry, 2026-10-06; the Critic confirmed value identity only by its own
recomputation, not through the route.

## Affected artifact

`plugins/pipeline-core/scripts/gitleaks-repair-ignore.mjs` (`repairStaleIgnoreEntry`) and its tests.

## Proposal

Test-first: a fixture where the value at the same path/rule/column changed between the recorded line and the live line
must make the repair refuse (typed reason, file untouched). Then the repair recomputes the removed entry's digest with
the live finding's value at the OLD line binding and refuses on mismatch. Due before the 0.7.0 release candidate.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted; implemented test-first — GLREP-t `3f85cff0c` (red 2/5), GLREP `2c2aafccd` (5/5).
- **Rationale:** the content-v1 line binding exists to force a fresh review; the repair must not bypass it. Opus Critic
  PASS (`specs/sprint-alfred-epic/evidence/critic-2026-10-05/glrep.md`) with two minors: F1 (refusal prefix not pinned
  by a test) and F2 (the new suite is not yet registered in the protected `verify.mjs`).
- **Assignment (if accepted):** F1 test-only follow-up dispatch; F2 staged `verify.mjs` registration for the PO's next
  signature. The item stays open until both land (due before the 0.7.0 release candidate).
- **Date:** 2026-10-06
