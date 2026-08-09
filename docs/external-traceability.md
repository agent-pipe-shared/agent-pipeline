# External traceability

The external-reference core carries only provider-neutral, sanitized metadata:
system class, adapter profile, object identifier, relationship, ownership,
external revision, freshness, and a digest-bound Pipeline artifact. Provider
coordinates and credentials stay in the adapter's approved machine-local
configuration and are never put in portable references, diagnostics, or audit
bundles.

An external write is allowed only for a `pipeline-owned`,
`pipeline-to-external`, `controlled-publication` reference when the named
adapter declares inspection, preview, apply, and readback support. The
controller requires a fresh expected revision, an exact opaque preview digest,
an authority result bound to the request and plan, idempotent apply, and a
matching sanitized readback. Changed revisions, ownership conflicts, deleted
or stale targets, unsupported capabilities, and mismatched readback result in
typed conflict or reconciliation states, never a success claim.

External data is untrusted observation data. It cannot execute commands,
alter Pipeline lifecycle, or establish human authority. Provider-specific
fields remain inside the adapter profile; they are not added to this core
contract.

## Closed relationship meanings

Portable references use explicit relationship semantics rather than treating a
link as authority. The normative values are `tracks`, `specifies`,
`implements`, `documents`, `mirrors`, `reviews`, `evidences`, `releases`, and
`supersedes`. Legacy-compatible `relates-to`, `evidence-for`, and
`published-from` retain their previous narrow meaning. Unknown relation names
are rejected rather than coerced into prose or a generic completion state.

The relation never changes the separate authority direction, ownership class,
publication mode, or freshness state. In particular, a `reviews` or
`evidences` link cannot satisfy a Critic result, approve a plan, or authorize a
release; a `releases` link is only a traceability observation unless a separate
candidate-bound release authority says otherwise.

## Reconciliation observation

`reconcileExternalReference` performs a read-only adapter inspection for the
bound object ID. A matching fresh revision returns `current`; changed revision,
deleted/moved/stale/inaccessible state, or malformed inspection returns a typed
`reconciliation-required` result. The result carries only the same sanitized
reference metadata and never imports external status as a Pipeline transition,
approval, Critic result, or release authority. Persisting operational
reconciliation queues, if configured later, remains a separate non-authority
cache rather than a second canonical record.

## Read-only operator preview

`external-reference.mjs` is deliberately a local preview and reconciliation
surface, not a generic network client. It accepts closed, repository-relative
JSON fixtures for a reference, adapter capabilities, desired owned-field
digests, and the adapter's sanitized inspection/preview observations. It never
receives credentials, provider endpoints, raw external content, or a command
to apply a write.

```sh
node plugins/pipeline-core/scripts/external-reference.mjs preview \
  --root . \
  --reference evidence/reference.json \
  --capabilities evidence/adapter-capabilities.json \
  --desired evidence/owned-fields.json \
  --inspection evidence/inspection.json \
  --preview evidence/preview.json
```

An adapter implementation must still perform the separately authorized
apply/readback lifecycle through `applyExternalReferenceWrite`. Its authority
resolver is the future Cyborg human-attestation integration seam; neither this
operator preview nor any external status can grant that authority.

## Threat model

**Assets:** the reference's ownership/freshness classification, the
canonical `pipelineArtifact` binding (`path`+`sha256`), and any in-flight
write plan (`previewDigest`, `planSha256`).

**Threats considered and their mitigation:**
- A write plan being executed against a stale or ambiguous canonical
  artifact — `planExternalReferenceWrite` resolves the artifact's sole
  canonical identity via `bindCanonicalArtifactIdentity`
  *before* any external contact, and rejects
  (`reason: "canonical-identity"`) unless exactly one validated binding
  comes back (`external-reference-adapter.mjs:59-60`).
- A write being applied against a target that moved/changed underneath the
  plan — `planExternalReferenceWrite` requires the freshly inspected
  `target.revision`/`target.state` to match `ref.externalRevision`/`"fresh"`
  before producing a plan, else it returns `status: "conflict", reason:
  "revision-or-ownership"` (`external-reference-adapter.mjs:62`).
- A forged or replayed authority/apply/readback response being accepted —
  `applyExternalReferenceWrite` requires the plan's own recomputed
  `planSha256` to match, then a `granted: true` authority bound to that
  exact `requestId`/`planSha256`, then an `apply` result, then a `readback`
  whose `appliedDigest` equals `canonicalSha256(plan.changes)`; any mismatch
  at any stage returns `rejected`/`reconciliation-required` rather than a
  success (`external-reference-adapter.mjs:81,86-88`).
- A write escaping the narrow write-eligible case — writes are only
  attempted when `mode === "controlled-publication"`,
  `authorityDirection === "pipeline-to-external"`, `ownership ===
  "pipeline-owned"`, and the adapter declares all of
  `inspect/preview/apply/readback`; anything else returns `status:
  "rejected", reason: "capability-or-policy"`
  (`external-reference-adapter.mjs:56`).
- Non-idempotent double-apply — `applyExternalReferenceWrite` accepts either
  `"applied"` or `"idempotent"` from the adapter's `apply` result as
  success, so a retried apply against an already-applied change is expected
  to be handled by the adapter rather than silently reapplied by this module
  (`external-reference-adapter.mjs:87`).

**Out of scope:** the correctness/security of the adapter's own `inspect`,
`preview`, `apply`, `readback`, and `authorize` implementations —
this module only validates their *shapes* and reactions, not their internal
behavior against the real external system.

## Ownership and lifecycle mapping

