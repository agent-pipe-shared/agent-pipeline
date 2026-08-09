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

## Threat model

**Trust boundary.** The canonical Pipeline event stream never crosses the
export boundary directly; only a policy-sanitized
`pipeline.governance-export-event.v1` projection may
(`governance-export-outbox.mjs:6`). The only network egress point in this
package is the operator-supplied `adapter.deliver({ batchId, mappings })`
call inside `deliverGovernanceExportBatch`
(`governance-export-delivery.mjs:19`); every function on either side of it is
pure/local.

**Threats considered and their mitigation:**
- A destination returning a forged, duplicate, or unbound acknowledgement —
  `validateGovernanceExportAcknowledgement` rejects duplicate or overlapping
  accepted/rejected IDs and malformed IDs before any outbox transition
  (`governance-export-adapter.mjs:102-111`), and
  `deliverGovernanceExportBatch` additionally rejects an acknowledgement that
  names an ID outside the batch actually sent (`GED-ACK-UNKNOWN`,
  `governance-export-delivery.mjs:22`).
- An adapter profile smuggling an endpoint, credential, or tenant into the
  declared "non-secret capability" — `validateGovernanceExportAdapterProfile`
  is an exact-key allowlist (`schema, profileId, format, adapterVersion,
  maxBatchEvents, maxPayloadBytes, acknowledgement, ordering,
  deduplication`) that rejects any additional field
  (`governance-export-adapter.mjs:34-41`).
- A concurrent writer racing the local outbox file — `persistGovernanceExportOutbox`
  compares the prior file's SHA-256 digest before writing and returns a typed
  `status: "conflict"` rather than overwriting newer state
  (`governance-export-outbox-store.mjs:18-20`).
- Symlink or path substitution against the outbox file — `readCurrent`
  rejects a target that is not a regular, non-symlinked file
  (`governance-export-outbox-store.mjs:14`).
- An acknowledgement being read as Pipeline authority — deliberately out of
  reach structurally: the acknowledgement path only ever advances local
  outbox `status`/`cursor` fields (`governance-export-outbox.mjs:17-22`); it
  has no code path into any lifecycle, approval, or release record.

**Explicitly out of scope / not mitigated here:** the destination adapter's
own transport security (TLS, authentication) is operator-managed
configuration, not part of this package — "endpoint/authentication stay
operator-local" (`governance-export-adapter.mjs:32`). This package does not
mitigate a compromised or malicious adapter implementation itself; it only
bounds what a compromised adapter's *responses* can do to local state.

## Data-flow diagram

```
canonical Pipeline event
        |
        v   policy: closed field allowlist, default-deny
projectGovernanceEvent()                       [governance-event-projection.mjs]
        |
        v   pipeline.governance-export-event.v1 (sanitized, non-authority)
enqueueGovernanceExport()                      [governance-export-outbox.mjs:12]
        |
        v   per-destination outbox entry, status: pending
persistGovernanceExportOutbox()  <--CAS-->  outbox.json          [governance-export-outbox-store.mjs:12,18]
        |
        v   nextGovernanceExportBatch(): bounded slice of pending entries
mapGovernanceExportProjection()                [governance-export-adapter.mjs:89]
        |
        v   cloudevents-json | otlp-json | ndjson | rfc5424
adapter.deliver({ batchId, mappings })  <== ONLY network/egress boundary ==>  destination
        |
        v   pipeline.governance-export-acknowledgement.v1 (untrusted, typed)
applyGovernanceExportDelivery()                [governance-export-outbox.mjs:17]
        |
        v   cursor advances only across a contiguous acknowledged prefix
createGovernanceDeliveryReceipt()              [governance-event-projection.mjs]
        (sanitized delivery evidence only; never a Pipeline authority source)
```

## Mapping and loss guide

