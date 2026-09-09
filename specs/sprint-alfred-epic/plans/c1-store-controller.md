# C1 store and Critic-preflight controller composition

Implementation plan, 2026-09-08; ALFRED-C1-STORE-COMPOSITION-DESIGN.
Source projection is implemented at `125a2d160ac7b3c4d16979ed4cfbe305a98f8ed5`;
this store/controller remains pending. Full Verify candidate
`96238c3c1b811dc69e5d5631de67f223a6853046` finished red at 499/508. No
emission, review or baseline claim is made.

The bounded host primitive results are recorded in
[c1-store-primitives-2026-09-08.json](../evidence/c1-store-primitives-2026-09-08.json)
with the accompanying [narrative](../evidence/c1-store-primitives-2026-09-08.md);
they cover four primitive checks only, not full store qualification.

## 1. Decisions and scope

Use synchronous controller-owned persistence. The existing synchronous producer
receives a bounded capture callback; that callback snapshots the source and actual
observation clock only. After the producer returns or throws, the controller
qualifies scope and synchronously flushes the captured observation, then reproduces
the original CLI stdout/stderr/exit. It never passes an async store to a synchronous
callback, awaits an arbitrary Promise, or lets a telemetry exception replace the
producer result. Telemetry latency is additional, bounded filesystem work; this
does not promise identical timing.

The store implementation must lazily read the fixed plugin asset
`plugins/pipeline-core/config/interruption-registry.v1.json` through its module
location, never a consumer `policies/` fallback. It must enforce regular
file/no-symlink checks, bounded UTF-8/strict JSON at 16 KiB, the exact packaged
byte digest `a37b5ab200f0b88cae6e45adb8befa4e273a8949494197d2958d01df094e23e9`,
the full canonical registry digest
`888b6d7942c6a99e97b79e492156d0388d65e5f8cff63b5c6560dfe44069a982`, the
frozen family digest `e60c80dd242b9d4dde5fd3b035b4ad56671c10117568f82b31d77d430fe12ff5`,
and all nine rules. No manifest asset mutation or consumer-root fallback is
introduced. Missing, unsafe, malformed or mismatched asset returns C1S-REGISTRY
with null identity/digest/output fields.

Factory construction remains lazy and performs no I/O. Reads that require the
registry must also pass the existing `validateInterruptionRegistry` success
check. `C1S-REGISTRY` never becomes a platform failure, and `WriteResult.coreCode`
remains null; an absent-store read that does not need registry validation may
return the established `C1S-NOT-FOUND` result without acquiring the asset.

Deliver a real, separately named observed controller:
`plugins/pipeline-core/scripts/observe-critic-preflight.mjs`.
The original `critic-dispatch-preflight.mjs` direct CLI stays read-only and retains
its current protocol. Its exported producer gains the optional internal callback.
This explicitly refines the earlier observer proposal's automatic direct-CLI
storage wiring: adding the separate observed command avoids silently turning the
existing read-only command into a writer. The new command actually invokes that
same producer; an unavailable-only bare CLI is not the delivery criterion.

No source JSON imports, model-selected facts, expected-gate flags, user-selected
coverage, arbitrary output paths, native launch, guard reevaluation, human writer,
registry change, or new repair/authority identity enters this slice. Store I/O
does not enter the pure receipt or source-projection modules. Initial facts remain
empty, classification/category and state remain unknown, and joins remain empty
with unknown coverage. This slice supports one observed producer, not all four
interruption classes or all seven observer families.

## 2. Concrete caller, operation retention and CLI

The observed command has exactly these subcommands:

- `create --root ROOT --spec REPO_SPEC`: resolve the real owner and spec, create
  one immutable local operation definition, return the CreateResult below on
  stdout plus newline; stderr empty. Exit 0 on creation, 2 on collection failure.
  This is ordinary local bookkeeping, not a new approval or launch gate.
- `run --root ROOT --operation OPERATION_ID -- BASE_PREFLIGHT_ARGS`: the suffix
  is the existing preflight argv except --root, which the controller supplies
  from its own resolved invocation root. It includes the existing --base,
  --candidate, --spec, repeated --guardrail/--evidence, optional --prior-critic.
  The controller loads the retained operation from this root, captures one real
  call to preflightCriticDispatch, then flushes. Stdout/stderr/exit are exactly
  the existing producer CLI's packet-ready/rejected protocol. A collection
  failure goes through collection metadata/result ports, never an extra line
  or a different preflight exit. Invalid wrapper syntax exits 2 with the closed
  ControllerFailure below before any producer call.
- `status --root ROOT --operation OPERATION_ID`: load and validate the retained
  definition and its committed entry chain; return OperationResult below.
  Exit 0 for a readable operation, 2 for a collection failure. No source call.
  A missing selector is not replaced with the newest operation.

Expose the existing parser as parseCriticDispatchPreflightArgs(argv) without
changing its flag checks; both old and observed CLI controllers call it.
The observed module exports runObservedCriticPreflight({root,operationId,argv},
ports=productionPorts) -> {exitCode,stdout,stderr,collection}; stdout/stderr are
the exact original producer-protocol strings, collection is a WriteResult.
The run direct branch writes only those strings and sets that exitCode.
Production ports are the shared parser/producer, observer qualifier, store factory,
clock and randomId. No JSON selects an implementation.

For each actual run, the controller generates one safe existing-C1 eventId and
retains it with that one immutable source capture in the internal handoff
{eventId,observation}. No CLI/model flag supplies it. Publication retries reuse
that ID and exact captured bytes; distinct actual producer calls get distinct
IDs even if their code and timestamp coincide. Completion/diagnostic controlIds
are similarly generated once per captured control write. Store methods do not
mint a fresh event ID on each retry. If a crash loses a capture, a new actual run
gets a new event; loading its operation still recovers any committed lineage.
This is existing immutable observation identity, never a repair ID.

