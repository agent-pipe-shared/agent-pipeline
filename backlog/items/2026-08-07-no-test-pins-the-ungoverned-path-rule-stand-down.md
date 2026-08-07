---
schema: pipeline.backlog-item.v1
id: pipeline.no-test-pins-the-ungoverned-path-rule-stand-down
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: Coverage observation made by the PHX-R1-REWORK-2 dispatch while verifying the governance-marker precondition. Outside that briefing's scope, so recorded rather than acted on.
---

# No test pins the gate-strength path rules standing down in an ungoverned checkout

## Description

`plugins/pipeline-core/hooks/guard-gate-strength.mjs` evaluates its path table
only after a governance-marker check. When `gateStrengthRuleFor()` matches a
path, the hook then requires the repository to carry one of five marker files
(`pipeline.user.yaml`, `project/pipeline.yaml`, `.claude/pipeline.yaml`,
`project/guard-config.json`, `.claude/guard-config.json`) and calls
`process.exit(0)` when none is present (`:179-188`). The shell lane carries the
same precondition at `guard-lifecycle-ready.mjs:893-900`.

So every GS-1..GS-5/GS-7/GS-8 rule — and any future one, such as the GS-9
proposed by residual R1 — stands down entirely in a checkout the guard does not
recognise as governed.

**That stand-down has no test.** `guard-gate-strength.test.mjs`'s GST17
(`:245-278`) iterates the whole path table and drives both lanes, which is the
right shape, but it runs inside a `governed()` fixture (`:28-38`) that writes
four of the five markers. Every table-driven assertion therefore exercises only
the governed branch. Nothing asserts what happens without a marker.

## Why this is worth a test rather than a note

The untested branch is the one that turns the entire path table off. A
regression there — a marker name changed, the check moved above the match, the
list narrowed — would not fail any suite, and the symptom is silence: writes
that should be refused simply succeed.

It is also the branch most likely to be wrong in the field rather than in this
repository. Every marker file here is tracked, so every clone of this repository
is governed and the stand-down never fires locally. The case that goes untested
is precisely the case that only occurs somewhere else.

The gap surfaced because a design document asserted the path-table protection
unconditionally and a review found the precondition. The design was corrected;
the test suite still describes the same incomplete picture.

## Triggering situation

Found 2026-08-07 while verifying, from source, the governance-marker premise of
Critic finding F-A on residual R1. The dispatch's scope was the design document
only, so it recorded the observation instead of acting on it.

## Affected artifact

`plugins/pipeline-core/hooks/guard-gate-strength.test.mjs` (GST17 at `:245-278`
and the `governed()` fixture at `:28-38`), covering
`plugins/pipeline-core/hooks/guard-gate-strength.mjs:179-188` and the shell-lane
sibling `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:893-900`.

## Proposal

**Owner: PO.** Small and well-defined, with one sequencing constraint.

1. Add a case that drives a path-table rule in a checkout carrying **none** of
   the five markers and asserts the hook exits 0 — the stand-down is the
   specified behaviour, so the test pins it rather than challenging it. Mirror it
   for the shell lane.
2. Consider a second case asserting that **each** marker alone is sufficient.
   The current fixture writes four of five, so one marker's contribution is
   untested; a rename or typo in that entry would be invisible.
3. Note the constraint: `guard-gate-strength.test.mjs` is a protected test path,
   so this needs its own briefed test-change task rather than riding along in an
   unrelated dispatch — the same hand-off that is the recorded structural cause
   of three unregistered suites
   (`backlog/items/2026-08-07-ruleset-source-test-unregistered-in-the-verify-gate.md`).
   If a new test file is created instead of editing the existing suite, it must
   be registered in `harness/scripts/verify.mjs` in the same change, or it
   protects nothing.

No behaviour change is proposed. The code is correct as written; what is missing
is a test that would notice if it stopped being.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