`EXPORT_FIELDS` bounds what may appear in a projection's `fields`: `eventId,
eventType, occurredAtEpochMs, eventDigest, repositoryFingerprint,
correlation, candidate, policyDigest` (`governance-export-adapter.mjs:15`).
Per-profile survival:

- `cloudevents-json` — `data: clone(item)` embeds the whole projection,
  including all `fields`, verbatim; nothing is dropped
  (`governance-export-adapter.mjs:55`).
- `otlp-json` — the log body is `JSON.stringify(clone(item.fields))`, i.e.
  every field verbatim as the body string; nothing is dropped
  (`governance-export-adapter.mjs:69`).
- `ndjson` — the entire projection is serialized on one line; nothing is
  dropped (`governance-export-adapter.mjs:94`).
- `rfc5424` — only `destinationProfile`, `sourceEventDigest`, and
  `policyRevision` (as structured-data parameters) plus `eventType` (as the
  message text) reach the rendered output; `eventId`, `eventDigest`,
  `repositoryFingerprint`, `correlation`, `candidate`, and `policyDigest` are
  not present anywhere in the message (`governance-export-adapter.mjs:81-85`).
  `occurredAtEpochMs` is consumed only to derive the header timestamp, not
  carried as a field value.

**KNOWN GAP.** Despite `rfc5424` dropping most of `fields`,
`mapGovernanceExportProjection` unconditionally returns `loss: freeze([])`
for every profile, including `rfc5424`
(`governance-export-adapter.mjs:98`). The `loss` array on a
`pipeline.governance-export-mapping.v1` result is therefore always empty
today regardless of which profile mapped it — it does not yet reflect the
real per-field drop described above. A caller cannot currently tell "nothing
was dropped" (true for `cloudevents-json`/`otlp-json`/`ndjson`) apart from
"several fields were silently dropped" (true for `rfc5424`) by inspecting
`loss`; both report `[]`. Treat the "Declared loss / boundary" column in the
Interchange profiles table above as the accurate prose description of a
profile's field survival, and treat the machine-readable `loss` field on an
individual mapping result as not yet a reliable per-mapping signal until this
gap is closed.

## Retention guidance

The local outbox file lives at
`.pipeline/governance-export/<destinationProfile>/outbox.json`
(`governance-export-outbox-store.mjs:12`) and is a non-authority sanitized
cache, not the canonical event history. `enqueueGovernanceExport` appends new
entries and silently skips a duplicate `sourceEventDigest` rather than
re-enqueuing it (`governance-export-outbox.mjs:12-15`).
`applyGovernanceExportDelivery` never removes an entry from `outbox.entries`
— acknowledged, quarantined, and pending entries all remain present
indefinitely; only an entry's `status` and the outbox's `cursor` change
(`governance-export-outbox.mjs:20-22`).

There is currently no pruning, archival, rotation, or expiry function
anywhere in `governance-export-outbox.mjs` or
`governance-export-outbox-store.mjs` (confirmed by grep for
`prune`/`archive`/`purge`/`expire`/`ttl`: no matches). For a long-running
destination the entries array, and therefore the outbox file, grows without
bound as more events are exported. An operator who needs to bound file size
or apply a retention window must do so outside this package today (for
example, archiving the file once its acknowledged prefix is large, then
persisting a rewritten, pruned outbox through
`persistGovernanceExportOutbox`'s CAS path). Do not hand-edit the file
directly — an out-of-band edit invalidates its recorded SHA-256 digest and
forces the next legitimate write into a CAS conflict
(`governance-export-outbox-store.mjs:19`).

## Operator runbook

There is no dedicated CLI subcommand for outbox/delivery inspection today —
only `preview` and `map` are wired into the script
(`governance-export.mjs:11-16`). The supported inspection path is calling the
library functions directly:

- **Preview whether an event/policy pair would export at all** (no queue or
  network side effect):
  `node plugins/pipeline-core/scripts/governance-export.mjs preview --event-file <canonical-event.json> --policy-file <export-policy.json|none>`
  (`governance-export.mjs:14,19-22`).
- **Preview how a sanitized projection renders under an adapter profile:**
  `node plugins/pipeline-core/scripts/governance-export.mjs map --projection-file <sanitized-projection.json> --profile-file <adapter-profile.json>`
  (`governance-export.mjs:15,21`).
- **Read current outbox state for a destination:**
  `loadGovernanceExportOutbox({ repositoryRoot, destinationProfile, policyRevision })`
  returns `{ status: "absent" | "current", outbox, sha256 }`
  (`governance-export-outbox-store.mjs:16`); `"absent"` means no outbox file
  exists yet for that destination/policy pair.
- **Inspect the delivery session** (rate limit, retry attempt, backoff,
  delivered/quarantined counters): the session object carries `attempt,
  nextAttemptAtEpochMs, cancelled, cancelReason, flushing, deliveredEvents,
  quarantinedEvents, retryableFailures`
  (`governance-export-delivery-policy.mjs:50-58`); there is no dedicated read
  command, so an operator-facing wrapper must persist and print this object
  itself.
- **Decide whether to attempt delivery right now:**
  `planGovernanceExportDelivery({ session, outbox, policy, profile,
  nowEpochMs })` returns a typed `action`
  (`cancelled|exhausted|idle|backoff|rate-limited|deliver`) plus `reason` and
  the current `pending` count (`governance-export-delivery-policy.mjs:119-144`)
  — check `action` before calling `deliverGovernanceExportBatch`.
- **Drive one delivery attempt:**
  `deliverGovernanceExportBatch({ outbox, profile, adapter, batchId,
  maxEvents, attempt })` (`governance-export-delivery.mjs:14`) — a library
  call, not a CLI command, in the current package.

## Incident / recovery procedures

Typed failure codes and their meaning:

- `GEA-PROFILE` — adapter profile failed shape/bound validation
  (`governance-export-adapter.mjs:40`). Not a transient failure; fix the
  profile document.
- `GEA-MAP` — a projection didn't match the active profile (wrong
  profile/format, or a field outside `EXPORT_FIELDS`)
  (`governance-export-adapter.mjs:91`). Indicates a projection/profile
  mismatch upstream.
- `GEA-PAYLOAD-LIMIT` — the mapped payload exceeds the profile's declared
  `maxPayloadBytes` (`governance-export-adapter.mjs:97`). The event is not
  automatically split or retried smaller.
- `GEA-ACK` — an acknowledgement receipt failed validation
  (`governance-export-adapter.mjs:110`); treated as an untrusted transport
  response and the outbox is not advanced.
- `GED-ACK-UNKNOWN` — the destination acknowledged an ID that was never in
  the sent batch (`governance-export-delivery.mjs:22`). Investigate the
  destination/transport before trusting further acknowledgements from it.
- `GEO-DELIVERY` — a malformed or self-contradictory delivery outcome
  (accepted/quarantined ID overlap, or an unknown ID)
  (`governance-export-outbox.mjs:18-19`); the outbox is left unmodified.
- `GEOS-BINDING` / `GEOS-POLICY` — a loaded or persisted outbox's
  `destinationProfile`/`policyRevision` doesn't match what was requested
  (`governance-export-outbox-store.mjs:14,16`). Usually means the policy
  revision changed since the file was last written; recovery is a deliberate
  operator decision, never an automatic migration.
- Outbox write **conflict** (`status: "conflict"`, no thrown error) —
  returned by `persistGovernanceExportOutbox` when the on-disk digest no
  longer matches the expected preimage (`governance-export-outbox-store.mjs:19`).
  This is the concurrent-writer case: re-read the current outbox, re-apply
  the intended delivery outcome against the fresh state, and retry the
  persist; never force-write over a conflict.

Retry/backoff/cancellation is the standing delivery-policy state machine, not
a bespoke incident process: a `retryable-failure` disposition advances
`attempt` and schedules `nextAttemptAtEpochMs` with exponential backoff
bounded by `maxBackoffMs` (`governance-export-delivery-policy.mjs:151-154`);
once `attempt` exceeds `maxAttempts`, `planGovernanceExportDelivery` reports
`action: "exhausted"` and stops planning further sends until an operator
intervenes (`governance-export-delivery-policy.mjs:125`). A process restart
re-admits the session without granting a fresh retry budget
(`restoreGovernanceExportDeliverySession`,
`governance-export-delivery-policy.mjs:78-83`). A deliberate stop is
`cancelGovernanceExportDeliverySession` with a typed reason (`shutdown,
operator, policy-revoked, destination-withdrawn`)
(`governance-export-delivery-policy.mjs:28,86-89`) — cancellation is
terminal; a cancelled session must be recreated, not resumed. Partial
delivery leaves rejected entries `status: "quarantined"`, preserving their
source binding for manual reconciliation rather than dropping them
(`governance-export-outbox.mjs:20`).
