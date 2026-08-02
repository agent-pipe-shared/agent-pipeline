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
