# Governance events

Phoenix records governance history as three distinct streams below
`governance/events/`: `human`, `agent`, and `lifecycle`.  The stream registry
is repository-bound genesis; event files are the canonical history.  A head or
index is a replaceable projection and never an authority source.

## Portable records

Portable records are closed, public-safe envelope files.  The sanctioned
writer validates the registry and policy bindings before it allocates a
sequence, seals canonical RFC 8785 bytes, links the previous digest, publishes
an individual file atomically, reads it back, and updates `heads.json` last.
It rejects symlinks, unsafe names, altered bytes, cross-repository writes,
forks, and a reused idempotency key with different content.  The exact same
request is a zero-write replay.

The public interface is deliberately file-request based:

```text
governance-event preview --request-file REQUEST.json
governance-event append --repo CHECKOUT --request-file REQUEST.json
governance-event verify --repo CHECKOUT --request-file REQUEST.json
governance-event query --repo CHECKOUT --request-file REQUEST.json
governance-event recover --repo CHECKOUT --request-file REQUEST.json
```

`preview` does not allocate a sequence or event digest.  `append` accepts only
`pipeline.governance-event-append-request.v1`; writer-owned sequence and digest
fields are omitted from its intent.  It returns a sanitized receipt and an
independently retainable checkpoint containing repository, stream, sequence,
event digest, candidate commit, and candidate tree.

`verify` and `query` accept a closed stream request.  Without an independently
retained candidate-bound checkpoint, a valid hash chain is only
`prefix-valid` and its completeness is `unknown`.  It is not gate-capable.
With a matching checkpoint the result is `valid`/`verified`.  Consumers must
not infer completeness from `heads.json` or from a successful query alone.

`recover` may rebuild the `heads.json` projection only after the exact retained
checkpoint validates.  It never changes, removes, or rewrites a published
portable record.  A fork, a changed canonical interpretation, or an authority
change requires the later human-ledger disposition flow; it cannot be repaired
by this kernel.

## Restricted machine-local records

`restricted-machine-local` records never enter `governance/events`, bundles,
viewer assets, diagnostics, or ordinary exports.  They live outside the
repository in an owner-only physical root, reject symlink traversal, use a
caller-supplied externally protected AES-256-GCM key, and carry explicit
expiry.  A random local record ID has no portable counterpart or correlation
handle.

A privileged, repository-bound `restricted-store-operator` authorization and
the external key are required to read or erase a record.  Erasure validates an
exact encrypted preimage and proves only absence from the active store; backup
status remains explicitly `unknown`.  Key destruction is a separate
key-management operation and must never be claimed by an erase receipt.

## Authority boundary

Only the future Human Governance Decision Ledger may establish human
authority.  Agent and lifecycle events are observational.  No projection,
export, viewer, index, or external integration is accepted by the authority
resolver.
