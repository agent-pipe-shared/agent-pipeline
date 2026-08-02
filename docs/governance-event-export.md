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

## Interchange profiles

`pipeline.governance-export-adapter-profile.v1` describes a non-secret
destination capability: profile/version, supported format, payload and batch
limits, acknowledgement granularity, ordering declaration, and deduplication.
It deliberately does not contain an endpoint, token, certificate, tenant, or
provider name. Those remain operator-managed adapter configuration.

The mapping command is also read-only and accepts only a prior sanitized
projection, never a canonical payload:

```bash
node plugins/pipeline-core/scripts/governance-export.mjs map \
  --projection-file <sanitized-projection.json> \
  --profile-file <adapter-profile.json>
```

| Profile | Deterministic mapping | Declared loss / boundary |
| --- | --- | --- |
| `cloudevents-json` | CloudEvents 1.0 `id`, stable Pipeline source, type, subject, optional occurrence time, and the sanitized projection as `data`. | Source/type fall back to typed `unknown` when policy omitted them; free-form source payload is never reconstructed. |
| `otlp-json` | OpenTelemetry JSON resource logs with `service.name`, destination profile, event name, source digest, policy revision, and sanitized body. | No trace/span is invented; omitted correlation stays omitted. |
| `ndjson` | One canonical projection JSON object followed by one newline. | Intended for offline/air-gapped transfer; it does not imply delivery or retention. |
| `rfc5424` | RFC 5424-compatible single message with escaped structured data for profile, source digest, and policy revision. | It is a constrained legacy profile; only the stable event type enters the message text. |

Mappings reject fields outside the export policy's closed allowlist, mismatched
profile/format pairs, payloads above the declared byte limit, malformed
profiles, and forged or duplicated acknowledgement IDs. An acknowledgement is
validated before it reaches the outbox but remains transport observation only:
it cannot approve, waive, release, deploy, revoke, or mutate canonical
Pipeline authority.

## Delivery coordinator and reference collector

`deliverGovernanceExportBatch` accepts a bounded pending outbox batch, maps
each already-sanitized entry, and accepts only a closed
`pipeline.governance-export-acknowledgement.v1` receipt whose IDs belong to
that batch. It then advances the local outbox only through its existing
contiguous acknowledgement rule. Unknown, forged, duplicate, or mismatched
acknowledgements fail before an outbox transition.

`createInMemoryGovernanceExportCollector` is the required synthetic reference
adapter for conformance fixtures. It records mappings locally and acknowledges
only their stable destination IDs. It has no network, endpoint, credential, or
authority capability. Production destinations supply the same narrow
`deliver({ batchId, mappings })` boundary from operator-managed configuration;
their receipt can describe transport acceptance, never retention, review, or a
Pipeline authorization decision.

Each destination maintains an independent outbox state: acknowledged entries
advance its cursor only across a contiguous confirmed prefix. Partial delivery
leaves unacknowledged entries pending, while quarantined entries preserve their
source binding for reconciliation. The export core uses at-least-once semantics
and never claims exactly-once delivery.

The local outbox store is a sanitized, non-authority cache with a
compare-and-swap preimage. A stale writer receives a typed conflict rather than
replacing newer destination state; it cannot modify the canonical source event
stream.