The create command's public operationId is the selector the caller retains.
After a process restart, run reloads its actual immutable definition and committed
chain. The caller never supplies a lineage ID, onset, event ID, scope object or
source result. A selector is a lookup key, not authenticated context or authority.
A selector from another store fails binding. The local root's validated definition
and current owner/spec correlation supply context.

A concrete two-attempt flow is create -> run(rejected) -> process exits ->
run(same operationId, rejected). This produces two immutable event IDs with one
retained lineage. A later separate operation is created explicitly and acquires a
different lineage on its first qualified rejection. No code/spec/candidate
signature groups unrelated operations.

Create records the explicit local operation kind `critic-preflight`, whose
concrete goal is to prepare that producer's packet input. A rejection prevents
that particular operation from completing. The controller may therefore assign
the episode handle at its first qualified rejection, without a preexisting
native handle, PO signature or human ceremony. It does not infer whether a
lifecycle gate was expected or which interruption class applies. Preserve
firstObservedAt as unknown in this conservative first slice: the exact onset of
blocked lifecycle progress was not established. observedThroughAt is the captured
result-observation time and may be measured.

Packet-ready publishes an operation-complete control entry, but emits no receipt,
resolution, recovery or terminal fact. It closes the local operation association,
not the interruption's C1 state. Reuse of a completed operation yields a collection
binding diagnostic; the real preflight still runs unchanged. A new operation must
be explicitly created. No automatic begin-on-missing/closed-handle behavior.

The production CLI is the actual delivery route, not merely a fixture wrapper.
User/reference documentation must name create/run/status and show selector reuse.
Ordinary library callers can use the same controller API, but no existing Nova
authority caller is silently redirected in this increment.

## 3. Public schemas and synchronous API

All records below have exactly the listed keys, including nullable keys. Reuse
existing C1 Id/Digest/Candidate/Scope/Time and status rules. Reject accessors,
symbols, extra keys, custom prototypes and coercion at callable boundaries.
Byte ingestion reuses parseStrictJson with prior UTF-8, byte and depth checks.
Diagnostics never echo a rejected value, OS message, path, selector or command.

Store module exports:

```text
createInterruptionStore({root}, ports = productionPorts) -> Store
Store.createOperation({context}) -> CreateResult
Store.recordPreflight({handle, eventId, observation}) -> WriteResult
Store.recordCompletion({handle, controlId, source, observedAt, context}) -> WriteResult
Store.recordDiagnostic({handle, controlId, code, observedAt}) -> WriteResult
Store.readOperation({operationId}) -> OperationResult
Store.readSnapshot({window, scope}) -> SnapshotResult
Store.publishReport({snapshot}) -> ReportResult
```

Factory input is one actual local routing parameter; root is never emitted.
Factory does not acquire telemetry authority from a JSON configuration. Production
ports are fixed code. Internal tests may substitute the closed port groups:
`io` (lstatSync, realpathSync, openSync, fstatSync, readSync, writeSync, fsyncSync,
closeSync, mkdirSync, linkSync, unlinkSync, rmdirSync, opendirSync, statfsSync),
`clock()` -> C1 Time, `randomId()` -> an adapter-generated safe logical Id,
and `platform({root})` -> {status:"eligible"|"unsupported",backendId:null|
"linux-node24.15.0-ef53-v1"}. Section7 defines the exact production predicate.
This is internal implementation eligibility, not full storage qualification.
Unsupported always has backendId:null; no CLI/caller assertion can override it.
Use Node fs constants from the module. No shell or child process is a store port.
Real filesystem tests use real io; failure tests replace only the relevant
operation/phase and are labeled injected. Parent dirs are not caller-selected.

Context is the detached result of the actual observer owner-correlation path:
```text
Context = {scope, ownerBinding}
ownerBinding = {stateSha256, continuityRevision, specSha256, specPathSha256}
Handle = {storeId, operationId, operationSha256}
CreateResult = {schema, ok, code, handle}
OperationResult = {schema, ok, code, operation}
OperationView = {
 handle, operationKind, status, scope, specSha256,
 lineageId, firstObservedAt, headEntrySha256, sequence
}
WriteResult = {
 schema, status, code, coreCode, eventId, lineageId, entrySha256
}
SnapshotResult = {schema, ok, code, snapshot}
ReportResult = {schema, status, code, reportSha256, output}
output = null | {json, text}
ControllerFailure = {schema, status:"rejected", code}
```

`specPathSha256` is the SHA-256 of normalized repository-relative spec path
UTF-8 bytes with no newline; state/spec digests are lowercase 64-character
SHA-256 values and continuityRevision is a safe integer. For `created|replayed`,
`code` is null, `reportSha256` is the exact complete `report.json` byte digest,
and output contains detached UTF-8 strings from final validated immutable
`report.json` and `report.txt` readback. Existing 16 MiB JSON and 256 KiB text
limits apply. Failure leaves output and digest null. The report CLI prints only
the selected stored bytes according to its closed format flag; it does not
invoke a second renderer or reopen a caller path. Publication/readback failure
emits the existing closed stderr and exit 2.

Literal schemas are respectively:
`pipeline.interruption-store-create-result.v1`,
`pipeline.interruption-store-operation-result.v1`,
`pipeline.interruption-store-write-result.v1`,
`pipeline.interruption-store-snapshot-result.v1`,
`pipeline.interruption-store-report-result.v1`,
`pipeline.observed-critic-preflight-result.v1`.
Store identity and operation identity are locally generated public logical IDs;
they carry no provider or session meaning.

CreateResult/OperationResult/SnapshotResult use ok true/code null/non-null payload,
or ok false/closed code/null payload. WriteResult.status is
`created|replayed|not-applicable|unavailable|rejected`; success has code/coreCode
null. Non-receipt control writes have eventId null; lineageId is nullable.
Failures have all identity/digest outputs null, avoiding partial qualification.
coreCode is null except C1S-RECEIPT/C1S-AGGREGATE, where it is one existing closed
C1 core diagnostic; no arbitrary exception inspection.
ReportResult.status is `created|replayed|unavailable|rejected`.
OperationView.status is `open|observed|completed`; sequence is integer revision
metadata, not an untagged behavioral metric.

