# WSL PC re-entry, 2026-10-26

Read-only observations from the first Claude session on the second PC after the
`1addf4dd9` transfer. No product code changed; nothing here is a pass.

## Dispatch refused after transfer: plan approval is clone-bound

Every productive Goldfish dispatch is refused by `guard-dispatch`:

1. `CVCT-FILE`: `project/pipeline-state.json` arrived as mode 0644 from the
   clone; the item course requires an owner-private State file. Repaired with
   the code's own typed repair (`chmod 600`), no other change.
2. `CVCT-AUTHORITY-STALE`: `observeCurrentPlanApprovalForCalibration`
   (`plugins/pipeline-core/scripts/pipeline-state.mjs` ~14418) compares the
   current PO-gate authority with the one recorded in the plan approval.
   [`approval-binding-probe.json`](approval-binding-probe.json) shows PRD, Spec,
   source and runtime digests are byte-identical; only `receiptSha256` (the
   machine-local PO profile receipt) and `repositoryFingerprint` differ. The
   approval recorded on the original machine therefore cannot be current on
   this one, although the approved content is unchanged.
3. A hand-built (D143-style) briefing is refused with
   `DBG-GENERATED-BRIEFING-REQUIRED`, and the generator needs the current
   approval for its criterion binding. No dispatch route remains on this
   Claude runner until the PO re-approves here or a typed transfer rebind
   exists.

Resolution (same day): `node plugins/pipeline-core/scripts/pipeline-state.mjs
rebind-approval` (first invoked as `rebind-approval --help`, which executed
instead of printing help) returned `pipeline.rebind-approval.v1` status
`verified`, rebound fields `receiptSha256` and `repositoryFingerprint`,
`signaturesRequested: 0`, `stateChanged: false`. The calibration observation
then read `eligible` (approval basis `signature`, State revision 35).

Also observed: 73 dispatch records from 2026-10-09 read `unjudgeable`
(`no-owner-claim`) in `dispatch-record-liveness.mjs`; they only add warnings.
HGO request namespace was full (Q17) and was swept with the documented repair.
