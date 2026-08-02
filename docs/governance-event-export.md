# Governance event export

Governance export is a one-way, non-authoritative projection. Without an
explicit destination policy, every destination and field is denied. A policy
can select only the closed safe field set from a validated canonical event; it
cannot permit raw payloads, human rationales, agent summaries, prompts, logs,
credentials, endpoints, certificates, or private coordinates.

Each projection receives a stable destination-neutral identifier derived from
the destination profile and canonical source event digest. Delivery receipts
contain only profile, policy revision, batch and acknowledgement state, cursor,
and lag. They do not prove retention, immutability, analyst review, compliance,
or any human/Pipeline authority. Export responses are never consumed as a
Pipeline authority source.

Use the read-only sanitation preview before a destination-specific outbox or
transport operation:

```bash
node plugins/pipeline-core/scripts/governance-export.mjs preview \
  --event-file <canonical-event.json> \
  --policy-file <export-policy.json|none>
```

`none` returns an explicit denial. The command has no queue, credential, or
network side effect.

Each destination maintains an independent outbox state: acknowledged entries
advance its cursor only across a contiguous confirmed prefix. Partial delivery
leaves unacknowledged entries pending, while quarantined entries preserve their
source binding for reconciliation. The export core uses at-least-once semantics
and never claims exactly-once delivery.

The local outbox store is a sanitized, non-authority cache with a
compare-and-swap preimage. A stale writer receives a typed conflict rather than
replacing newer destination state; it cannot modify the canonical source event
stream.