Closed store codes:
`C1S-SHAPE|C1S-ROOT|C1S-PLATFORM|C1S-LOCKED|C1S-INCOMPLETE|
C1S-LIMIT|C1S-IO|C1S-NOT-FOUND|C1S-BINDING|C1S-CONFLICT|
C1S-CORRUPT|C1S-RECEIPT|C1S-AGGREGATE|C1S-COVERAGE|C1S-REGISTRY`.
Observer diagnostics retain the prior proposal's closed C1O enum. Diagnostic
control bodies permit exactly those C1O/C1S codes; unknown codes are rejected.
Wrapper syntax uses C1S-SHAPE. No string-to-authority mapping is introduced.

For clarity, `context` and `observation` are internal program values. Store
validation proves their consistency; it does not authenticate arbitrary matching
JSON. There is no CLI command accepting them. Authentic acquisition is established
only by the shipped controller calling the actual producer and owner readers.

## 4. Observer reconciliation and exact hashes

The producer boundary invokes only a trusted synchronous callback and ignores
its return without reading `then`, getters or assimilating a Promise. Synchronous
callback throws are isolated from the original producer result/error. Production
callbacks do not schedule asynchronous telemetry; this contract makes no claim
to contain independently scheduled rejection or arbitrary callback side effects.

Retain Source and the complete 19-code/stage matrix from the reconciled
[C1 preflight observation plan](c1-preflight-observation.md). The scratch
observer proposal is historical design evidence. Replace its handleProvider/publish split and receiptInput return with
capture then store.recordPreflight. The controller retains the event identity;
the store allocates/reuses lineage and constructs the receipt in the publication
transaction, so association cannot be lost between
two independent handoffs.

```text
capture(Source) -> {ok,code}                 // one bounded slot, synchronous
qualifyCriticPreflightObservation({
 source, observedAt, root, specPath
}) -> {ok,code,observation}
Observation = {
 schema:"pipeline.critic-preflight-local-observation.v1",
 source, observedAt, scope, actor:{runner:null,role:null}, ownerBinding
}
```

Capture accepts at most one completed source per call; a missing or duplicate
callback, Promise return or invalid source is a closed C1O-SOURCE collection
failure. The producer's original result/throw remains intact. Clock failure gives
unknown Time; invalid clock input gives C1O-TIME. Observe at the producer result
branch, before storage or report work; ingestion time is not observation onset.

Remove observationSha256 from the persisted payload. Serialize the exact closed
Observation using canonicalInvocationJson as UTF-8 with NO trailing newline.
artifactSha256 is SHA-256 of those complete exact bytes. Persist those bytes
unchanged as observation.json. Both the receipt observation artifact and
binding.artifacts entry use {id:eventId,sha256:artifactSha256}. There is no
self-referential digest and no semantic-hash/byte-hash substitution.

The receipt retains the core's recordSha256: canonical receipt semantics excluding
recordSha256. Serialize the complete validated receipt with the same no-newline
canonical bytes; receiptFileSha256 hashes the COMPLETE persisted receipt bytes,
including recordSha256. The publication marker carries both hashes with explicitly
different names. Owner stateSha256 hashes actual retained owner-read bytes;
specSha256 hashes actual spec bytes. These are different digest domains.

The existing producer's candidateText currently decodes Git stdout as UTF-8 text
before requiredCandidateReadback hashes it (source lines 123–132,160–166).
Observer correlation must additionally acquire the already-resolved candidate's
spec as bounded raw Git bytes and require well-formed UTF-8 plus equality to the
working/owner spec byte digest. If malformed bytes make the producer's text hash
differ from exact bytes, qualify no observation; do not change the producer's
existing behavior or label its decoded-text hash as a raw-byte hash.

Receipt construction uses the prior exact input mapping with these corrections:
eventId comes from the controller-retained capture; the transaction establishes
or preserves lineageId/firstObservedAt; observation artifact
uses exact observation bytes; candidate comes only from captured Source. Keep
facts [], state unknown, null endpoints/resolution, actor null/null, all joins
empty, attempt/recovery coverage unknown. Source projection is already shipped,
but this producer has no actual correlated full invocation/review history;
do not populate joins from fixtures or arbitrary caller JSON.

## 5. Scope and candidate qualification

At create, resolve the actual physical root through resolveProjectAuthorityPaths
with status ready; read its owner-selected state, validate the active feature and
validateContinuityState, and match the normalized requested spec to the existing
continuity authority spec. Require exact working-spec bytes/digest. Bound state,
spec and continuity reads; continuity remains within its owning 8192-byte bound.
Store only safe feature/phase and owner digests, never state bodies or paths.

An operation definition contains exactly:
```text
{
 schema:"pipeline.interruption-operation.v1",
 storeId, operationId, operationKind:"critic-preflight", createdAt,
 scope, specSha256, specPathSha256
}
```
operationSha256 is its exact canonical file-byte hash, not an extra self-hash.
scope is {featureId:actualFeature,packageId:null,dispatchId:null,phase:actualOrNull}.
It therefore satisfies the core's nonempty feature/package/dispatch requirement.

At every run, independently re-read the actual owner under the same physical root.
Require the definition's storeId, featureId, specPathSha256 and specSha256 to match.
Candidate commit/tree must both have been resolved and validated by the producer,
have the same OID length, and match the source's exact already captured pair.
Read that exact commit's spec; never re-resolve its branch or use HEAD.
Source.specSha256 must match when present; before its producer readback stage,
the observer may establish the same digest from the captured exact commit.
Missing candidate or usable scope yields an observer collection diagnostic,
not a receipt.

Before/after root/state/spec readbacks must agree; changed state bytes, continuity
revision or spec identity/digest yield C1O-SCOPE-STALE. No candidate/spec bypass for
early failures. Phase may change if the actual owner still binds the same feature
and spec; copy the current safe phase. Candidate may change across attempts if
that exact new candidate has the same bound spec and operation context.
A spec revision or different feature requires a new local operation, not a forced
merge. No queue package/dispatch, model, session or native ID is projected.

