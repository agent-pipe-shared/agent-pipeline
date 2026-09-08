# C1 invocation/review source projection — implementation contract

2026-09-08. Bounded first implementation slice of `plans/c1-emission.md` step 1,
under approved #103. This document fixes the invocation/review adapter contract;
usage acquisition, receipt emission, storage/reporting, authentic collection and
baseline qualification remain required later parts of the same deliverable.
No standalone projection result is a receipt or proof of live collection.

## Exact ownership

Add `plugins/pipeline-core/lib/interruption-source-adapter.mjs`. Extend the
existing registered C1 suite
`plugins/pipeline-core/lib/interruption-receipts.test.mjs` with this module's
source-ingestion/join behavior. That suite already covers C1 invocation joins,
binding, privacy and unknown handling; byte-boundary tests exercise the same
new adapter in that suite. No new suite/exclusion/registration edit is needed
for this bounded ownership. Do not put unrelated tests there or modify existing
assertions to accommodate the adapter. Later store/CLI suites use the sanctioned
registration route.

Keep `interruption-receipts.mjs`, source validators, registry, hooks, manifests,
Verify controls and installed plugins unchanged. Reuse owning validators and
`parseStrictJson` from `lib/governance-event.mjs`. Usage stays in a later separate
read-only I/O adapter: `ingestRunnerUsage` reads shipped schemas at import and
an exact local route receipt during binding, so importing it here would violate
the pure boundary.

## Closed callable contract

Export only `projectC1SourceJoins(input)`. It is synchronous and performs no
file/process/environment/network/clock access, including via imports.

Input has exactly these required keys:

```text
{ invocationBytes, reviewBytes, currentCandidate, coverage }
```

- `invocationBytes`: null or exact UTF-8 string/Buffer/Uint8Array containing
  exactly `{request,attempts,sandboxDisposition}`. Request is the full existing
  invocation request; attempts is the complete owning ordered chain; disposition
  is null or the full owning selected-sandbox disposition record.
- `reviewBytes`: null or the same byte types containing a complete nonempty
  oldest-to-newest array accepted by `validateCriticReviewHistory`.
- `currentCandidate`: existing C1 `{commit,tree}` or null. Both full OIDs have
  the same length (40 or 64), lowercase. Non-null review input requires a
  non-null candidate equal to the final review record's candidate. Earlier
  candidates may differ as permitted by the owner's correction transitions.
- `coverage`: exactly `{invocations,reviews}`, each the existing C1 Status.
  These are explicit caller assertions about collection through the receipt
  cutoff, not authenticity discovered by parsing. The eventual live collector
  owns their qualification. Null bytes require unknown/unavailable coverage;
  present full valid source may retain any supplied Status. Missing bytes must
  never become measured empty. This adapter accepts no partial chain mode.

Success is exactly `{ok:true,code:null,projection}`; failure is exactly
`{ok:false,code,projection:null}`. No partially accepted joins or rejected values
are returned. Diagnostics are a closed enum:

`C1J-SHAPE | C1J-LIMIT | C1J-JSON | C1J-INVOCATION | C1J-REVIEW |
C1J-BINDING | C1J-PRIVACY`.

Map source-validator failure to its corresponding invocation/review diagnostic;
never pass arbitrary exception text through. Limit errors describe only the
closed code, not a private input length/path. Binding covers coverage/absence,
current-review candidate, disposition/request digest and duty disagreements.

Projection has exactly:

```text
{
  joins: { invocations: InvocationRow[], reviews: ReviewRow[] },
  coverage: { invocations: Status, reviews: Status },
  binding: { candidate: Candidate|null },
  sourceSha256: { invocation: Digest|null, review: Digest|null }
}
```

Rows are the exact existing C1 shapes. Sort invocation rows by invocationId then
attemptId, review rows by reviewId using deterministic ASCII comparison. Validate
full source history in original order before sorting projections. Owning
validators reject invalid duplicate identities/chains; do not erase duplicates
before validation to make an invalid full history pass. Repeated whole calls
produce identical values, and output mutation cannot affect input or later calls.
No new repair identity or receipt/aggregate family pin is introduced.

## Byte and object boundary

