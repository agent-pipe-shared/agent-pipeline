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
`consumed`, `revoked`, `expired`, `corrected`, and `superseded`. A grant,
denial, or cancellation links one request; every consuming, revoking, expiry,
correcting, or superseding record links exactly the granted decision it
disposes. The event outcome is closed and must match the event (`requested`
uses `pending`). No portable record is rewritten. The resolver
returns authority only for one exact grant whose physical repository and
candidate match, whose validity window contains the evaluation time, and which
has no terminal disposition. Missing, duplicated, stale, cross-repository, or
ambiguous records deny authority.

For restricted attribution or rationale, store the complete decision only via
the separate restricted profile. It has no portable counterpart or join
handle. Erasure and key destruction prove only their documented active-store
boundaries; a missing restricted record can never be reconstructed into
portable authority.

## Human ledger: migration

Honesty note: no migration tooling or schema-version transition path exists
for the human ledger. `plugins/pipeline-core/lib/governance-event.mjs:11`
defines exactly one envelope schema, `pipeline.governance-event-envelope.v1`,
and the human stream accepts exactly two payload schemas,
`pipeline.human-governance-decision.v1` and
`pipeline.human-role-exception-decision.v1` (`governance-event.mjs:170`) —
there is no `v2` variant, no schema-upgrade script, and no code path in
`governance-event-store.mjs` or `human-governance-ledger.mjs` that rewrites,
reinterprets, or converts an already-published event. A change to the schema
itself would be a new schema id, not an in-place migration of existing
records — consistent with the append-only, never-rewritten guarantee stated
above ("No portable record is rewritten."). This document does not claim a
migration procedure that does not exist.

## Human ledger: retention

`governance/events/capture-policy.json` declares
`"retention": "repository-retained"` for the human stream (the same value
used for the agent and lifecycle streams), and the envelope's
portable-policy-coherence check enforces `retentionCompatibility ===
"repository-retained"` for every portable human decision
(`plugins/pipeline-core/lib/governance-event.mjs:194`). A granted, denied,
or disposed decision is retained for as long as the repository and its Git
history retain the file under `governance/events/human/`;
`appendPortableGovernanceEvent` never deletes or overwrites a canonical
record (`plugins/pipeline-core/lib/governance-event-store.mjs:629-663`). The
only shorter- or differently-retained store is the restricted-machine-local
profile described above, which carries its own explicit `expiresAtEpochMs`
and is a separately profiled attribution/rationale record, not the decision
itself, with "no portable counterpart or join handle."

## Human ledger: recovery

The interrupted-write recovery documented above ("Portable records",
`recover`) applies to the human stream unmodified — it is one shared code
path, not stream-specific. Concretely: `writeAtomic` stages every appended
decision to a temporary file before an atomic rename
(`plugins/pipeline-core/lib/governance-event-store.mjs:445-463`); a crash
between those two steps leaves an orphaned temp file that the reader ignores
(`governance-event-store.mjs:419`) and that the next append removes
automatically under the stream's exclusive lock
(`governance-event-store.mjs:561-566,572`). This exact behavior is pinned
for the human stream by
`plugins/pipeline-core/lib/human-governance-ledger.test.mjs:385-392` ("an
append recovers from an orphaned temporary file left by an earlier
interrupted write").

The human ledger's single-use grant consumption adds one more recoverable
race: `appendConsumedHumanGovernanceDecision` re-reads the live stream under
the same append lock via its `assertAppend` closure
(`plugins/pipeline-core/lib/human-governance-ledger.mjs:205-224`) and
re-resolves authority before the consuming event is sealed, so a second
concurrent consumption attempt against an already-consumed grant fails
closed (`HGL-CONSUME-NOT-LIVE`, `human-governance-ledger.mjs:222`) rather
than double-spending the grant.

As stated above, a corrupted or forked canonical chain has no automated
repair and "requires the later human-ledger disposition flow." Honesty
note: that disposition flow does not yet exist as runnable code in this
repository, so a corrupted human-stream chain segment has no documented
repair procedure beyond discarding and rebuilding history outside this
module; this document does not claim otherwise.

## Human ledger: operator guidance

Inspecting the human decision stream uses the same shared surface as any
other stream, scoped by `streamId: "human"`:

```text
node plugins/pipeline-core/scripts/governance-event.mjs query --repo CHECKOUT --request-file REQUEST.json
node plugins/pipeline-core/scripts/governance-event.mjs verify --repo CHECKOUT --request-file REQUEST.json
```

(`plugins/pipeline-core/scripts/governance-event.mjs:42-53`.) `query`
returns validated decisions only after chain verification
(`queryHumanGovernanceDecisions`,
`plugins/pipeline-core/lib/human-governance-ledger.mjs:228-231`), never raw
file contents. For the human-facing approval action itself (not ledger
inspection), see `docs/po-human-approval.md`; that document is the
operator/human guidance for signing, while this section is the operator
guidance for reading back what was signed.