These checks establish repository-relative provenance under existing authority.
They are not signatures against arbitrary repository-owner edits. The current
continuity and project-authority validators remain unchanged.

## 5a. Initialization and absent-store access

Factory construction validates only the closed argument/port shape and returns
methods without filesystem access or creation. Invalid factory shape throws only
TypeError("C1S-SHAPE"); actual method failures use their existing closed results.
Only createOperation may initialize an absent store. All other writes require
the committed store definition, including publishReport; they never initialize
implicitly.

Absent-store readOperation/readSnapshot inspect fixed paths WITHOUT mkdir,
write-open, link, unlink or fsync. With no lock, prepared store payload or
receipt/control/report material, return the method's existing failure shape,
code C1S-NOT-FOUND and operation:null or snapshot:null respectively. Do not mint
a storeId or pretend absence is an initialized empty snapshot. Empty bootstrap
containers alone remain absence. A lock present gives C1S-LOCKED; prepared store
bytes or entry material without the store marker give C1S-INCOMPLETE. No mtime or
stale-age inference is used. Status/report on absence retain their closed
NOT-FOUND failure/exit2 and create nothing. An INITIALIZED store with no receipts
still yields observed zero and unknown population, as previously specified.
Readers of an initialized store retain the existing transient snapshot-lock
protocol; the no-write guarantee here applies specifically to absent stores.

Initialization is a private synchronous branch of createOperation:

1. Validate Context and operation input before writes. Resolve/lstat the physical
   root and fixed existing owned ancestors; reject unsafe components. Apply the
   section7 actual backend predicate before any mkdir. Retain actual root/parent
   device+inode observations internally, never in emitted metadata.
2. Create/check only root/evidence and then evidence/interruption-collection,
   in that order, with NONRECURSIVE mkdir. EEXIST requires a fresh lstat showing
   the same safe directory/backend/device. Do not scan or change unrelated
   evidence contents. These fixed idempotent containers are the only pre-lock
   mutation, necessary because the lock lives inside interruption-collection.
3. Attempt mkdir(interruption-collection/.writer-lock) once. EEXIST -> LOCKED;
   no wait, stale takeover or owner overwrite. The winner exclusively writes
   bounded owner.json, fsyncs it and the lock/collection directories, and retains
   its nonce/directory identity for release. A crash before owner.json remains
   LOCKED; missing owner data does not prove abandonment.
4. Under the lock, rescan fixed paths and bounded owned inventories. If a valid
   store/commit.json exists, validate and reuse its storeId and required root
   topology; missing required roots or changed committed store data give
   CORRUPT, never an instruction to reconstruct them.
   Without a store marker, only absent/empty bootstrap containers are
   restartable. Store metadata.json/.commit.pending or nonempty control/receipt/
   report entry material give INCOMPLETE and are preserved. The fixed empty
   store directory may be continued before any payload write; this exception
   does NOT make empty uncommitted event/control/report directories reusable.
5. For truly uninitialized storage, create/recheck these fixed directories in
   order while holding the lock: interruption-collection/store,
   interruption-collection/entries, evidence/interruption-receipts,
   root/telemetry, telemetry/interruptions. Use nonrecursive mkdir and checked
   EEXIST as above, preserve unrelated telemetry contents, and recheck each
   actual created directory's backend/device and parent/root identity. Fsync
   the containing parent after each creation. A committed store definition
   must never precede creation/validation of all these required containers.
6. Generate one safe storeId only after winning the lock. Publish the fixed
   interruption-collection/store bundle using the existing exclusive payload,
   completed pending-marker, hardlink publication, fsync and readback recipe.
   Store payload is EXACTLY
   {schema:"pipeline.interruption-store.v1",storeId,layoutRevision:1}.
   Its marker has kind:"store",id:"store-definition",that same storeId;
   operationId,operationSha256,sequence,previousEntrySha256,lineageId all null;
   firstObservedAt unknown; files contains exactly metadata.json with its exact
   byte hash/length and recordSha256:null. This fixed store directory is the
   explicit exception to digest-named entry directories. Its three retained
   files count in the existing8 MiB collection budget.
7. Only after store marker/readback succeeds may createOperation publish the
   operation definition under the SAME lock. Its payload fields stay EXACTLY
   schema,storeId,operationId,operationKind,createdAt,scope,specSha256,
   specPathSha256, with the types/literals from section5; no backend/raw-path/
   authority fields are added. Read storeId from the committed definition;
   createdAt is this actual creation observation, never episode onset.
8. Release only the lock owned by this call using existing nonce/identity
   checks. Failures preserve bounded containers/prepared bytes; no rollback,
   cleanup, alternative root, overwrite or hidden initialization retry occurs.

Concurrent first creates may both establish the same empty bootstrap containers.
Only one wins the lock; the other returns LOCKED or, if scheduled after release,
validates/reuses the winner's definition. Exactly one storeId exists; there is
no last-writer-wins initialization. Distinct successful EXPLICIT create calls
intentionally create different operation definitions; matching scope/spec is
not idempotency. No automatic create retry is performed.

A restart after empty containers only may continue initialization. A stale lock
or prepared definition remains LOCKED/INCOMPLETE. A committed store followed by
a crash before operation publication is reused by the next explicit create.
A committed operation whose selector was not delivered remains retained:
recover its actual selector through sourceEntries/inventory plus status, never
silently merge it with another create. Existing event/operation publication
replay, quotas and unknown-coverage rules remain unchanged.

## 6. Atomic publication and immutable association

Refine the staged plan's flat receipt filename to a digest-named event DIRECTORY
so receipt, observation and association have one logical publication point:

```text
evidence/interruption-receipts/<sha256(eventId)>/
  observation.json
  receipt.json
  .commit.pending
  commit.json
evidence/interruption-collection/store/...
evidence/interruption-collection/entries/<sha256(controlId)>/...
evidence/interruption-collection/.writer-lock/owner.json
telemetry/interruptions/<sha256(reportBytes)>/...
```

