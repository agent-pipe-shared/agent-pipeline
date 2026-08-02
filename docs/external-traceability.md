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
