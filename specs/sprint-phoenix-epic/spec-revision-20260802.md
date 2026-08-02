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

### 7.4 Human ledger and authority integration

| File | Change | Rationale |
| --- | --- | --- |
| `plugins/pipeline-core/lib/human-governance-decision.mjs` | create closed decision taxonomy and lifecycle-link validation | Keep authority decisions distinct, complete, and fail-closed before any ledger read/write. |
| `plugins/pipeline-core/scripts/governance-authority.mjs` | create checkpoint-bound canonical authority readback and one-shot consumption CLI | Let existing synchronous guard/state consumers independently verify a ledger decision rather than trust mutable projection State. |
| `plugins/pipeline-core/scripts/governance-authority.test.mjs` | cover canonical readback, scope/candidate drift, consumption, and consumption readback | Preserve direct-reader migration guarantees. |

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