No path component comes from raw Id text; only validated fixed hex digests and
fixed filenames. Control entries use the same publication recipe with metadata.json.
Reports use report.json and report.txt plus their marker. Store identity is one
fixed committed metadata entry. Collection roots are the staged owned roots;
only the exact anchored telemetry ignore entry is added by the later doc/config
integration, not by this design dispatch.

Commit marker is exact:
```text
{
 schema:"pipeline.interruption-publication.v1",
 kind, id, storeId, operationId, operationSha256,
 sequence, previousEntrySha256, lineageId, firstObservedAt,
 files
}
FileBinding = {name,sha256,byteLength,recordSha256}
```
kind is `receipt|operation|diagnostic|complete|report|store`.
files is sorted uniquely by name; names are fixed per kind. recordSha256 is the
receipt's core digest for receipt.json, otherwise null. byteLength is wire size
metadata, checked against actual bytes, not a behavioral count.
Marker entrySha256 is the SHA-256 of its complete canonical bytes, computed by
readers/callers; it is not embedded in itself.

Receipt marker: id=eventId; operation fields nonnull; sequence>=1; previous
entry digest is the operation definition marker at sequence1 or previous control/
receipt entry thereafter. lineageId is nonnull, firstObservedAt retained.
Files are exactly observation.json and receipt.json.
Operation marker: id=operationId; operationId same; operationSha256 is definition
payload byte hash; sequence0, previousEntrySha256 null, lineageId null,
firstObservedAt unknown. Files exactly metadata.json.
Complete/diagnostic markers: fixed generated collection Id; operation fields and
sequence/previous bind the operation when available, otherwise all are null for
a store-wide diagnostic. Completion always requires an operation. Retain known
lineage/onset if one exists; files exactly metadata.json.
Store/report markers have operation/lineage/sequence/previous null and unknown
onset; files exactly metadata.json for store, report.json/report.txt for report.
Store metadata is {schema:"pipeline.interruption-store.v1",storeId,layoutRevision:1}.
Control metadata is {schema:"pipeline.interruption-collection-event.v1",
kind:"diagnostic"|"complete",code,observedAt}; complete requires code null.

Under the single store lock:
1. Validate/bound inputs, registry, target lookup and its committed operation
   chain. Do not reserve quota or allocate a directory yet.
2. If committed id exists, validate/read back its exact payload bytes and
   association. Identical replay returns replayed before any prospective quota
   reservation, even at capacity or with an unrelated uncommitted directory.
   It retains the original committed sequence/lineage/onset, including after
   that operation later completed. Changed same-ID data is C1S-CONFLICT.
   A target directory without its marker is C1S-INCOMPLETE. Corrupt committed
   target/operation evidence cannot qualify replay. This proves only this
   immutable replay, not healthy global collection.
3. For a genuinely new entry, validate bounded global inventory; an unrelated
   incomplete entry blocks new allocation with C1S-INCOMPLETE. Check operation
   openness and reserve the complete new entry against count/byte quotas.
   Only then create the digest directory, open each payload with exclusive creation and
   no-follow semantics, write all bytes, fsync and close. Compute/check file hashes.
4. Write complete canonical .commit.pending using the same exclusive procedure;
   fsync it and its directory before publication.
5. linkSync(.commit.pending, commit.json) is the create-only publication point.
   An existing commit.json cannot be overwritten by this primitive. Both names
   intentionally reference the same immutable inode. Retain .commit.pending as
   the bounded hard-link alias; it is not an unbounded retry temporary.
6. Fsync the containing directory. Return created only after validated readback
   of marker, payloads, byte hashes, receipt and association. A post-publication
   fsync/readback failure returns C1S-IO, never an unqualified success. A retry
   checks any existing marker and may establish idempotent committed readback.

Logical atomicity is reader admission at commit.json: no marker means no admitted
receipt, artifact or operation association. A receipt file existing alone does
not count. No separate mutable operation-head file needs a cross-file commit.
All receipt/control markers for an operation form one sequence/predecessor chain.
Readers under the lock reconstruct that chain; duplicate sequence, changed
predecessor, divergent lineage or definitions, or entries after complete fail.
On first committed qualified rejection, mint and retain one local lineage; later
committed rejections reuse it. If a process dies after publication but before its
caller sees the response, restart recovers that association from the marker.

Do not treat rename as a create-only primitive. This design uses a hard-link
publication marker plus a cooperating-writer lock; it does not depend on directory
replacement behavior. The two marker links must share the expected inode; payload
files must be regular, no symlinks, with the expected size/digest. No retained
payload is rewritten. The intentional marker alias is the only allowed hardlink
exception within the store layout.

## 7. Locking, crashes, limits and platform boundary

Use one fixed atomic mkdir lock under interruption-collection for mutations and
snapshot reads. Attempt once; no polling, age inference or stale-lock takeover.
owner.json is <=4096 bytes and contains only {schema,nonce}; the nonce is internal
local randomness, not a PID/provider identity. Release only the lock this call
created, after confirming its identity; remove its own owner file and empty lock
directory. That ordinary transient-lock release is not retention deletion.

A crash may leave the lock or an incomplete entry. Report C1S-LOCKED or
C1S-INCOMPLETE; refuse further writes instead of growing retry remnants.
This is an explicit first-slice fail-stop limitation, not an invisible permanent
success assumption. Status/report expose unavailable access plus unknown
population coverage, and never infer a stale lock from wall time.

Current supported maintenance is owner-managed offline inspection after ALL C1
writers/readers have been quiesced. No automatic maintenance command ships here,
and no new PO/native-signature ceremony is required for ordinary local maintenance.
The next production-hardening increment must implement and qualify a bounded
offline recover/status path that validates committed markers/chains, preserves all
committed evidence, inventories the single interrupted publication and releases
only an abandoned lock under an explicit quiescence precondition. It must expose
a collection gap. If stronger automatic crash recovery is required before rollout,
this is a concrete remaining implementation/qualification requirement, not something
this design claims to solve through a timestamp, PID check or magical lock helper.