Snapshot the small input/context objects using own data descriptors before
reading values. Reject custom prototypes, accessors, symbols and extra keys;
do not invoke coercion, getters or caller iterators. Accept plain/null-prototype
context objects. Byte inputs must be actual accepted byte types, not arbitrary
objects, arrays, ArrayBuffers or objects with conversion methods. Copy bytes
once before hashing/parsing so the result uses one snapshot.

Limit each non-null document to 1 MiB UTF-8, the call to 16 MiB, and source JSON
container nesting to 64 before invoking the recursive strict parser. Depth 64
is a new full-source boundary, not a change to the existing per-receipt depth
16. Scan nesting with correct JSON string/escape handling; quoted brackets do
not consume structural depth. Source validators retain their own cardinality
limits (256 invocation attempts and REVIEW_LIMITS.criticRounds+1 reviews).

Reject malformed UTF-8, raw/unescaped or escaped lone Unicode surrogates, BOM,
duplicate JSON keys at every depth, trailing content and nonfinite JSON values.
String inputs must not silently replace malformed surrogates during UTF-8
encoding. Reuse `parseStrictJson` after prebounds rather than implementing a
second JSON parser. Unsupported input type -> SHAPE; byte/nesting exhaustion ->
LIMIT; invalid JSON/UTF-8 -> JSON. Source document exact-root errors belong to
the corresponding source diagnostic. Hash the exact accepted original bytes
with SHA-256; whitespace changes this raw digest while existing semantic record
digests and projected rows retain their owning behavior.

## Owning validation and projection

Invocation: call `validateInvocationChain(request,attempts)` on the full source.
Project only invocationId, attemptId, requestSha256, previousSha256,
recordSha256, invocationResolutionKey. If disposition is null, key is null.
If present, call `validateSelectedSandboxDisposition`, require its owning digest
equals request.sandboxDispositionSha256 and duty equals request.duty, then call
the existing `invocationResolutionKey(request, disposition.fingerprint)`.
Do not accept a free-form fingerprint object. Do not reimplement admission or
require available-attested status just to observe a failed invocation. The
projection neither resolves a sandbox nor launches/retries a child.

Review: call `validateCriticReviewHistory` on the full ordered source. Project
only reviewId, parentReviewId, previousSha256 and recordSha256. Bind the supplied
current candidate to the last validated record, retaining permitted predecessor
differences. Invocation subject is an owning kind/digest, not a candidate object;
do not invent a mapping from it to commit/tree. Invocation-to-current-candidate
authenticity must come from the actual later orchestrator context.

Only existing public logical identity fields enter projected rows. Apply the
same C1 ID syntax and recognizable-credential exclusion to every exposed ID;
unsafe exposed identity -> C1J-PRIVACY, not a guessed replacement. Raw commands,
paths, source findings, lane/provider/session identifiers, fingerprints and
native usage never appear in output or diagnostics. Valid private source fields
may be validated internally and omitted; they are not copied by object spread.

## Required behavioral checks

Use actual owning constructors/fixtures, not monkeypatched successful validators.
Test valid invocation chain + bound disposition key; absent disposition null;
invalid/full-source digest, predecessor, duplicate identity, disposition binding
and duty mismatch; observation of nonavailable disposition without admission.
Test valid review root and correction history with changed current candidate,
wrong final candidate, missing predecessor, duplicate/reordered history and
missing candidate. Preserve all source validators' failure decisions.

At this same callable boundary test duplicate keys at nested depths, trailing
data, BOM, malformed UTF-8, raw and escaped lone surrogates, supported byte
types, parsed-object/accessor rejection without getter invocation, byte/depth
limits, quoted/escaped brackets, exact raw byte hashes, deterministic rows,
output isolation, unsafe source IDs, omitted private fields, null/unknown versus
measured empty invocation chain, and explicit non-measured coverage retention.
Compose projected rows into an existing valid C1 receipt fixture and validate it;
the fixture supplies real synthetic observation/scope/binding, never production
fabricated facts. Assert no I/O during import/call without weakening old tests.

Required commands: existing C1 receipt suite, consumer-safe-paths suite and
`git diff --check`. Preserve actual tool output evidence. Full Verify remains
red for the previously diagnosed independent failures; direct green checks are
not whole-candidate acceptance. Independent T1 review remains required when the
deterministic gate is green. No receipt emission, baseline start, feature close
or push follows from this source-projection increment.
