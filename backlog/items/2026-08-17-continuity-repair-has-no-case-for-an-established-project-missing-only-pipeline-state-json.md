---
schema: pipeline.backlog-item.v1
id: pipeline.continuity-repair-has-no-case-for-an-established-project-missing-only-pipeline-state-json
type: defect
owner: pipeline
status: open
created: 2026-08-17
source: "Relayed by the PO 2026-08-17 from a live D:\\Dev\\HA (Windows, native Claude) session's handover, filed after a reinstall/fresh-bootstrap repair path left the project at continuity-damaged/nextAction:null. The report's specific mechanism claim (gated on a `historyObservation`/`docs/HISTORY.md` check) was checked against current source and does not hold; filed here with the corrected mechanism. PO reports both current Windows user-repo sessions are fully blocked on this dead end -- fix accepted as urgent."
---

# `planOnboardingContinuityRepair()` has no repair case for a mature project whose `pipeline-state.json` is absent but whose handover/authority already exist

## Description

`planOnboardingContinuityRepair()` (`plugins/pipeline-core/lib/onboarding-continuity.mjs:887`)
only proposes a repair for two `observed.projected?.code` values:
`CS-STATUS-CONTINUITY-INVALID` (normalize an invalid resume state) and
`CS-STATUS-ACTIVE-NO-CONTINUITY` with `historyObservation.status === "absent"`
(adopt continuity into a legacy pre-continuity state). Anything else returns
`status: "unsupported"` (`:907`), and the caller
(`project-onboarding-v3.mjs:4251-4261`) turns that into `nextAction: null` —
a dead end with no further command to run.

**The relayed root-cause mechanism does not hold up on inspection — the
actual mechanism is different.** The report attributed the failure to the
`historyObservation.status === "absent"` guard at line 904, reasoning that a
mature project's `docs/HISTORY.md` being present defeats it. Checked against
source: `historyObservation`/`HISTORY_BASENAME` (`:105`,
`HISTORY_BASENAME = "continuity-history.json"`) is a **private, per-machine
JSON transaction-history file** used for kickoff/design-promotion binding —
unrelated to the repo's public `docs/HISTORY.md` markdown handover doc. The
real mechanism: `observeDetailed()` (`:557`) branches on
`stateObservation.status === "absent"` at `:680` and returns EARLY
(`:684-696`) whenever `pipeline-state.json` is absent — a branch that never
computes `projected` at all. `planOnboardingContinuityRepair()`'s two
conditions both test `observed.projected?.code` (`:901`, `:903`), which is
therefore `undefined` for every project whose `pipeline-state.json` is
simply missing — regardless of whether either flavor of history file exists.
This is the exact shape of a mature/established project mid-migration to V4:
`docs/state.md` (the configured handover) already exists and is real, but
`project/pipeline-state.json` was never created (e.g. a project that
predates the V4 continuity machine-state file, or one whose state file was
lost/reset during a reinstall/repair cycle like the reporting session's).

## Triggering situation

Live on `D:\Dev\HA`: after a fresh-bootstrap reinstall + `apply-repair
--activate` cycle, the project's `project/pipeline-state.json` is absent
(never recreated by the reinstall path) while `docs/state.md` (the
configured handover, 54+ documented sessions) and the repo's Git history are
both real and present. `plan-repair` / `apply-repair` report `status:
"unsupported"` / `nextAction: null` — no further command exists. The PO
reports this same shape has now blocked TWO Windows user-repo sessions.

## Affected artifact

`plugins/pipeline-core/lib/onboarding-continuity.mjs` —
`planOnboardingContinuityRepair()` (`:887-950`), `observeDetailed()`
(`:557-758`, specifically the early-return branch at `:680-696`),
`establishedContinuity()` (`:774-835`, the closest existing analog: it
already knows how to synthesize a fresh `continuity` block from
`state.planApproval.poGateAuthority`, but requires an existing `state`
object — this new case has none, since `pipeline-state.json` itself is
absent).

## Proposal

Add a third repair case, mirroring `establishedContinuity()`'s shape but
without requiring a pre-existing `state` object: when
`stateObservation.status === "absent"` AND `handoverObservation.status ===
"present"` (the early-return path at `observeDetailed():680-696`), and the
project's calibration/authority can independently establish valid PO
authority (an approved PRD/Spec pair — the same authority shape
`establishedContinuity()` validates, `pipeline.po-gate-authority-evidence.v1`
/ `pipeline.po-gate-authority.v2`), propose adopting a freshly-synthesized
`pipeline-state.json` bound to that authority — never inventing an
`activeFeature`/authority pair that isn't independently evidenced. Where no
such PO authority can be established, this MUST still fail closed with a
typed diagnostic (never silently fabricate authority) — this is guardrail/
lifecycle code and the existing two cases' fail-closed posture must not be
weakened. `observeDetailed()`'s early-return branch (`:684-696`) currently
returns no `projected`/`state` payload at all for this shape; the repair
plan will need either a new dedicated observation path for this case or an
extension of that branch to surface what a repair proposal needs, without
changing `classifyOnboardingContinuity()`'s existing `damaged`
classification for any other caller.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted as urgent — both user-repo sessions blocked, real
  and reproducible dead end, mechanism independently re-derived and
  corrected before dispatch (relayed mechanism did not hold).
- **Rationale:** guardrail/lifecycle-authority code — dispatched to
  goldfish-deep, not hand-authored directly by the Elephant (EL-01 stage-0
  exclusion for lifecycle/security-adjacent code), per this session's own
  standing practice.
- **Assignment:** dispatched same-session as NVA-CONTREP-1.
- **Date:** 2026-08-17