Fixed v1 limits, enforced under the same lock BEFORE allocation:
- <=4096 receipt entry directories; <=64 MiB combined logical bytes of their
  receipts, observation artifacts and both marker aliases. Receipt.json <=1 MiB,
  observation.json <=16 KiB, each marker <=4 KiB.
- <=4096 collection entry directories including <=512 operation definitions;
  <=8 MiB combined logical bytes including marker aliases and fixed store data.
  Individual metadata.json <=8 KiB. Owner-selected input state/spec reads retain
  separate owner/source bounds; they are never retained here.
- <=16 report directories; <=64 MiB combined report files and marker aliases.
  Individual report.json <=16 MiB, report.txt <=256 KiB, marker <=4 KiB.
- A maximum of four files per receipt/report directory, three for metadata entries
  (metadata.json and two marker aliases), one bounded lock owner file. Unknown
  children/types or deeper nesting fail closed; bounded directory iteration stops
  at maximum+1 rather than allocating an unbounded readdir array.
- Uncommitted directories/files and partial writes count toward count/byte limits.
  Since the fixed lock stops concurrent allocation and incomplete entries block
  subsequent allocation, crashes cannot create unbounded retry temporaries.
  Precompute worst-case bytes, including duplicate logical marker-link accounting.
  Normal disk-full/short-write/fsync failures cannot trigger an eviction.
- Snapshot selection/aggregation input is separately capped at16 MiB canonical
  input and4096 receipts; oversized reports fail C1S-LIMIT with no partial result.
  A retained64 MiB store may require a narrower explicit report selection.

These refine the staged64 MiB receipt cap to include necessary artifacts/metadata,
and add bounded control/report retention. The reason is whole-store boundedness,
not a new baseline or PO semantic. No automatic pruning, background deletion,
source retention, unlimited logs, report overwrite or hidden abandoned-file cleanup.

The initial production eligibility profile is CLOSED:
backendId "linux-node24.15.0-ef53-v1". The internal platform({root}) port obtains
actual runtime/filesystem facts and returns exactly
{status:"eligible",backendId:"linux-node24.15.0-ef53-v1"} iff ALL conditions hold:

- process.platform is exactly "linux"; process.versions.node is exactly
  "24.15.0". This is an explicit tested allowlist, not generic Node24 support.
- Actual Node fs has statfsSync and every sync io-port method, plus nonzero
  integer constants O_NOFOLLOW and O_DIRECTORY. Use these constants for regular
  file/directory opens; never replace a missing required constant with zero.
- statfsSync(anchor,{bigint:true}).type is exactly 0xef53n for the physical root
  and every existing fixed owned ancestor. lstatSync(anchor,{bigint:true})
  establishes a directory on the SAME dev as the physical root.
- Fixed owned components satisfy the existing no-symlink/root-identity checks.
  For missing fixed paths, read their nearest existing ancestor INSIDE the root
  without creating anything. Recheck actual directories after initialization
  creates them and before publication; unsupported mounted subtrees fail.

The fixed anchors are root, evidence, interruption-collection, its store and
entries children, interruption-receipts, telemetry and its interruptions child.
Nearest-existing-ancestor lookup is bounded by these at-most-three relative
components. Existing entries/payloads retain their bounded no-follow/same-device
checks. statfsSync is explicitly in the io port. No recursive mount scan, shell,
child process, network, environment JSON, caller-supplied stat facts, cached
qualification file or eligibility override enters the predicate.

Unsupported runtime/type/device, absent required primitive, or unreadable/
ill-shaped statfs observation returns {status:"unsupported",backendId:null};
methods return C1S-PLATFORM before allocation. Unsafe root/components retain
C1S-ROOT. Mutation failures after eligibility retain C1S-IO or the specific
existing LOCKED/INCOMPLETE/CONFLICT result. Fixed bounded calls, no polling or
retry; synchronous kernel calls are not claimed to have a hard time deadline.
A backend failure never changes preflight admission or selects an unprobed
fallback. Widening this exact profile needs routine additional qualification
evidence and a reviewed code update, not a new PO semantic.

This lane is usable, not an always-unsupported placeholder. Parent executed
node scratch/alfred-c1-store-primitives-probe.mjs with reported exit0. The actual
scratch/alfred-c1-store-primitives-result.json records Linux, Node v24.15.0,
type0xef53, four primitive checks passed, and exact candidate
ecc15e54bf2b3bc0a7e156c922e6879cbca5b786/tree
5d24f2632b3036bfde3977f744a195c7fe3524c6. This dispatch READ the script/result;
it did not run the probe. Production does not consume that JSON as a credential:
the deterministic predicate reads its own actual runtime/filesystem facts.

0xef53 identifies the Linux ext filesystem family, not an exact ext4 version,
mount configuration or durability guarantee. The evidence covers only the
exercised exclusive-create/fsync/readback, create-only hardlink publication,
symlink-leaf refusal and separate-process mkdir contention in a disposable
fixture. It does not qualify the full writer, concurrent initialization,
power-loss/crash recovery, hostile ancestor replacement, network/distributed
filesystems or Windows. These limits remain explicit; the eligibility decision
is closed, while implementation/review and actual storage behavior tests remain
pending. No portable durability, sandbox or hostile-same-user isolation is claimed.

Containment uses actual root realpath, bounded lstat of every owned ancestor,
no symlink components, O_NOFOLLOW regular-file opens, fstat/readback, and root/
parent identity checks. Node path-based primitives do not prevent a hostile
concurrent owner from replacing ancestors between checks. The supported threat
model excludes concurrent adversarial directory replacement and arbitrary owner
editing; cooperating processes are serialized. A stronger claim needs platform
dirfd/openat-style ownership and separate qualification, not more lstat calls.
Never reuse/refactor governance-event-store locks or authority writers for C1.

## 8. Snapshot, report and coverage contract

