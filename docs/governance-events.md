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

`recover` may rebuild the `heads.json` projection only after the exact terminal
retained checkpoint validates. Its closed recovery request binds an idempotency
key plus exact heads preimage and requested postimage. The writer stores a
write-ahead journal before the projection update and retains a sanitized
receipt after exact readback; an identical replay is zero-write only while the
receipt's postimage still matches. It never changes, removes, or rewrites a
published portable record. A fork, a changed canonical interpretation, or an
authority change requires the later human-ledger disposition flow; it cannot
be repaired by this kernel.

## Restricted machine-local records

`restricted-machine-local` records never enter `governance/events`, bundles,
viewer assets, diagnostics, or ordinary exports.  They live outside the
repository in an owner-only physical root, reject symlink traversal, use a
caller-supplied externally protected AES-256-GCM key, and carry explicit
expiry.  A random local record ID has no portable counterpart or correlation
handle.

The closed local operator surface is:

```text
governance-event restricted plan-put|put|query|plan-erase|erase|plan-destroy-key|destroy-key|status \
  --repo CHECKOUT --request-file REQUEST.json --key-file KEY.bin
```

`plan-*` is read-only and binds the physical repository/store, request
preimages and idempotency key before an operator chooses the mutation.
`status` returns only encrypted record counts, expired-count, and non-secret
key-generation identifiers. A privileged, repository-bound
`restricted-store-operator` HMAC authorization and the external key are
required to read, erase, or destroy a key. Erasure validates an exact encrypted
preimage and proves only absence from the active store; backup status remains
explicitly `unknown`.

`destroy-key` is distinct from erasure. It can destroy only a named absolute
local key file that is separately protected outside both the checkout and the
restricted-record root. It journals the exact key-file digest before unlink,
reads back that the file is absent, and emits a receipt limited to that active
file. It never claims deletion of backups, copied key material, process-memory
remnants, or an external key-custodian record.

## Authority boundary

Only the future Human Governance Decision Ledger may establish human
authority.  Agent and lifecycle events are observational.  No projection,
export, viewer, index, or external integration is accepted by the authority
resolver.

## Human governance decisions

The `human` stream carries only the closed
`pipeline.human-governance-decision.v1` payload. A portable decision records a
non-identifying authority class, assurance, exact repository/candidate/package/
artifact/action/environment scope, stable reason code, policy and rule digests,
validity, and linked lifecycle disposition. It never records a person name,
pseudonym, free-form rationale, command, transcript, private path, or secret.

The canonical lifecycle is `requested`, `granted`, `denied`, `cancelled`,
`consumed`, `revoked`, `expired`, `corrected`, and `superseded`. A grant links
one request; a consuming, revoking, correcting, or superseding record links
the granted decision it disposes. No portable record is rewritten. The resolver
returns authority only for one exact grant whose physical repository and
candidate match, whose validity window contains the evaluation time, and which
has no terminal disposition. Missing, duplicated, stale, cross-repository, or
ambiguous records deny authority.

For restricted attribution or rationale, store the complete decision only via
the separate restricted profile. It has no portable counterpart or join
handle. Erasure and key destruction prove only their documented active-store
boundaries; a missing restricted record can never be reconstructed into
portable authority.
