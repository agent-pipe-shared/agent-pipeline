# Sprint Phoenix Epic — Spec revision 2026-08-02

Status: proposed successor authority; not active until the sanctioned
continuity-authority revision has an exact candidate-bound human decision and
an atomic State readback.

This revision preserves the complete normative contract in
[`spec.md`](spec.md), whose required predecessor digest is
`39912b05660026f5dc82efa5f37aca33b7899d99ff8b29ced1545a9cb389f57f`.
Except for the explicit §7 additions below, the predecessor remains unchanged.
If this revision conflicts with its predecessor, this revision controls. A
reader must reject it if the predecessor is absent or has another digest.

## 7. Detailed implementation inventory — additions

The following rows are the only inventory deltas. They record existing Phoenix
implementation groups that were delivered before the bound inventory was
reconciled; they do not authorize unrelated files or a broader scope change.

Amended 2026-08-05, unsigned and still proposed: the 2026-08-02 draft omitted
six files that already exist on this branch, including the signed §7 bridge
itself, which was authored after that draft. The omission was found by
comparing every `.mjs` file created between the branch base
`9d1b3dc108eb77629ace5b82002120f5539abd8d` and the current candidate against
both the bound predecessor inventory and this revision. Signing the 2026-08-02
draft unchanged would have left the same inventory gap open. The amendment adds
only files that demonstrably exist and belong to an already inventoried Phoenix
group; it changes no normative contract and grants no new scope.

### 7.3 Governance event kernel

| File | Change | Rationale |
| --- | --- | --- |
| `governance/events/capture-policy.json` | create the portable capture-policy instance for the already inventoried policy schema and stream registry | Make the deny-by-default capture and redaction contract an auditable repository artifact rather than implicit behaviour. |

### 7.4 Human ledger and authority integration

| File | Change | Rationale |
| --- | --- | --- |
| `plugins/pipeline-core/lib/human-governance-decision.mjs` | create closed decision taxonomy and lifecycle-link validation | Keep authority decisions distinct, complete, and fail-closed before any ledger read/write. |
| `plugins/pipeline-core/scripts/governance-authority.mjs` | create checkpoint-bound canonical authority readback and one-shot consumption CLI | Let existing synchronous guard/state consumers independently verify a ledger decision rather than trust mutable projection State. |
| `plugins/pipeline-core/scripts/governance-authority.test.mjs` | cover canonical readback, scope/candidate drift, consumption, and consumption readback | Preserve direct-reader migration guarantees. |
| `plugins/pipeline-core/lib/authority-revision-proof.mjs` | create the external public-key proof boundary for a continuity authority revision | Bind an authority transition to a verifiable human signature instead of a mutable local claim. |
| `plugins/pipeline-core/lib/authority-revision-proof.test.mjs` | cover intent binding, trust-policy rejection, forged and replayed proofs | Prove the signature boundary is fail-closed. |
| `plugins/pipeline-core/scripts/phoenix-authority-approval.mjs` | create the human-terminal prepare/approve/verify helper for a signed §7 revision | Keep private keys and signing outside the repository and outside agent reach. |
| `plugins/pipeline-core/scripts/phoenix-authority-revision.mjs` | create the proof-gated wrapper around the existing continuity authority revision writer | Admit the sanctioned writer only after an exact verified proof binding. |
| `plugins/pipeline-core/hooks/guard-git-phoenix.test.mjs` | cover ledger-bound Git override authority, target-repository binding, and replay | Keep the override path provable against the ledger rather than against mutable state. |

### 7.5 Agent journal and lifecycle replay

| File | Change | Rationale |
| --- | --- | --- |
| `plugins/pipeline-core/lib/governance-replay-view.mjs` | create a validated, non-authoritative replay view model | Project canonical replay without turning a view into authority. |
| `plugins/pipeline-core/lib/governance-replay-view-renderer.mjs` | create the deterministic accessible replay rendering boundary | Keep presentation separated from replay validation and authority. |
| `plugins/pipeline-core/lib/governance-replay-view.test.mjs` | cover provenance, invalid-source, uncertainty, and privacy states | Prove the local replay view remains honest. |
| `plugins/pipeline-core/scripts/governance-replay-viewer.mjs` | create explicit local replay-view build CLI | Provide a human-operable, offline read surface. |
| `plugins/pipeline-core/scripts/governance-replay-viewer.test.mjs` | cover CLI output and source-invalid behavior | Preserve the operator boundary. |

### 7.9 Governance event export

| File | Change | Rationale |
| --- | --- | --- |
| `plugins/pipeline-core/lib/governance-export-delivery.mjs` | create destination delivery coordination and acknowledgement handling | Keep at-least-once transport distinct from canonical event authority. |
| `plugins/pipeline-core/lib/governance-export-delivery.test.mjs` | cover acknowledgement, failure, retry, and independent destination behavior | Prove delivery receipts do not overclaim external retention or authority. |
| `plugins/pipeline-core/lib/governance-export-outbox-store.mjs` | create durable machine-local outbox persistence | Isolate transport state from portable canonical records. |
| `plugins/pipeline-core/lib/governance-export-outbox-store.test.mjs` | cover interruption, corruption, replay, and cursor persistence | Prove recovery remains explicit and non-authoritative. |

### 7.10 Phoenix package and integration documentation

| File | Change | Rationale |
| --- | --- | --- |
| `plugins/pipeline-core/scripts/phoenix-governance-threat-model.test.mjs` | cover the maintained threat-model document's required trust boundaries, abuse cases, and recovery sections | Keep the threat-model obligation machine-checked instead of asserted. |

### 7.11 Governed external execution handoff

| File | Change | Rationale |
| --- | --- | --- |
| `plugins/pipeline-core/lib/external-command-offer.mjs` | create typed, privacy-minimized records for Pipeline-known external command offers and readback | Make external handoffs visible without persisting arbitrary command content or granting authority. |
| `plugins/pipeline-core/lib/external-command-offer.test.mjs` | cover authority-sensitive offers, command-content rejection, retry, and readback states | Preserve the external-execution safety boundary. |

## Revision decision scope

The human design-revision decision must bind this successor path and digest,
the predecessor path/digest above, the exact current candidate, and the active
Phoenix feature in `design` phase. It authorizes only this authority transition;
it does not authorize release, deployment, publication, push, merge, or a
future Spec rewrite.