Readers take the same exclusive no-wait lock, validate the registry and bounded
store inventory, and validate committed markers, operation chains and exact
artifact/receipt bytes. All committed receipt bodies are validated before filtering;
this also makes corrupt global inventory/association visible. An incomplete
directory produces an explicit collection diagnostic and is excluded from the
observed set. It never qualifies a receipt. A corrupt committed marker/payload/
chain fails C1S-CORRUPT rather than silently skipping. Locked/inaccessible stores
return a failure result with no aggregate, not measured empty output.

```text
Snapshot = {
 schema:"pipeline.interruption-store-snapshot.v1",
 storeId, window, scope, receipts, coverage, collection, sourceEntries, snapshotSha256
}
scope = {featureId,packageId,dispatchId}       // nullable exact filters; all-null=all
coverage = {receipts:"unknown",followup:"unknown"}
collection = {
 qualification:"unestablished",
 supportedSources:["critic-dispatch-preflight"],
 unsupportedSourceKinds:[
  "authority-wait","dispatch-observer","guard-observation",
  "lifecycle-boundary","readiness-observer","terminal-decision"
 ],
 diagnostics, entrySetSha256
}
diagnostics = sorted unique closed C1O/C1S codes, bounded by their enum
sourceEntries = [{kind,id,entrySha256}]       // at most8193; source kinds only
```

snapshotSha256 hashes canonical snapshot semantics excluding itself;
sourceEntries lists the exact retained source lookup identities and marker byte
digests, sorted by kind then id using ASCII order. This descriptor permits later
readback of an older coherent snapshot even after newer publications exist.
entrySetSha256 hashes canonical sourceEntries. The set contains only:
the store definition, operation definitions, diagnostic/completion controls and
receipt publications. Exclude all derived report markers and report files.
Report inventory is validated and quota-counted separately, never fed back into
snapshot identity, source diagnostics or source entrySetSha256 merely because
a report was generated. Report-publication failures return their closed result;
they do not append self-referential source controls. Thus identical source data,
window and filters yield identical snapshots/reports and replay one report even
when the report quota is full. Snapshot receipts remain full validated core records.
The lock defines a coherent snapshot point; after release, immutable bytes still
identify that snapshot even if another writer commits. This proves a selected
store view, not completeness of real observations.

Filter by exact nonnull scope fields. For known window bounds exclude receipts
with known cutoffs outside them; retain unknown cutoffs and their unknown status.
FirstObservedAt may precede the window, preserving core lifetime semantics.
Invoke aggregateInterruptionReceipts with the selected full receipt set, exact
window and the above unknown coverage. Do not clip durations or fabricate
predecessors/earlier observations. Filtering may lose historical coverage; unknown
already carries that limitation and no follow-up absence is promoted.

Report CLI:
`report-interruptions.mjs --root ROOT [--from ISO] [--through ISO]
[--feature ID] [--package ID] [--dispatch ID] [--format json|text]`.
Unknown omitted boundaries use null/unknown; explicit canonical times describe the
requested window only, not measured source collection. No --coverage/--complete,
arbitrary grouping, file path, outdir or native-source override exists.
Default format json. After validated immutable publication/readback, stdout
selects and prints the detached bytes returned by the store's `output.json` or
`output.text`; there is no second renderer and no caller-selected path. stderr
is empty and exit0 on success. Failure emits one closed
{schema:"pipeline.interruption-report-result.v1",status:"rejected",code} JSON on
stderr, stdout empty, exit2. Report storage failure does not print an apparently
persisted successful report.

publishReport accepts only the closed snapshot. It revalidates the snapshot
digest, all included receipt/core/registry bindings and source-entry descriptor
against retained immutable source publications, recomputes aggregate using the
unchanged core, derives deterministic text internally, and returns only the
validated stored report bytes through ReportResult. It never trusts
caller-supplied aggregate or text. Newer source entries do not invalidate a
retained coherent older snapshot; missing or changed referenced bytes do.
Report envelope is exactly {schema:"pipeline.interruption-local-report.v1",
snapshot,aggregate}. Text preserves all presented metric/ratio operand and
coverage statuses; no untagged inferred zero or effectiveness adjective.
Digest name is SHA-256 of exact canonical report.json bytes; marker binds exact
JSON and UTF-8 text bytes. Repeated identical snapshot/window/filter/report bytes
are idempotent without new directory allocation. Publication rechecks capacity
under the same lock; immutable snapshot validity is not promoted to current-head
or uninterrupted coverage.

Coverage remains unknown in this first slice even when some diagnostics prove
gaps. Unknown outranks a narrower estimated statement because supported-source
acquisition/population qualification has not been established. Operational access
can separately be unavailable. No file self-certifies live authenticity,
uninterrupted coverage, all seed categories, measured-zero population or a
>=14-day baseline. Baseline start/qualification is a later owner-managed step.

## 9. Planned paths, tests and delivery gates

Required source-layout behavior includes byte equality between the canonical
source registry asset and the packaged plugin asset, plus a copied-plugin
consumer fixture proving the store does not read the consumer root registry.
Report created and replayed fixtures compare CLI stdout byte-for-byte with the
validated stored JSON/text artifacts and assert failed publication produces no
successful stdout. These are proposed fixtures, not executed results.

Implementation paths, to freeze in the parent's tracked scoped plan:
- new lib/interruption-receipt-store.mjs: synchronous bounded store and reader;
- new config/interruption-registry.v1.json: exact unchanged copy of
  `policies/interruption-registry.v1.json`;
- new lib/critic-preflight-observer.mjs: capture, strict source validation, actual
  owner/root/spec correlation and sanitized Observation construction;
- modify scripts/critic-dispatch-preflight.mjs: optional internal source callback,
  preserving original direct CLI, producer checks and protocol;
