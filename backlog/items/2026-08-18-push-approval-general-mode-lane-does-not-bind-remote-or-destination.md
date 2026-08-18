---
schema: pipeline.backlog-item.v1
id: pipeline.push-approval-general-mode-lane-does-not-bind-remote-or-destination
type: defect
owner: pipeline
status: open
created: 2026-08-18
source: "Incremental handover-rotation extraction pass (ADR-0066 Decision 6/7), 2026-08-18, over docs/state.md lines 3489-5929 (the T7 Critic round entry, ~2026-08-06). Finding surfaced by a read-only research fork, verified against current source before filing."
---

# `guard-push.mjs`'s ordinary (`chat`/`standing-approved`) push-approval lane checks only `forCommit`, never `remote`/`destination`

## Description

`docs/state.md`'s T7-round entry (from the 2026-08-06 "Nova (afternoon)"
block, now archival material) discloses an adjacent gap found while
fixing an unrelated finding (F4), not itself fixed at the time: in
`guard-push.mjs`'s weaker-mode push-approval lane
(`gates.push_approval` in `chat`/`standing-approved` mode, not
`required`), an approval is treated as valid authorization by checking
`pushApproval.lastApproved.forCommit` alone — `remote` and `destination`
are never compared. In principle the same approved commit could
authorize a push to a different remote/destination than the one it was
actually approved for, without a fresh approval. `main` itself is
separately eager-gated and not exposed to this specific gap; the
exposure is on ordinary branches under the weaker approval modes.

Verified still true today by direct read: `guard-push.mjs` lines
~1663-1671 (the general-mode check) test only `approval?.forCommit`; the
`remote`/`destination`-bound check (`authorizeRecordedPush`, line ~1697)
runs only inside the stricter `pushGate.approval === "required" &&
!pushWaiver.waived` branch.

## Triggering situation

Incremental extraction pass over `docs/state.md`'s oldest, clearly-closed
sections before that range can be rotated into `docs/state-archive/`
(ADR-0066 Decision 6/7). Checked existing backlog items referencing
`forCommit`/`lastApproved`/remote-destination binding
(`push-release-flow-unusable-for-third-party-adopters`,
`blocking-push-gate-has-no-terminal-exception-boundary`) — both cover
different gaps; this specific one has no existing item.

## Affected artifact

`plugins/pipeline-core/hooks/guard-push.mjs` (the general-mode
authorization check, ~lines 1663-1671), compared against
`authorizeRecordedPush` (~line 1697). This repository's own configured
`gates.push_approval` value is `signature` (the strict mode, per
[ADR-0056](../../docs/adr/0056-push-approval-mode.md)), so this specific
gap is not exploitable against this repository's own pushes today — it
would matter for a project calibrated to `chat`/`standing-approved`
mode.

## Proposal

Not yet designed in detail. Likely direction: extend the general-mode
check to also compare `remote`/`destination` against the recorded
approval, matching what `authorizeRecordedPush` already does in the
strict lane — bringing the two lanes' binding scope into parity.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** not yet decided — filed to preserve the finding.
- **Rationale:** real gap, but not exploitable against this repository's
  own current calibration (`signature` mode); found while doing
  unrelated handover-rotation extraction work, not itself the task at
  hand.
- **Date:** 2026-08-18