Every reference carries an explicit `ownership` class — one of
`pipeline-owned, external-owned, projection-only,
independently-maintained, unsupported`
(`external-reference-adapter.mjs:7`, `OWNERSHIP`). Only `pipeline-owned`
references may ever be the target of a Pipeline-initiated external write
(`external-reference-adapter.mjs:56,62`); every other class is read/observe
only through this module. `desired.changes[].ownership` must also be
`pipeline-owned` for every proposed field change, or the plan is rejected as
a conflict (`external-reference-adapter.mjs:62`) — a reference cannot
acquire write eligibility for a field it does not already own.

A reference's lifecycle state is tracked through `freshness.state`, one of
`fresh, stale, deleted, moved, merged, duplicated, inaccessible,
out-of-order` (`external-reference-adapter.mjs:7`, `FRESHNESS`). This state
is never set by local intent; it is only ever produced by re-inspecting the
external system through the adapter's `inspect` operation and folding the
observed `state`/`revision` back into the reference
(`reconcileExternalReference`, `external-reference-adapter.mjs:72,76`). A
state other than `fresh` routes a write attempt to
`reconciliation-required` or `conflict` rather than proceeding
(`external-reference-adapter.mjs:61-62`).

## Publication guide

Publication is a two-phase preview/apply flow; there is no single-step
"publish" function:

1. **Preview.** `planExternalReferenceWrite({ reference, capabilities,
   desired, inspect, preview, resolveIdentity })`
   (`external-reference-adapter.mjs:54`) validates capability/policy
   eligibility, resolves the canonical artifact identity, calls the
   adapter's `inspect` to confirm the target is still `fresh` at the
   expected revision, then calls the adapter's `preview` to obtain an exact,
   opaque `previewDigest` for the proposed changes. On success it returns
   `status: "preview"` with a `plan` object bound by its own `planSha256`
   (`external-reference-adapter.mjs:64-65`). Nothing external is mutated by
   this phase.
2. **Apply.** `applyExternalReferenceWrite({ plan, authorize, apply,
   readback })` (`external-reference-adapter.mjs:80`) is the only function
   that may cause an external mutation. It re-verifies the plan's own
   digest, requires an external `authorize` grant bound to the exact plan,
   calls `apply` with the plan's `expectedRevision`/`previewDigest`/`changes`,
   and requires a `readback` observation whose `appliedDigest` matches
   `canonicalSha256(plan.changes)` before returning `status: "applied"`.
   Any deviation returns `rejected` (bad/missing authority) or
   `reconciliation-required` (bad apply or readback), never a partial
   success (`external-reference-adapter.mjs:86-89`).

The CLI/preview script (`scripts/external-reference.mjs`, shown above) only
ever exercises the read-only preview surface — it "never receives
credentials, provider endpoints, raw external content, or a command to apply
a write" (existing "Read-only operator preview" section above). Driving the
`apply` phase operationally is a caller/adapter integration responsibility,
not something exposed by that script.

## Recovery procedure

`reconcileExternalReference({ reference, capabilities, inspect })`
(`external-reference-adapter.mjs:69`) is the supported recovery/observation
path: it returns `status: "current"` only when the adapter's fresh
inspection matches the reference's recorded revision and `"fresh"` state;
otherwise it returns a typed `status: "reconciliation-required"` with
`reason: "freshness"` or `"revision"` (`external-reference-adapter.mjs:74-76`),
or `status: "rejected", reason: "capability"` if the adapter lacks the
`inspect` operation (`external-reference-adapter.mjs:71`). None of these
paths import external state as a Pipeline transition, approval, or release
authority (existing "Reconciliation observation" section above).

**KNOWN GAP — unreachable/offline external system is not a typed outcome.**
Both `planExternalReferenceWrite` (`external-reference-adapter.mjs:61`) and
`reconcileExternalReference` (`external-reference-adapter.mjs:72`) call
`await inspect(...)` with no surrounding `try`/`catch`. If the adapter's
`inspect` implementation throws — the expected behavior for a network
timeout, DNS failure, or otherwise offline/unreachable external system —
that exception propagates uncaught out of both functions instead of
resolving to a typed `reconciliation-required` (or a dedicated
"unavailable") result. This is a direct shortfall against **X-AC-14** ("IF
an external system is offline or unavailable, THEN THE SYSTEM SHALL
preserve canonical local operation and authority and expose the external
observation/reconciliation gap"): canonical local operation is not disturbed
by the throw, but the "exposed gap" is an uncaught exception, not a typed,
handleable result. This gap is filed as backlog item
`pipeline.external-reference-adapter-has-no-typed-response-to-an-unreachable-external-system`.
Until it is fixed, any caller of `planExternalReferenceWrite` or
`reconcileExternalReference` must wrap the call in its own `try`/`catch` to
recover from an offline destination; do not assume a typed result is always
returned.

## Conformance suite

The registered conformance suite is
`plugins/pipeline-core/lib/external-reference-adapter.test.mjs`, test
`"X-AC-12 proves one provider-neutral core contract across issue-tracker,
knowledge-base, document-store, and secondary-forge profiles"`
(`external-reference-adapter.test.mjs:191`), which runs the same
preview/apply/reconcile contract against four synthetic adapter profiles —
`synthetic-issue-tracker`, `synthetic-knowledge-base`,
`synthetic-document-store`, `synthetic-secondary-forge`
(`external-reference-adapter.test.mjs:193-196`) — to prove one shared core
contract rather than one contract per provider. Additional scenario coverage
(forged authority rejection, conflict/reconciliation paths) lives in the
same file, e.g. lines 150-154.