- new scripts/observe-critic-preflight.mjs: shipped create/run/status controller;
- new scripts/report-interruptions.mjs: snapshot/aggregate/publication controller;
- new lib/interruption-receipt-store.test.mjs and
  lib/critic-preflight-observer.test.mjs; extend the existing
  scripts/critic-dispatch-preflight.test.mjs for actual observed CLI parity,
  or own new observed-controller/report suites through explicit registration;
- docs/alfred-interruption-reports.md and docs/reference/interruption-emission.md;
  anchored /telemetry/interruptions/ ignore and sanctioned suite registration
  are separately coordinated integration paths, not hidden edits.

Production paths above are relative to plugins/pipeline-core except docs/ignore.
No changes to the pure receipt/aggregate/source adapter, owning validators,
registry/freeze, governance locks/writers, native adapters, guards or installed
plugins. Parent must sequence source/store/controller increments so final delivery
includes the real caller; a store-only intermediate commit is not emission.

Required behavior tests (proposals only; none executed here):
1. Tempfixture repository with actual owner authority/continuity/spec plus real
   candidate commits. Invoke shipped create and run through Node, restart the
   process, retry the same selector, read actual marker/artifact/receipt files:
   two event IDs, one lineage, exact candidate, facts/state/coverage unknown.
2. Packet-ready closes only the operation control chain; a later run with its
   selector cannot reopen it. New create produces a distinct later lineage.
3. Compare existing CLI and observed run stdout/stderr/exit for packet-ready and
   rejected cases. Inject observer/store errors and assert exact producer parity,
   including exception identity for library calls. No child/packet/guard/lifecycle
   side effects; telemetry writes are limited to the new controller's owned roots.
4. Artifact-byte and receipt-byte mismatch tests, whitespace/newline differences,
   self-hash confusion, wrong marker names, duplicate JSON keys, invalid UTF-8,
   unsafe Ids, getter/prototype traps and extra fields fail closed without payload
   disclosure. Actual builder validates every published receipt.
5. Parallel separate processes: concurrent identical publish -> created/replayed
   or explicit busy then replay; conflicting same-ID bodies -> conflict; distinct
   same-operation attempts serialize sequence and retain lineage. No overwrites,
   duplicate first episodes or unbounded waiting.
6. Process termination before payload completion, before marker link, after marker
   link and before return. Readers never admit incomplete receipts. Crash locks
   and pending entries are reported unavailable/incomplete, not auto-recovered.
   A published-but-unacknowledged entry has recoverable immutable association.
7. Real limit-boundary fixtures for combined bytes, entry/control/report counts,
   report idempotence at capacity, partial writes/remnants and fixed lock files.
   Retries after exhausted/incomplete state create no additional files.
8. Symlink/nonregular ancestor/file, cross-root selector, hardlink payload, wrong
   marker alias, changed parent/root, disk full, short write and fsync/readback
   failures. Separate injected failure tests from measured platform primitives.
9. Concurrent reader/writer report snapshot agrees with its exact entry-set hash.
   Empty readable store reports observed zero with unknown population; corrupted
   committed data fails; incomplete prepublication files yield explicit unknown
   coverage/diagnostic and no included event.
10. Exact owner/spec mismatch, candidate ref movement, unavailable candidate,
    unrelated feature, state/spec race and malformed candidate UTF-8 all reject
    collection without changing preflight. Caller imitation JSON cannot enter the
    production observation path.
11. Add real absent-store read tests asserting zero mutation; first-create
    process contention/restart retains one storeId. Terminate at every startup
    stage and verify the exact absent/LOCKED/INCOMPLETE/committed outcome.
    Existing committed stores with missing roots must fail, not self-repair.
    Backend tests cover exact runtime/type/device/required flags and statfs
    failure; injected facts are not qualification evidence.
    Platform qualification records actual filesystem/runtime and fsync/link/lock
    outcomes. Do not claim Windows/NFS/distributed/power-loss or hostile ancestor
    guarantees from Linux tempfixture tests.
12. Focused suites, sanctioned registration, consumer-safe paths and diff checks
    precede parent Full Verify and independent T1. Qualification and real runtime
    collection follow implementation; fixture success starts no baseline.

## 10. Evidence, remaining gaps and decisions

Source anchors inspected for this dispatch:
- c1-core.md: closed input/scope/byte binding, orchestrator-retained episode clause
  and implementation step3; c1-aggregation.md:42–66 window/coverage constraints.
- c1-emission.md: staged owned roots, source/observer boundaries,64 MiB/4096 cap,
  retention/report and delivery sequence.
- scratch/alfred-c1-preflight-observer-contract.md: Source/code-stage matrix and
  actual owner correlation; sections4–5 are mechanically superseded above.
- scratch/alfred-c1-store-contract-notes.md: hash/atomicity/caller/quota concerns.
- scripts/critic-dispatch-preflight.mjs:64–106 Git resolution;123–132,160–166
  decoded candidate-text readback;176–239 producer;242–264 direct CLI.
- lib/project-authority.mjs:645–660 ready-only coherent paths;683–707 fallback
  helper intentionally not used for observer qualification.
- lib/continuity-state.mjs: authority/spec keys and8192-byte owning bound;
  existing validateContinuityState remains the semantic owner.
- scripts/critic-dispatch-preflight.test.mjs:17–45 existing real Git fixture and
  following producer behavior tests; used as test-design evidence, not executed.

No mandatory new PO-semantic decision was found. Synchronous controller flush,
a dedicated explicit observed CLI, byte-exact artifacts, marker publication and
quota refinements are routine choices under approved step3. Stronger native facts,
nonempty classification predicates, automatic resolution, measured population,
baseline qualification or a changed identifier meaning remain outside scope.

Initialization order and the deterministic first backend predicate are now
closed by ALFRED-C1-STORE-INITIALIZATION-DESIGN; no unresolved initialization or
eligibility choice blocks the first implementation slice. Full storage behavior,
concurrent/crash tests, review, offline crash maintenance before broader deployment,
and sanctioned suite/ignore/docs integration remain pending. No production C1 writer,
controller, source observation or test outcome exists merely because this design
names it. Parent Full Verify remains independent and candidate-bound.
