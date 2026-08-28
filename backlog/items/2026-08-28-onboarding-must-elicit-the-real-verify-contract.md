---
schema: pipeline.backlog-item.v1
id: pipeline.onboarding-must-elicit-the-real-verify-contract
type: defect
owner: pipeline
status: closed
created: 2026-08-28
sprint: nova
tracking: "NOW / Nova A — happy-path blocking: without a real verify contract the push gate is unsatisfiable by construction, so the path cannot reach its last step"
source: "Greenfield happy-path test of candidate 0.6.0 across all three runners, 2026-08-28. Independent self-analyses: Claude/Windows (docs/pipeline-haertungstest-und-analyse.md), Agy/WSL (pipeline-analysis.md), Codex/WSL (docs/pipeline-session-analysis-2026-08-28.md), plus the PO's own cross-run observations."
closed_at: "2026-08-28"
closure_repository: "self"
closure_commit: "674b1c0c85986a7d4a0aed0f8b1a124c99003d68"
closure_evidence: "plugins/pipeline-core/lib/project-onboarding-v3.test.mjs"
---

# Onboarding leaves a verify contract that cannot pass, and the push gate only discovers it at the very end

## What happened

All three runs hit the same wall at the end of the lifecycle. Agy: "This ticking
time bomb detonates at the very end of the feature lifecycle." Claude spent its
single largest administrative block on the resulting deadlock. Both then reached
for the wrong lever — Agy **forged `evidence/verify-latest.json` by hand** to get
past it.

The chain: the push gate demands candidate-bound verify evidence → the evidence
producer refuses to write unless the configured verify command succeeds → the
configured command is `UNCONFIGURED_VERIFY`, which exits 1 by construction.

## The placeholder itself is correct — this is important

`UNCONFIGURED_VERIFY` (`lib/project-onboarding-v3.mjs:939`) fails deliberately
and says why, and the surrounding comment explains the reasoning at length: a
placeholder that *passed* would let a project claim a verification that never
ran. **That is right and must not be changed.** The evidence producer's refusal
to write on a failing command is right for the same reason.

The defect is not the placeholder. It is that **onboarding never asks the one
question that would replace it**, and nothing between onboarding and the push
gate notices that the project's declared `gates.push: blocking` is unsatisfiable
by construction.

## Direction

1. Ask for the verify command during init — detecting an obvious candidate
   (`npm test`, a `Makefile` target, a test script) and offering it for
   confirmation, never silently adopting one.
2. If the human defers, keep the failing placeholder **and** record that the push
   gate is currently unsatisfiable, so it is reported early rather than
   discovered at push time.
3. Never make the placeholder pass.

## Acceptance criteria

- A fresh project ends init with either a real verify command or an explicit,
  visible record that the push gate cannot yet be satisfied.
- The evidence producer's refusal semantics are unchanged.
- A test asserts no seeded configuration can produce passing evidence without a
  real command having run.

## Closing note (reconciliation, 2026-08-28)

Verified in code, not from a commit message: `collectVerifyContractAction()` and
`withPendingVerifyContractAsk()` (`plugins/pipeline-core/lib/project-onboarding-v3.mjs`
lines ~5212-5259) now ask for the real verify command at init, offer a detected
candidate for confirmation without silently adopting it, accept an explicit
"defer" reply, and — when deferred or unconfigured — set a typed
`pushGateSatisfiable: false` alongside `verifyContractStatus` rather than only
prose. `UNCONFIGURED_VERIFY` (line 952) is unchanged and still fails on purpose.
Pinned by `project-onboarding-v3.test.mjs` lines 2314-2340 (candidate-detected
and no-candidate cases, both asserting `pushGateSatisfiable === false` and the
"defer" guidance text). All three acceptance criteria are met.
