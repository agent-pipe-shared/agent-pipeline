# Sprint Nova Epic — Technical Specification

> **Gate status:** technical candidate for review. The Product Owner approved
> the PRD digest on 2026-07-24. This document is not implementation authority
> until its exact digest is separately approved and recorded in
> `lifecycle.json` and `result.md`.

## 1. Bound authority and scope

| Authority | Bound value |
| --- | --- |
| Product baseline | delivered and closed tag `v0.4.6` |
| Base commit | `9d1b3dc108eb77629ace5b82002120f5539abd8d` |
| Base tree | `282a8b5c5b0581e042985bfb373a66be0eb2d08b` |
| Branch | `feat/sprint-nova-codex` |
| PRD | `specs/sprint-nova-epic/prd_sprint-nova-epic.md`; the approved pre-activation content baseline is SHA-256 `879423cdb24d542b7f9275bc9da4591fcdfd38145fdddee9142ce82eee53402e`, while the live PRD digest is bound by the PO-gate state to avoid a circular PRD↔Spec self-hash |
| PRD approval | `specs/sprint-nova-epic/evidence/prd-approval.json`, SHA-256 `59b38e54ca64cd94c8ae02bd4844ee082b2202a88beb17965cab13bba361571d` |
| Acceptance contract | `specs/sprint-nova-epic/acceptance.md`, SHA-256 `33398195011351a5356403a5ef2638f0776eef2af055d3a6bf0f356096e95c6d` |
| Canonical backlog snapshot commit | `5ca5a4b292a267ffdfcc52577fda0a0593957a65` |
| Canonical backlog subtree | `832bf98e22e9a147dad88c952c0b794f3ee44fe7` |
| Canonical transition head | `36dd616d3aa5bc21e49e138f6b8a9a17a9de25321998304306e4fa47289de562` |
| Approved Nova issue set | exactly `#7`, `#8`, `#12`, `#14`, `#15`, `#16`, `#18`, `#21`, `#29`, `#38`, `#49`, `#51`, `#54`, `#56`, `#57`, `#60`, `#63` |

The PRD and acceptance matrix own product intent. This specification owns
technical interfaces, states, failure behavior, file boundaries and slice
readiness. A contradiction fails closed and returns to the applicable human
gate; this document cannot silently narrow acceptance.

Nova A contains `#57`, `#7`, `#8`, `#12`, `#14`, `#29`, `#38`, `#54` and
`#56`. Nova B contains `#60`, `#21`, `#16`, `#18`, `#15`, `#51`, `#63` and
`#49`.
Nova B cannot begin from a merely latest branch head: it begins from the exact
Nova A increment receipt accepted by the PO.

The earlier narrow B0 exception is exhausted. On 2026-07-26 the PO confirmed
the current Nova branch is already rebased and adapted on the delivered,
closed `v0.4.6` base. There are no open `0.4.x` tasks. B1–B4R are isolated
Sprint development and remain subject to Nova's candidate-bound gates.

## 2. Normative conventions

### 2.1 Closed records

Every new Nova JSON record:

- has a literal `schema` value named in the schema registry below;
- rejects missing, additional, duplicate or incorrectly typed fields;
- uses safe repository-relative POSIX paths with no empty, `.`, `..`,
  backslash, drive or absolute segment;
- uses full lowercase Git OIDs and lowercase 64-character SHA-256 values;
- uses canonical UTC instants (`YYYY-MM-DDTHH:mm:ss.sssZ`) only where wall time
  is evidence, never as ordering authority;
- uses non-negative safe integers in a declared unit;
- stores sorted unique sets as arrays; and
- preserves `unknown`, `unavailable`, `unsupported`, `not-observed` and zero
  as distinct values.

Unless an existing frozen contract defines otherwise, a record digest is:

```text
SHA-256(UTF-8("<schema>\0" + canonical-json(record-without-own-digest)))
```

`canonical-json` recursively sorts object keys, preserves array order, emits no
insignificant whitespace and follows JSON scalar encoding. Persisted canonical
records add exactly one trailing LF; the LF is not part of the semantic record
digest. Raw file digests always cover the exact persisted bytes and are named
`fileSha256`, never `recordSha256`.

IDs and digests are not interchangeable. Every receipt carries both its
stable logical ID and its content digest. A same-ID/different-digest replay is
a conflict.

### 2.2 Candidate and authority binding

Every execution-affecting request has one exact `subject`:

| Key | Type and rule |
| --- | --- |
| `repository` | literal `self` for this repository |
| `baseCommit` / `baseTree` | full Git OID; tree must belong to commit |
| `candidateCommit` / `candidateTree` | full Git OID; tree must belong to commit and descend from the admitted base |
| `packageId` | stable package ID from the approved slice manifest |
| `dispatchId` | stable dispatch ID |
| `attempt` | integer `>= 0`; changes for every actual launch |
| `queueRevision` | integer `>= 0`; changes when the admitted queue changes |
| `authorityDigests` | sorted non-empty `{kind, sha256}` set |
| `writePaths` / `resources` | sorted unique, complete declarations |

The subject digest uses schema
`pipeline.nova-execution-subject.v1`. Admission recomputes the Git, authority,
path and resource bindings. A missing object, stale queue, changed authority,
undeclared path/resource or digest mismatch is terminal rejection before
worker launch.

### 2.3 Frozen-contract composition

Nova does not edit these frozen authorities in place:

- `pipeline.control-execution-exchange.v1`;
- `pipeline.parallel-dispatch-input.v1` and
  `pipeline.parallel-dispatch-receipt.v1`;
- `pipeline.workflow-runner-*` synthetic boundary semantics;
- runner/advisory V3 authority; and
- the current artifact-topology schema.

Nova companion records refer to their exact original record digest. Projection
is one-way and loss-aware:

| Existing observation | Nova projection |
| --- | --- |
| workflow `WR-ACCEPTED` | `admitted`; never completion |
| exchange admission `admitted` | `admitted` |
| exchange progress `running` | `running` |
| exchange terminal `succeeded` | `succeeded-unverified` |
| exchange verification `passed` with matching result | `verified` |
| exchange `failed` | `failed` |
| exchange cancellation `requested` | `cancel-requested` |
| exchange cancellation `acknowledged` plus terminal proof | `cancelled` |
| exchange `unknown` / `unavailable` | same non-success state |
| workflow `completed-but-undelivered` | `completed-undelivered` |

A later contract version or registered extension is required if a field cannot
be represented without loss. An ADR is required before a production local
worker supervisor or new mutable state store, production remote execution, a
credential-bearing external adapter or post-V3 runner registration. The
current highest repository ADR is `0046`; Nova does not
pre-allocate the next number because Cyborg is adding decisions in parallel.
The ADR number is serialized at the separate decision gate.

## 3. Stateful-design readiness inventory

No stateful implementation package is dispatchable until its row has exact
schema, producer, consumer, storage, transition, concurrency, durability,
recovery and evidence tests.

| Surface | Durable authority | Producer | Consumer | Concurrency owner |
| --- | --- | --- | --- | --- |
| backlog delivery | existing append-only ledger plus item/index/STATUS and reconciliation-receipt projection | sanctioned reconciliation writer | checker, release/close path, PO | exclusive repository transaction |
| selected sandbox | in-memory state supplied to/returned by a pure reducer; immutable gate evidence only | sandbox resolver | conformance and invocation preflight | fingerprint single-flight owner |
| invocation | in-memory attempt chain; immutable gate evidence only | invocation preflight/launcher | recurrence reporter and adapters | logical-invocation owner |
| execution | in-memory event chain and immutable imported result | admitted synthetic adapter | planner, verifier, Result assembler | dispatch-attempt owner |
| scheduling | immutable planner and replan receipts | scheduling composer | synthetic executor | queue-revision owner |
| Critic lineage | immutable feature-package evidence, not a mutable store | Critic compiler/importer | course gate and Result | review-lineage owner |
| local worker pool | blocked pending executor/state-authority ADR; synthetic in-memory reducer before that gate | pool supervisor | result importer/cleanup | pool ID owner |
| async execution | blocked pending remote/state-authority ADR; synthetic immutable observations before that gate | external boundary | reconciler/importer | provider job binding |
| credential lease | external broker receipt, never secret bytes; blocked pending credential ADR | external broker | authorized adapter and revoker | lease ID owner |
| external mutation | immutable preview/confirmation/idempotency/readback chain; no repository-local mutable provider store | forge adapter | operator and evidence validator | exact target + operation key |
| increment gate | immutable feature-package evidence | gate assembler | next increment/final close | tested candidate owner |

Nova A adds no generic mutable state store. A2–A6 APIs are pure reducers or
bounded in-process orchestrators: callers supply the prior closed record and
receive the next immutable record. Gate evidence is persisted only as
feature-package evidence after the operation is terminal. A path under
`.agent-pipeline/`, a user home, `.git`, a shared cache or an undeclared
temporary directory cannot silently become portable authority.

B1 production supervision, B2 remote reconciliation/leases and any durable
external adapter remain blocked until a separately approved ADR fixes the
authority class, machine-local root/path template, migration, owner,
permissions, locking, crash recovery, retention and cleanup. Synthetic
contract work before that ADR cannot advertise the production capability.

Every file that is lawfully durable is regular and owner-controlled.
Symlinks, hard-link ambiguity, non-regular parents, ownership/mode drift or a
storage primitive that cannot provide the declared durability returns
`unavailable`; it never falls back to a weaker write while retaining success.

### 3.1 Common durable-write protocol

The A1 backlog writer, and only a later ADR-authorized writer, uses:

1. validate closed input and authority;
2. exclusively create `backlog/.state-transaction.lock` as
   `pipeline.backlog-transaction-lock.v1`; its closed `owner` record contains
   random owner nonce, PID, process-start token or `unavailable`,
   privacy-safe boot digest or `unavailable`, lease revision, last monotonic
   heartbeat and lease duration;
3. read and hash all preimages;
4. compare expected CAS values;
5. persist an exclusive prepared journal and sync the file;
6. sync the containing directory when the platform truthfully supports it,
   otherwise report durability `process-crash-only`;
7. write each postimage to an exclusive same-directory temporary regular file,
   sync it, atomically rename and read it back;
8. install the semantic receipt at
   `backlog/receipts/<idempotencyKey>.json`; the receipt excludes its own path
   and digest from its target set;
9. update the journal to `receipt-installed`, sync it, validate the complete
   post-state and perform the final independent readback while all preimages
   remain in the journal;
10. update the journal to `committed`, sync it, remove the journal and owned
    lock, then sync their directory where supported; and
11. return success without performing a new mutation or a fallible validation
    after journal removal.

An active owner refreshes its monotonic heartbeat before lease expiry. A
second caller returns `busy` while the lease is live. It may recover an expired
owner only when the process-start/boot observation proves the owner is gone;
when that probe is unavailable, an explicit operator recovery authority is
required. PID alone is never stale-owner proof.

For a `prepared`, `applying` or `receipt-installed` journal found after proven
owner loss, recovery restores every exact preimage even if all postimages
appear present. A `committed` journal is removed only after its receipt and
full post-state validate; otherwise it restores preimages. Success is never
inferred from target files alone while a non-committed journal exists. If the
journal was removed but the caller did not receive the response, an exact
idempotency replay looks up the canonical receipt path and returns it after
full readback. A missing or conflicting receipt fails.

| Failure point | Required outcome |
| --- | --- |
| before journal create | no mutation |
| journal create/sync fails | no target mutation; unavailable |
| after prepared journal, before/within target writes | next entry restores all preimages |
| after all target writes, before journal removal | next entry restores all preimages |
| after committed journal removal, before response | replay finds the canonical idempotency receipt and returns byte-identical applied evidence |
| corrupt/unknown journal | fail closed, retain bytes for manual recovery |
| preimage changed under owner | CAS conflict; no mutation |
| post-write/final readback differs while journal exists | restore preimages; no success |
| cleanup cannot prove owner loss | blocked; no broad process/file deletion |

Fault injection is required at every numbered boundary. Each test must assert
target bytes, journal state, receipt, and absence of unrelated mutation.

## 4. Common execution state model

`pipeline.nova-execution-state.v1` has exact keys `schema`, `subject`,
`subjectSha256`, `state`, `revision`, `observation`, `result`, `reason` and
`previousSha256`. All keys are always present. `result` and `reason` are
`null` where not applicable. `revision` starts at zero and increments by one.

Allowed transitions are:

```text
created -> admitted | rejected
admitted -> running | cancel-requested | failed | timed-out | unavailable
running -> running | paused | cancel-requested | succeeded-unverified |
           failed | timed-out | lost | completed-undelivered
paused -> running | cancel-requested | failed | timed-out | lost
cancel-requested -> cancelled | succeeded-unverified | failed | timed-out | lost
succeeded-unverified -> verified | invalidated
completed-undelivered -> succeeded-unverified | invalidated | timed-out
verified -> invalidated
rejected | cancelled | failed | timed-out | lost | unavailable | invalidated
  are terminal for that attempt
```

A repeated `running` transition is a heartbeat with a higher revision.
`paused` requires a matching adapter acknowledgement and preserves the
absolute request timeout unless the admitted request explicitly supplies a
separate bounded pause budget. A restart receives the last immutable revision,
never invents a resume, and remains paused until a matching higher-revision
observation arrives. Cancellation request is not cancellation completion. `verified` means the
matching result bytes passed the specifically declared verification evidence;
it is not PO acceptance, merge or release. An obsolete candidate may only move
to `invalidated`, never be relabelled to the current candidate.

Each adapter normalizes observations without erasing its raw digest. Import
requires matching subject, attempt, result digest and declared evidence.
Duplicate exact import is idempotent; reordered, skipped-revision or conflicting
import is rejected.

## 5. Nova A technical contracts

### 5.1 A1 — Canonical delivery/status reconciliation (`#57`)

#### Delivery intent and authority

`pipeline.backlog-delivery-intent.v1` has exact top-level keys:

| Key | Contract |
| --- | --- |
| `schema` | literal schema |
| `intentId` | stable logical ID |
| `idempotencyKey` | 64 hex derived from operation + exact authority + expected head |
| `operation` | `initialize`, `assign`, `close` or `amend-evidence` |
| `item` | item ID, path, expected status and expected item byte digest; initializer additionally carries reviewed canonical metadata/body bytes |
| `sprint` | exact Sprint and increment; nullable only for non-Sprint repair |
| `specification` | repository path, raw digest and approval receipt digest |
| `candidate` | exact commit/tree or `null` for initialize/assign before a candidate exists |
| `gates` | sorted gate-name/evidence path/raw digest set |
| `authority` | authority kind, decision ID, receipt path and digest |
| `expected` | ledger head, index digest, STATUS digest and backlog subtree digest |
| `evidence` | sorted safe repository paths with raw digests |
| `createdAt` | evidence timestamp, not ordering authority |

Operation predicates:

- `initialize` requires explicit reviewed item metadata/body, unique item ID and
  path, an accepted Sprint assignment or backlog-intake authority, and produces
  an `open` item plus a `null -> open` ledger event.
- `assign` requires accepted Spec and explicit implementation activation. It
  produces only `open -> in_progress`.
- `close` requires the item's complete accepted acceptance set, exact candidate,
  required gates, disposition evidence and closure authority. It produces only
  `in_progress -> closed`.
- `amend-evidence` changes no status and requires repair authority plus an exact
  original event sequence and entry hash.

`pipeline.backlog-spec-binding.v1` is the machine-readable bridge from this
feature package to the canonical portfolio. Its exact keys are `schema`,
`featureId`, `specification`, `backlogSnapshot`, `bindings` and
`recordSha256`. Bindings sort by `(increment,id)`; each has exact keys `id`,
`issue`, `increment`, `acceptanceIds`, `closureMode` and
`expiryDisposition`. Closure mode is
`candidate-evidence`, `separate-pilot-required`, `cyborg-input-only` or
`later-sprint-input-only`.

The feature-package lifecycle and close path automatically emit a preview when
an accepted Spec activates an item or accepted delivery satisfies an item's
closure predicate. Automatic emission is mandatory; automatic application is
permitted only when the supplied authority record explicitly authorizes that
operation. A Markdown file, GitHub issue state/label, branch name, commit
message, test result or Spec presence alone is never authority.

Concretely, an approved feature-package transition reads the exact binding
record and emits an `assign` preview for each still-open
`candidate-evidence`/`separate-pilot-required` item. The close lifecycle reads
the same digest and emits `close` previews only for
`candidate-evidence` bindings whose complete acceptance and non-expired
evidence set is present. It emits a retained `blocked` preview for
`separate-pilot-required`, input-only, expired or incomplete bindings.
`check-artifact-lifecycle` rejects a feature `completed` projection when a
candidate-evidence binding lacks either an applied close receipt or explicit
PO scope-change authority. This is the enforcement that prevents a delivered
Spec or Result from silently leaving backlog status stale.

The writer emits `pipeline.backlog-reconciliation-preview.v1` and, after
successful application/readback,
`pipeline.backlog-reconciliation-receipt.v1`. Both bind intent digest,
pre/post ledger head, every pre/post target digest, operation event sequences
and canonical portfolio snapshot. The receipt's semantic target set excludes
its own receipt path and file digest, avoiding a self-reference. The
transaction journal may still carry the already-computed receipt bytes as a
postimage. External readback reports the receipt file digest separately.

```text
snapshot = SHA-256(
  "pipeline.backlog-snapshot.v1\0" +
  canonical-json({commit, tree, backlogSubtree, ledgerHead,
                  indexFileSha256, statusFileSha256, itemFileSha256[]})
)
```

Cyborg may hold that byte-identical snapshot and receipts, but cannot apply
them. This repository is the single writer.

#### Generic initializer and `#57` bootstrap

The initializer validates `pipeline.backlog-item.v1`, canonical frontmatter,
body bytes, source/tracking, ownership, path uniqueness, item-ID uniqueness and
open-state invariants before any transaction.

`#57` itself is bootstrapped without circular authority:

1. implement and accept the generic initializer and a precommitted
   disposition/repair evidence file in candidate `C1`;
2. execute one authorized `initialize` plus one ordered `assign` operation
   against `C1`, generating two append-only events and exact receipts;
3. commit only the resulting canonical projections and receipts as `C2`; and
4. read back `C2` with the default checker.

The initializer cannot create an item directly as `in_progress` or `closed`.

#### Append-only repair of events 39 and 40

`pipeline.backlog-evidence-amendment.v1` has exact keys
`schema`, `kind`, `targetSequence`, `targetEntryHash`, `targetCommit`,
`replacementCommit`, `reference`, `dispositionSha256` and
`idempotencyKey` inside a `pipeline.backlog-transition.v2` event. The event is
a same-status transition for the current item and follows the current ledger
head.

Transition v1 remains byte- and semantics-frozen. Transition v2 preserves the
same exact event envelope keys and hash algorithm, changes only the literal
schema/domain and dispatches evidence validation by the closed evidence
schema. A mixed ledger is valid when all existing v1 events validate unchanged,
the first v2 `previousHash` equals the last v1 `entryHash`, every later event
chains normally, and projections replay both versions in physical sequence.
New initialize/assign/close and evidence-amendment events write v2 only.

Validation is two-pass:

1. validate the entire hash chain, item projections and every amendment;
2. index exactly one valid later amendment per unreachable target event; then
   evaluate Git reachability.

An unreachable historical evidence OID is tolerated only when its exact event
sequence, entry hash and original OID are bound by one later, reachable,
authority-backed amendment. The old event bytes and hash remain unchanged.
The disposition explicitly says that the old Git object was not recovered.
Conflicting, forward-referencing, duplicate or chain-invalid amendments fail.

Event 39 remains an `in_progress` item and receives only evidence amendment.
Event 40's closed item retains closed status and updates current closure
metadata to the reachable replacement evidence. After both amendments the
default checker, with `checkCommit:true`, must pass without a bypass.

#### Transaction v2 and compatibility

`backlog/.state-transaction.json` accepts the actual existing
`pipeline.backlog-transaction.v1` byte shape for rollback compatibility and
writes only `pipeline.backlog-state-transaction.v2` with exact keys:

`schema`, `transactionId`, `idempotencyKey`, `ownerNonce`,
`operationSha256`, `phase`, `expectedLedgerHead`, `intendedLedgerHead`,
`targets`, `receiptPath`, `receiptSha256` and `createdAt`.

`phase` is `prepared`, `applying`, `receipt-installed` or `committed`.
`receiptPath`/`receiptSha256` are `null` until receipt installation. Each sorted target has exact keys `path`, `pre` and
`post`; each image has `exists`, `sha256` and `bytesBase64`. Targets are the
affected item file, `backlog/transitions.ndjson`, `backlog/index.json`,
`backlog/STATUS.md`, and reconciliation receipt when applicable. A receipt
target is excluded from the semantic receipt's own target list. The journal
and lock are never listed as targets.

Every legacy mutation entrypoint is closed:

- `applyBacklogTransition` routes initialize/assign/close through a validated
  delivery intent, preview and operation-specific authority;
- `applyBacklogEvidenceAmendment` accepts only v2 amendment intent;
- `writeBacklogTransaction` is no longer a public authority surface;
- completed one-time Sentinel recovery/scope and AFK repair apply operations
  reject the current canonical snapshot as `legacy-operation-retired`; and
- `writeBacklogProjections` may regenerate index/STATUS from unchanged
  item/ledger bytes but cannot change status.

Tests invoke every exported writer and CLI path with absent, wrong, stale and
cross-operation authority and require zero target mutation.

No generic `checkCommit:false` writer option survives as an accepted operation
path. The repair operation supplies its explicit amendment semantics to the
default validator.

### 5.2 A2 — Runner conformance and selected sandbox (`#7`, `#29`)

`pipeline.runner-capability-report.v1` has exact sections:

- identity: adapter ID/version, implementation digest, requested runner/model
  and independently observed identity or `not-observed`;
- environment: platform class, architecture class, host class and privacy-safe
  fingerprint digest;
- capacity: typed units for advertised, certified, observed, reserved and
  effective capacity;
- cells: sorted capability ID, mode (`native`, `functional-equivalent`,
  `synthetic`, `unsupported`, `unavailable`), result and evidence;
- assurance: workspace, process, filesystem, network and OS isolation as
  individually observed values; and
- report binding: suite version, candidate, authority and raw evidence digests.

Capacity units are closed: `concurrent-tasks`, `logical-subagents`,
`worker-processes`, `workspaces`, `cpu-millicores`, `memory-bytes` and
`external-jobs`. Values with different units are never compared. Effective
task concurrency is computed only from values expressed in
`concurrent-tasks`.

The required non-empty baseline matrix covers synthetic, Claude-native where
available, Codex-native where available, and explicit unsupported cells.
Runner self-report is evidence input, never certification. The existing
`pipeline.product-capability-inventory.v2` remains product authority; the Nova
report projects only validated cells into it at integration.

`pipeline.selected-sandbox-disposition.v1` binds:

- duty, selected transport, runner/host/boot/platform/architecture classes;
- runner binary, sandbox implementation, profile and policy digests;
- capability contract version;
- fingerprint digest;
- state, failure class, observation receipt digest and expiry policy; and
- requested versus observed assurance.

States are:

```text
unprobed -> probing -> available-attested | transient-unavailable |
                       terminal-unavailable
transient-unavailable -> probing only after 300000 monotonic milliseconds
available-attested -> invalidated on any fingerprint/session drift
terminal-unavailable -> invalidated only by fingerprint drift or explicit
                        force-reprobe authority
invalidated -> probing
```

One fingerprint has one single-flight probe. No second terminal attempt is
launched for unchanged input. Force-reprobe is a separately logged operator/PO
authority receipt and yields a new attempt ID without rewriting history.

`available-attested` requires a fresh 256-bit challenge generated by the
parent, a selected child identity bound to that challenge, and a child receipt
covering duty, selected transport, observed sandbox assurance, candidate,
attempt and result digest. The parent verifies nonce equality, child/process
identity, selected transport, subject and result before success. CAS health,
process creation, a fallback result or a self-asserted runner name cannot
satisfy it. Receipts omit user names, home paths, account IDs, tokens and raw
environment values.

### 5.3 A3 — Invocation reliability (`#38`)

`pipeline.invocation-request.v1` binds logical invocation ID, subject, runner
route, duty, selected-sandbox disposition, closed command/argument contract,
input digests, timeout, allowed outputs and privacy class.
`pipeline.invocation-attempt.v1` adds unique attempt ID/index, launch decision,
failure class, start/end observation, result digest and previous-attempt digest.

Failure classes are:

- `request-invalid`, `chain-invalid`, `authority-invalid` — terminal before
  launch;
- `selected-sandbox-terminal` — terminal for the fingerprint;
- `selected-sandbox-transient`, `transport-transient`, `host-pressure` —
  retryable only under declared course and backoff;
- `denied`, `unavailable`, `malformed-result`, `timeout`, `cancelled`,
  `internal-error`; and
- `succeeded-unverified`.

Byte-equivalent invalid requests share a request digest and cannot be launched
again. Session resolution memory is an atomic map keyed by the full sandbox
fingerprint and request-chain version, not by runner name. Concurrent callers
join the single-flight result. Boot/profile/policy/binary/duty/subject drift
invalidates reuse.

Recurrence reports contain only class, owning layer, bounded counters, time
bucket and digest. A repair candidate is observational until it has reproducer,
owning-layer fix, regression fixture and post-fix non-recurrence evidence.

### 5.4 A4 — Execution-plane companion and scheduling (`#14`, `#12`)

`pipeline.execution-plane-request.v1` wraps the common subject and declares:

- adapter kind and version;
- locality (`in-process`, `local-process`, `local-isolated`,
  `external-synthetic`, `external-live`);
- workspace identity/digest and observed separation;
- network mode, mount list, write paths and resource limits with units;
- sidecars and credential lease references;
- heartbeat, timeout, cancellation and result-delivery contracts; and
- underlying frozen exchange/request digest.

It never contains secret values. `external-live` is rejected until the
separate remote-execution and credential ADR is approved.

The synthetic adapter emits the common state sequence and fixtures for success,
failure, timeout, cancellation race, duplicate, out-of-order, lost heartbeat,
completed-undelivered and stale candidate. Advertised capacity is report data;
observed admission is per-attempt evidence.

`pipeline.scheduling-lifecycle.v1` has exact keys `schema`, `queue`,
`plannerInputSha256`, `plannerReceiptSha256`, `subjectSetSha256`, `revision`,
`selected`, `blocked`, `completed`, `failed`, `cancelled`, `invalidated` and
`previousSha256`.

Before calling the frozen planner, the composer rejects any package with an
unknown or non-authoritative dependency, write set, resource set, authority
digest or candidate. It then validates the planner receipt against the exact
input. Replan changes queue revision, imports only independently verified
package outcomes and gives every unselected ready package its original
planner reason. Only `verified` package IDs enter the frozen planner's
`completed` set. A failed, cancelled, timed-out, lost or invalidated upstream
causes every transitive dependent to become terminal
`upstream-<state>:<packageId>` in the wrapper without presenting those IDs as
completed to the planner. Unrelated packages continue from a new
queue revision. Replan input binds the prior lifecycle digest, exact terminal
observation digests and newly recomputed planner input; a handwritten or stale
receipt is rejected. Package failure/cancellation never becomes another
package's success.

### 5.5 A5 — Critic convergence (`#54`)

`pipeline.critic-review-lineage.v1` binds review ID, parent review,
candidate/diff/reference digests, package set, coverage set, compiled request,
selected independent Critic lane, verdict, finding lineage, correction commit,
invalidation and course counters.

The compiler rejects prose briefing outside the closed Critic packet. Coverage
contains every changed path, acceptance ID and declared integration-impact
edge. A first-pass `No findings` is valid only with:

- a schema-valid verdict;
- a non-empty complete coverage receipt;
- a delivered result digest;
- independent lane evidence; and
- no transport, parse, truncation or infrastructure failure.

Each correction uses a fresh Critic and exact delta plus impact closure.
Finding IDs persist until fixed, withdrawn with evidence or superseded by a
broader typed invalidation. The accepted course is at most four review rounds
and three correction commits. Exceeding either emits `po-course-gate`; no
automatic extra round occurs.

Existing `review-economy.mjs` remains the authority for configured course
limits and capacity admission. Nova stores its retained stage receipts and
projects consumption into that authority. Retained evidence can prove that a
stage occurred but can never itself become a PASS verdict.

The two Nova review-economics backlog items receive reconciliation previews
only after their own acceptance evidence exists.
`pipeline.critic-context-isolation` remains Cyborg-owned.

### 5.6 A6 — Benchmark and release preflight (`#8`, `#56`)

`pipeline.multi-cli-benchmark.v1` defines versioned task classes `mini`,
`feature`, `review`, `migration` and `failure-recovery`. Every run binds
candidate, fixture digest, adapter capability report, execution subjects,
resource envelope and unchanged scoring version.

Per-task measures are typed and separated:

- wall and CPU duration in milliseconds;
- admitted task concurrency;
- orchestration, workspace, verification, review, retry and cleanup duration;
- input/output usage with provider unit or `unknown`;
- operator interventions and failure/recovery class; and
- task outcome, never inferred from process exit alone.

Serial and runner-native baselines use the same fixtures/scoring. Nova B may
add local-pool/external observations but cannot rewrite prior results. A
recommendation requires task-level benefit inside the recorded resource
envelope; it is not universal. Delivery of this framework does not close
`pipeline.multi-cli-efficiency-pilots`.

Scoring version `nova-efficiency-v1` is fixed:

- use one excluded warm-up followed by five measured repetitions per task
  class and route, paired on the same host class and resource envelope;
- use a monotonic clock; a missing/reset clock invalidates the repetition;
- require identical correctness/evidence scores and zero false-success,
  authority or cleanup failures;
- compute median and nearest-rank p95 total wall time per class, plus the
  separately named overhead measures above;
- recommend a route only when at least three of five task classes improve
  median wall time by `>= 10%`, no class regresses median by `> 5%`, p95 does
  not regress by `> 10%`, operator interventions do not increase, and every
  resource bound remains within the admitted envelope; and
- make no cost-dependent recommendation when the relevant usage/cost unit is
  unknown.

The run stops immediately on false success, secret/private evidence, target
drift, resource usage above 120% of an admitted hard envelope, or two
consecutive infrastructure failures. Rollback disables the candidate route,
returns dispatch policy to the unchanged serial baseline and retains the
failed observations as non-PASS evidence. Each separately PO-gated
wave-review or remote-mini-train pilot must define its own route, threshold,
stop and rollback before execution; the framework cannot fill those values
after seeing results.

`pipeline.release-preflight.v1` is deterministic and local. It checks exact
candidate/base, version decision, repository cleanliness, documentation links,
feature lifecycle, PRD/Spec/acceptance/Result destinations, retention classes,
archive digest/provenance, public/private classification, bounded consent
status and registered gate inventory. `ready` means only “eligible to begin
final gates.”

Consent readback contains decision ID, status, authority digest and expiry; no
raw consent text, identity, credential or environment bytes. Remote, human,
Verify, Security and Critic gates remain separate. GG-03 fixtures cover valid,
missing, mismatched and ambiguous bindings. Cyborg can later register accepted
requirements through an extension input; Nova never guesses unpublished
Cyborg bytes.

### 5.7 A7 — Immutable Nova A increment

`pipeline.nova-increment-receipt.v1` has exact keys `schema`, `increment`,
`base`, `candidate`, `specification`, `acceptance`, `issues`, `backlog`,
`packages`, `gates`, `critic`, `collisions`, `evidenceManifest`, `result`,
`createdAt` and `receiptSha256`.

The product candidate is frozen before Full Verify, Security and final Critic.
All three bind the same commit/tree. The increment receipt binds that tested
candidate plus an exact evidence-manifest tree/digest; it does not bind its own
file digest or its enclosing commit. A first gate-only evidence commit `E1`
adds only that receipt, declared immutable evidence and an append-only Result
entry.

After `E1` exists, a separate
`pipeline.nova-increment-readback.v1` records `E1` commit/tree, receipt path,
receipt file digest, tested candidate, evidence-manifest digest and readback
status. A second gate-only commit `E2` adds that readback and the exact PO
decision that names the receipt digest. Neither record claims its own
enclosing commit. The continuation head is validated structurally: `E2` has
parent `E1`, both diffs touch only the enumerated gate-evidence paths, and
their records bind the frozen product candidate. Nova B's product base is the
accepted product candidate; its branch continuation head is the validated
gate-only descendant `E2`.

If any runtime, schema, test, gate configuration, generated projection or
other candidate-affecting byte changes in the tail, the tail is not gate-only
and all affected gates rerun.

Nova B entry requires the following for B1–B4R and B5/B6:

1. valid A receipt, `E1` readback, gate-only `E1`/`E2` ancestry and Result
   readback;
2. all nine A issue dispositions;
3. default-green backlog checker;
4. green Verify/Security and accepted independent Critic on one candidate;
5. no undispositioned Nova/Cyborg collision; and
6. explicit PO acceptance naming the receipt digest and activating Nova B.

## 6. Nova B technical contracts

### 6.1 B0 — Runner-native continuation baseline (`#60`)

B0 is the bounded main-session continuation baseline. It does not create a
watchdog, perform periodic recovery polling, restart or replace a host, elect
a writer, take over a branch, supervise a remote worker, or widen any approval,
sandbox, network, repository or host permission.

`pipeline.runner-native-continuation.v1` binds exactly one active executable
item to `featureId`, phase, approved plan/Spec digests, current action,
acceptance criteria and required verification evidence. The materialized goal
is a bounded derivative of those records; raw user messages, private paths,
host error prose and credentials are prohibited. A changed binding advances
the generation and invalidates the prior native readback.

The lifecycle is `active`, `paused-po-gate`, `blocked`, `achieved`, `cleared`,
`unavailable` or `failed`. Only `verified-completion`, `named-po-gate`,
`typed-blocker` and `explicit-control-change` are terminal reasons. While
`active`, an informational question, clarification or observation is recorded
as additive input and the exact current action continues. A PO gate clears or
pauses the native goal before the prompt and may reactivate only from a
recorded resolution. Pause, cancel, replacement and redirect always win over
automatic continuation.

Each runner adapter must activate/update one native goal, obtain a fresh
identity-and-generation-bound readback, and emit a bounded progress projection
from phase/revision, deadline, test/dispatch, candidate/evidence and read-only
artifact observations. Unknown progress remains unknown; no diff is required.
Codex uses its supported native goal interface; Claude Code uses its supported
native session-goal interface together with its Stop integration. Resume and
compact re-entry restore the same active generation or safely establish its
successor. Neither adapter may synthesize a next turn after a terminal state.

The capability result is `available`, `unavailable` or `failed`. Unsupported
or version-incompatible native-goal capability must persist a typed
`unavailable` record and leave the continuation claim degraded; it never
reports protected execution. Activation failure is bounded, de-duplicated and
typed. The existing Stop-hook context budget, deduplication and emergency
brake retain precedence and are not evaluated as goal success.

Conformance covers Codex and Claude Code premature-turn completion,
intermediate input, PO gate wait/resolution, typed blocker, explicit control,
resume/compact re-entry, read-only progress, successful completion and
unsupported capability. Tests prove that activation neither changes effective
permissions nor creates a duplicate native goal.

For Codex, an observed native `blocked` goal is a hard automation stop. The
adapter must return `CGH-BLOCKED-RESUME-REQUIRED`, name that automated Pipeline
work cannot continue, and instruct the user to resume in the Codex CLI. It may
not create a replacement goal, silently set the blocked goal active, or claim
that a mobile/read-only surface can resume it.

### 6.2 B1 — Local worker pool (`#21`)

B1-C implements only the pure schema/reducer and synthetic fault corpus.
B1-I functional same-host supervision is authorized by ADR-0047 plus accepted
ADR-0048 and its exact 20-path manifest. Live provider activation, external
execution and capability advertisement remain separately blocked.

`pipeline.local-worker-pool.v1` declares pool ID, candidate, queue revision,
configured/operator/certified/observed/pressure/reserved capacity, typed
effective capacity, workers, admission set and cleanup owner.

Effective `concurrent-tasks` is the minimum of every applicable known bound.
An unknown required bound makes parallel admission unavailable; it does not
become infinity. Reserved Elephant, Verify and Critic capacity is removed
before work admission.

Each worker has a unique subject, workspace binding, process identity,
heartbeat and observed assurance. Two workers are certified only when at least
two tasks actually overlap in time, use separately bound workspaces and pass
canary conflict tests. Worktree/process separation is recorded but never
labelled OS isolation without OS evidence.

Each nested workspace lease has exact keys `leaseId`, `subjectSha256`,
`repository`, `baseCommit`, `candidateCommit`, `worktreePathSha256`,
`writePaths`, `ownerNonce`, `issuedMonotonicMs`, `expiresMonotonicMs`,
`cleanupState` and `evidenceSha256`. Raw private absolute paths are not
portable evidence. Admission proves target/base/write authority; wrong target,
stale owner and foreign workspace fail before creation or cleanup.

Issue closure additionally requires a same-host, same-candidate,
same-fixture-set and same-resource-envelope measurement of runner-native
effective fan-out `N`. The local pool must complete a correct conflict-free
wave of at least `N + 1` overlapping workers, with `N + 1 >= 2`, without
consuming reserved capacity or weakening evidence. If `N` cannot be measured,
serial fallback remains valid but `#21` and the pool capability remain open.

Supervisor states are `created`, `admitting`, `running`, `draining`,
`completed`, `degraded`, `cancelled` and `recovery-required`. Crash recovery
reconciles only exact owned processes/workspaces, invalidates stale candidates,
imports each result independently and preserves serial fallback semantics.
Every admitted worker request declares `heartbeatIntervalMs` in
`[1000,60000]` and `orphanAfterMs` in
`[3 * heartbeatIntervalMs,600000]`. Monotonic time is authority. On expiry the
supervisor stops new admission, marks the worker `orphan-suspected`, proves
owned process/workspace identity, attempts bounded cancellation/cleanup and
records `orphaned` or `recovered`; unavailable ownership proof blocks cleanup
and capability success.

### 6.3 B2 — Async execution and credential leases (`#16`, `#18`)

B2-C implements pure validators/reducers with fake brokers and jobs. B2-I live
remote/broker integration is blocked by the same state-authority ADR plus
separate live-pilot authority.

`pipeline.async-execution-journal.v1` appends provider observations with exact
provider job binding, subject, provider sequence or `not-provided`, observation
digest, normalized state and prior entry digest. The reconciler handles
delayed, duplicate, out-of-order, cancellation-race, outage and late-success
fixtures. Provider success maps only to `succeeded-unverified`.

A provider pause maps to common `paused` only after a matching job/attempt
acknowledgement. The admitted request declares absolute timeout and optional
`maxPauseMs`; provider silence is `unknown`, not paused. Pause expiry requests
cancellation and then resolves through the normal cancellation race.
Restart replays the immutable observation chain and cannot manufacture a
resume. A later lower/equal provider sequence is duplicate if byte-identical
and conflict otherwise.

`pipeline.credential-lease.v1` contains no secret. It binds lease ID, broker,
subject, repository, operations, exact targets, issue/expiry, revocation
handle digest, credential class and readback status. A worker can reference
only an active lease whose complete scope is a subset of its admitted subject.

The broker is external to the repository. Secret material is delivered through
an approved ephemeral channel, never command arguments, files in the
repository, evidence, logs or environment dumps. Deterministic revocation runs
on success, failure, cancellation, timeout and recovery. Canary tests attempt
unrelated repository, credential, home, SSH and global Git access and require
denial.

The B2-C assumption subrecord has exact keys `assumptionSetId`,
`subjectSha256`, `assumptions`, `issuedBy`, `issuedAt`, `expiresAt`,
`stopConditions`, `escalation`, `forbiddenAuthorities` and `recordSha256`.
Assumptions are closed task-scoped name/value/source triples. Expiry or any
stop condition moves execution to `paused` or terminal `failed` according to
the admitted request; it never chooses a new assumption. Delegation, approval,
credential issuance, external mutation, merge and release are always in
`forbiddenAuthorities`.

Production remote execution or a live credential lease is blocked until a
separate ADR and explicit live-pilot authority approve the broker,
authentication, egress, revocation and incident boundaries.

### 6.4 B3-A / B3-R / B3-I — Antigravity with Gemini models (`#15`)

B3-R is a separately accepted research artifact, not implementation:
`pipeline.antigravity-contract-decision.v1`. It records official source URLs,
retrieval date, supported Antigravity version range, executable provenance,
authentication modes, Gemini model selectors, structured input/output,
usage, streaming, cancellation, exit/error taxonomy, sandbox behavior and
exact supported/unsupported target cells. Antigravity is the only Google
runtime surface in B3; Gemini names only the models selected within it.

No present-tense CLI behavior is assumed by this Spec. Research must use
current official primary documentation and an opt-in local version readback.
Requested model, CLI-reported model and independently attested model are
separate. Ambiguity stays `not-observed`.

B3-I remains blocked until:

- B3-R digest is independently reviewed and PO-accepted;
- a post-V3 additive migration decision is accepted;
- B2 leases or a separately approved operator-local auth boundary is ready;
- exact implementation file paths and schemas are appended to this package;
  and
- existing Claude/Codex frozen fixtures are selected as regressions.

**B3-A** is Nova's accepted Alpha third-runner boundary. It is a versioned,
documentation-bound descriptor that identifies `antigravity`, Gemini as its
model family, and a typed fail-closed selection result. It may expose only its
own descriptor cell. It must explicitly state Alpha status and may not discover
or install `agy`, authenticate, access a provider/network, invoke a runtime,
advertise execution, or add Antigravity to active runner mappings/profiles.

The direct implementation is transferred to Issue #69 with `sprint:NONE` for a
later dedicated AGY sprint. B3-A closes #15 only under this narrowed Nova
acceptance; it does not claim B3-I or direct AGY delivery.

Only B3-I may implement invocation, cancellation, result, usage and
conformance cells after its listed gates. Advisor/review/write capabilities
stay unsupported unless independently certified.

### 6.5 B4 — Provider-neutral forge and GitLab (`#51`)

`pipeline.forge-capability.v1` separates Git VCS from hosting and defines:
provider, base URL class, project coordinates digest, authentication mode,
capability cells, governance/tier observations and evidence. Cells are
`native`, `emulated`, `manual`, `unsupported` or `unavailable`.

The neutral vocabulary covers issue, change request, CI pipeline/job, branch
protection observation and governance observation. Provider-specific fields
remain inside adapter extensions.

Every mutation follows
`pipeline.external-mutation.v1`:

```text
requested -> previewed -> confirmed -> applied-unverified -> readback-verified
requested | previewed -> rejected | expired
confirmed -> failed | partial | unknown
applied-unverified -> readback-verified | mismatch | unknown
```

Preview binds provider/base/project, exact target, before digest, proposed
patch, operation, idempotency key, capability observation and expiry.
Confirmation must name the exact preview digest. Readback must match the
expected post-state; provider acceptance alone is not success. Retry reuses
the idempotency key and first reconciles remote state.

GitLab.com and explicit Self-Managed targets are distinct. At least one opt-in
live read-only GitLab capability is required for closure. Delete, transfer,
settings, permissions, silent close/relabel and broad batch mutations remain
unsupported without a separate PO-approved operation contract.

### 6.6 B4R — V4 recovery deadlock correction (`#63`)

The controlling design is
`specs/sprint-nova-epic/design/v4-recovery-b4r.md`.

A V4 `source_invalid` result exposes exactly one read-only
`plan-source-recovery` action. Its closed
`pipeline.project-onboarding-source-recovery.v1` result has exact root keys
`schema`, `status`, `root`, `category`, `sourceSha256`, `nextAction` and
`diagnostics`. Status is `recoverable|unrepairable`; category is exactly
`invalid-authority|stale-generated-projection|unsupported-source-transition|unavailable-evidence|current-authority`.
A recoverable result references only an existing fixed V3 inspect/plan or
preview-attested transaction recovery command. An unrepairable result has no
mutation and is the explicit terminal disposition.

A V4 `manifest_invalid` result exposes exactly one read-only
`plan-manifest-repair` action. Its closed
`pipeline.project-onboarding-manifest-repair-plan.v1` result has exact root
keys `schema`, `status`, `root`, `source`, `target`, `planSha256`,
`applyAction` and `diagnostics`. A ready plan binds:

- current V3 source path and SHA-256;
- sole target `.claude/pipeline.yaml`;
- absent preimage status, SHA-256 and byte length;
- present postimage SHA-256 and byte length;
- preservation mode `absent-target-only`; and
- canonical plan digest over those fields.

Apply recomputes and authenticates that plan, requires the exact digest plus
`--activate`, rejects source/preimage drift, atomically publishes only the
absent manifest with no-replace semantics and returns a fresh V4 inspection.
Source or parent drift at the publication boundary quarantines the exact
generated inode before readback. Existing manifests are always
`unrepairable`, remain byte-identical, and require their owning workflow.

Before readiness the lifecycle guard additionally permits only:

- those two exact read-only planner argv forms;
- the exact digest-bound and explicitly confirmed manifest apply; and
- `node <loaded-plugin>/scripts/v3-bootstrap-authority.mjs --root <exact-root>`.

Wrong roots, aliases, missing or extra arguments, chaining, redirection,
command substitution and every unrelated pre-ready write remain denied.
Recovery ends at V4 `ready`, another typed controlling state, or explicit
`unrepairable`; it never claims success from a generated file alone.

The broader Nightwing onboarding/documentation scope from `#61` is excluded.

### 6.7 B5/B6 — Candidate freeze and native macOS (`#49`)

Nova B first assembles one Nova-only candidate and freezes its commit/tree.
No unpublished Cyborg bytes are an input. The 17-issue acceptance mapping,
focused suites, backlog previews and artifact inventory must be complete
before native execution.

`pipeline.macos-acceptance.v1` binds candidate, hardware class
(`apple-silicon`, `intel`, `hosted-ci`, `synthetic`), OS/toolchain versions,
bootstrap digest, filesystem capability observations, runner capability
reports, lifecycle stages, gates, cleanup and sanitized evidence.

Its `lifecycle` section contains a closed continuity record:
`keepAwakeRequested`, `keepAwakeObserved`, `keepAwakeBoundMs`,
`inputAuthoritySha256`, `interruptionState`, `completionDelivery`,
`resumeTokenSha256` and `backgroundInputChannel`. Keep-awake values are
`not-requested`, `observed-active`, `denied`, `unavailable` or `expired`;
only an observation may use `observed-active`. `backgroundInputChannel` must
be `none`. Resume binds the prior interruption and exact authorized input;
missing delivery/resume evidence is non-success.

Apple Silicon is the required native closure class. Fixtures cover Unicode,
case-folding, symlinks, permissions, durability, process behavior and
tool-resolution. Hosted CI, Intel and synthetic observations never substitute
for Apple Silicon.

The exact frozen B5 candidate receives native lifecycle, Full Verify, Security,
independent high-risk Critic and PO acceptance. Post-gate evidence commits may
append sanitized evidence only; any runtime/schema/test/gate/configuration
change invalidates the applicable gates. Every issue gets an individual
disposition. Nova/Cyborg combined integration remains a later lifecycle.

## 7. Schema and file registry

### 7.1 Schema registry

| Schema | Owner slice | Producer | Consumer |
| --- | --- | --- | --- |
| `pipeline.backlog-delivery-intent.v1` | A1 | lifecycle/close integration | reconciliation writer |
| `pipeline.backlog-spec-binding.v1` | A1 | feature design | lifecycle/reconciliation |
| `pipeline.backlog-reconciliation-preview.v1` | A1 | reconciliation writer | authority gate |
| `pipeline.backlog-reconciliation-receipt.v1` | A1 | reconciliation writer | checker/Result/Cyborg mirror |
| `pipeline.backlog-evidence-amendment.v1` | A1 | repair planner | ledger validator |
| `pipeline.backlog-transition.v2` | A1 | reconciliation writer | mixed-ledger validator/projector |
| `pipeline.backlog-transaction-lock.v1` | A1 | reconciliation writer | contender/recovery |
| `pipeline.backlog-state-transaction.v2` | A1 | durable writer | recovery |
| `pipeline.nova-execution-subject.v1` | A4 | package compiler | all adapters |
| `pipeline.runner-capability-report.v1` | A2 | conformance suite | inventory/scheduler |
| `pipeline.selected-sandbox-disposition.v1` | A2 | resolver | invocation/conformance |
| `pipeline.invocation-request.v1` | A3 | preflight | launcher |
| `pipeline.invocation-attempt.v1` | A3 | launcher/importer | recurrence report |
| `pipeline.nova-execution-state.v1` | A4 | execution adapters | scheduler/verifier |
| `pipeline.execution-plane-request.v1` | A4 | execution compiler | adapter |
| `pipeline.scheduling-lifecycle.v1` | A4 | scheduling composer | executor |
| `pipeline.critic-review-lineage.v1` | A5 | Critic integration | course gate/Result |
| `pipeline.multi-cli-benchmark.v1` | A6 | benchmark runner | report/PO |
| `pipeline.release-preflight.v1` | A6 | preflight | gate operator |
| `pipeline.nova-increment-receipt.v1` | A7/B6 | gate assembler | next increment/close |
| `pipeline.nova-increment-readback.v1` | A7/B6 | independent gate readback | next increment/close |
| `pipeline.runner-native-continuation.v1` | B0 | continuation adapter | native-goal evaluator/re-entry |
| `pipeline.local-worker-pool.v1` | B1 | pool supervisor | scheduler/importer |
| `pipeline.async-execution-journal.v1` | B2 | external boundary | reconciler |
| `pipeline.credential-lease.v1` | B2 | external broker adapter | worker/revoker |
| `pipeline.antigravity-contract-decision.v1` | B3-R | research slice | ADR/PO gate |
| `pipeline.forge-capability.v1` | B4 | forge adapters | operations/conformance |
| `pipeline.external-mutation.v1` | B4 | forge operation | operator/readback |
| `pipeline.project-onboarding-source-recovery.v1` | B4R | V4 source recovery planner | Pipeline start/operator |
| `pipeline.project-onboarding-manifest-repair-plan.v1` | B4R | V4 manifest repair planner | confirmed lifecycle writer |
| `pipeline.macos-acceptance.v1` | B6 | native harness | final gate |

### 7.2 Closed root shapes and bounds

All listed keys are required. A conditionally inapplicable scalar/object is
`null`; it is never omitted. Every nested object rejects additional keys.
Unless a tighter rule is stated: IDs are 1–128 safe ASCII characters,
human-readable reasons are 1–512 UTF-8 characters, paths are 1–512 bytes,
sets contain at most 256 sorted unique entries, evidence sets at most 64, and
binary evidence is represented only by a digest/path, never inline.

| Schema | Exact root keys |
| --- | --- |
| backlog delivery intent | `schema,intentId,idempotencyKey,operation,item,sprint,specification,candidate,gates,authority,expected,evidence,createdAt` |
| backlog Spec binding | `schema,featureId,specification,backlogSnapshot,bindings,recordSha256` |
| backlog preview | `schema,previewId,intentSha256,status,reasons,preSnapshot,postSnapshot,targets,events,authorityRequired,previewSha256` |
| backlog receipt | `schema,receiptId,intentId,idempotencyKey,intentSha256,status,preSnapshot,postSnapshot,targets,eventSequences,appliedAt,recordSha256` |
| backlog evidence amendment | `schema,kind,targetSequence,targetEntryHash,targetCommit,replacementCommit,reference,dispositionSha256,idempotencyKey` |
| backlog transition v2 | `schema,sequence,id,from,to,at,actor,reason,evidence,previousHash,entryHash` |
| backlog transaction lock | `schema,ownerNonce,pid,processStartToken,bootSha256,leaseRevision,heartbeatMonotonicMs,leaseMs` |
| backlog transaction v2 | `schema,transactionId,idempotencyKey,ownerNonce,operationSha256,phase,expectedLedgerHead,intendedLedgerHead,targets,receiptPath,receiptSha256,createdAt` |
| execution subject | `schema,repository,baseCommit,baseTree,candidateCommit,candidateTree,packageId,dispatchId,attempt,queueRevision,authorityDigests,writePaths,resources` |
| runner capability report | `schema,reportId,identity,environment,capacity,cells,assurance,bindings,recordSha256` |
| sandbox disposition | `schema,dispositionId,duty,transport,fingerprint,state,failure,attempt,challenge,childReceipt,expiry,forceReprobe,assurance,previousSha256,recordSha256` |
| invocation request | `schema,invocationId,subject,route,duty,sandboxDispositionSha256,command,inputDigests,timeoutMs,allowedOutputs,privacyClass,requestSha256` |
| invocation attempt | `schema,attemptId,invocationId,index,requestSha256,launchDecision,failureClass,started,ended,resultSha256,previousSha256,recordSha256` |
| execution state | `schema,subject,subjectSha256,state,revision,observation,result,reason,previousSha256` |
| execution-plane request | `schema,requestId,subject,adapter,locality,workspace,network,mounts,writePaths,resources,sidecars,credentialLease,heartbeat,timeout,cancellation,resultDelivery,frozenBinding,requestSha256` |
| scheduling lifecycle | `schema,queue,plannerInputSha256,plannerReceiptSha256,subjectSetSha256,revision,selected,blocked,completed,failed,cancelled,invalidated,previousSha256` |
| Critic lineage | `schema,reviewId,parentReviewId,candidate,diff,references,packages,coverage,request,lane,verdict,findings,correction,invalidation,course,previousSha256,recordSha256` |
| benchmark | `schema,benchmarkId,scoringVersion,candidate,fixture,adapterReportSha256,subjects,resourceEnvelope,warmups,repetitions,observations,score,recommendation,recordSha256` |
| release preflight | `schema,preflightId,candidate,base,version,repository,documentation,lifecycle,retention,consent,gates,extensions,status,reasons,recordSha256` |
| increment receipt | `schema,increment,base,candidate,specification,acceptance,issues,backlog,packages,gates,critic,collisions,evidenceManifest,result,createdAt,receiptSha256` |
| increment readback | `schema,increment,receiptPath,receiptFileSha256,testedCandidate,evidenceCommit,evidenceTree,evidenceManifestSha256,status,observedAt,recordSha256` |
| runner-native continuation | `schema,continuationId,subject,objective,acceptance,evidence,terminal,runner,generation,status,progress,readback,reason,recordSha256` |
| local worker pool | `schema,poolId,candidate,queueRevision,capacity,workers,admission,state,cleanup,previousSha256,recordSha256` |
| async journal | `schema,journalId,providerJob,subject,providerSequence,observationSha256,state,reason,observedAt,previousSha256,entrySha256` |
| credential lease | `schema,leaseId,broker,subjectSha256,repository,operations,targets,issuedAt,expiresAt,revocationHandleSha256,credentialClass,status,readbackSha256,recordSha256` |
| Antigravity decision | `schema,decisionId,sources,retrievedAt,cli,provenance,authentication,models,input,output,usage,streaming,cancellation,errors,sandbox,cells,status,recordSha256` |
| forge capability | `schema,reportId,provider,baseUrlClass,projectCoordinatesSha256,authenticationMode,cells,governance,evidence,recordSha256` |
| external mutation | `schema,mutationId,provider,target,beforeSha256,patch,operation,idempotencyKey,capabilitySha256,preview,confirmation,state,remoteReceipt,readback,previousSha256,recordSha256` |
| V4 source recovery | `schema,status,root,category,sourceSha256,nextAction,diagnostics` |
| V4 manifest repair plan | `schema,status,root,source,target,planSha256,applyAction,diagnostics` |
| macOS acceptance | `schema,acceptanceId,candidate,hardwareClass,os,toolchain,bootstrapSha256,filesystem,runnerReports,lifecycle,gates,cleanup,evidence,status,recordSha256` |

Reusable nested types are also closed:

| Type | Exact keys and rule |
| --- | --- |
| `GitCandidate` | `commit,tree`; both full OIDs, or the containing field is `null` |
| `DigestRef` | `kind,path,sha256`; path may be `null` only for an observed non-file value |
| `AuthorityRef` | `kind,decisionId,receiptPath,receiptSha256`; no raw decision prose |
| `EvidenceRef` | `kind,path,fileSha256,recordSha256`; `recordSha256` may be `null` for non-JSON evidence |
| `CapacityValue` | `unit,value,source,status`; status `known|unknown|unavailable`, value non-negative integer only for `known` |
| `TargetImage` | `exists,sha256,bytesBase64`; absent image has `exists:false`, SHA-256 of empty bytes and empty Base64 |
| `TransactionTarget` | `path,pre,post`; `pre/post` are `TargetImage` |
| `GateRef` | `gate,candidate,evidence,status`; status `passed|failed|unavailable`, evidence is `EvidenceRef` |
| `TimedObservation` | `source,monotonicMs,wallTime,rawSha256`; wall time may be `null`, monotonic time may not |

Schema-specific nested shapes:

| Schema/field | Exact nested keys or element shape |
| --- | --- |
| delivery `item` | `id,path,expectedStatus,expectedFileSha256,draft`; draft is `null` except initialize, otherwise `metadata,bodyBase64,bodySha256` |
| delivery `sprint` | `name,increment`; exact `Nova,A|B` for Nova |
| delivery `specification` | `path,fileSha256,approvalReceiptSha256`; approval required for assign/close |
| delivery `candidate` | `GitCandidate|null`; null only for initialize/assign |
| delivery `expected` | `ledgerHead,indexFileSha256,statusFileSha256,backlogSubtree` |
| delivery `gates/evidence` | sorted `GateRef[]` / `EvidenceRef[]` |
| backlog snapshot | `commit,tree,backlogSubtree,ledgerHead,indexFileSha256,statusFileSha256,itemFileSha256`; final member is sorted `{id,sha256}[]` |
| backlog preview `targets/events` | sorted `{path,preSha256,postSha256}[]` / ordered `{sequence,schema,id,from,to,entryHash}[]` |
| runner `identity` | `adapterId,adapterVersion,implementationSha256,requestedRunner,requestedModel,observedRunner,observedModel` |
| runner `environment` | `platformClass,architectureClass,hostClass,fingerprintSha256` |
| runner `capacity` | sorted `CapacityValue[]`; no cross-unit minimum |
| runner `cells` | sorted `{capabilityId,mode,status,evidence}[]`; evidence is sorted `EvidenceRef[]` |
| runner `assurance` | `workspace,process,filesystem,network,os`; each `observed|not-observed|unavailable` plus evidence digest |
| sandbox `fingerprint` | `runnerSha256,hostBootSha256,platformClass,architectureClass,sandboxSha256,profileSha256,policySha256,duty,contractVersion` |
| sandbox `attempt/challenge` | `attemptId,index,startedMonotonicMs` / `nonceSha256,bits`; challenge is non-null only while probing/attested |
| sandbox `childReceipt` | `childIdSha256,attemptId,nonceSha256,duty,transport,subjectSha256,assurance,resultSha256,terminal`; null unless `available-attested` |
| sandbox `expiry` | `kind,eligibleAfterMonotonicMs`; kind `session|transient-ttl|fingerprint-drift|none` |
| invocation `route` | `runner,adapterId,adapterVersion,requestedModel`; observed identity appears only in result evidence |
| invocation `command` | `contractId,executableSha256,arguments`; arguments are closed typed tokens, never shell text |
| invocation `started/ended` | `TimedObservation|null`; start null before launch, end null while active |
| execution `adapter` | `kind,version,implementationSha256`; locality enum is defined in §5.4 |
| execution `workspace` | `identitySha256,separation,assuranceEvidenceSha256`; no raw private path |
| execution `network/mounts/resources` | `mode,egressClasses` / sorted `{sourceClass,targetClass,mode,evidenceSha256}[]` / sorted `CapacityValue[]` |
| execution `heartbeat/timeout/cancellation/resultDelivery` | `intervalMs,orphanAfterMs` / `absoluteMs,maxPauseMs` / `supported,deadlineMs` / `mode,maxBytes,destinationClass` |
| execution `observation` | `TimedObservation` plus `adapterState,rawStateSha256`; result is `resultSha256,bytes,status` or null |
| scheduling `queue` | `queueId,candidate,revision,packagesSha256`; each outcome list uses `{packageId,reason,evidenceSha256}[]` |
| Critic `coverage` | `changedPaths,acceptanceIds,integrationEdges,complete,receiptSha256`; all sets sorted/non-empty |
| Critic `course` | `reviewRound,correctionCommitCount,maxReviewRounds,maxCorrectionCommits,status`; maxima fixed to 4/3 |
| benchmark `fixture` | `class,path,fileSha256,seed`; observations use `route,repetition,outcome,measures,resourceUse,evidenceSha256` |
| benchmark `score` | `medianWallMs,p95WallMs,classImprovementPct,classRegressionPct,correctnessEqual,resourceWithinEnvelope` |
| preflight sections | each of `version,repository,documentation,lifecycle,retention,consent,gates,extensions` is `{status,reasons,evidence}` with sorted reasons and `EvidenceRef[]` |
| increment `base/candidate` | `GitCandidate`; `evidenceManifest` is `path,fileSha256,treeDigest`; issues are sorted `{issue,acceptanceIds,status,evidenceSha256}[]` |
| continuation `subject/objective/acceptance/evidence` | closed `featureId,phase,planSha256,specSha256,queueRevision,packageId,actionId` / `conditionSha256,summarySha256` / sorted `{criterionId,status,evidenceSha256}[]` / sorted `EvidenceRef[]`; no raw prompt/message/path |
| continuation `terminal/runner/generation/status/progress/readback/reason` | `kind,atRevision` / `runnerId,adapterVersion,capability` / non-negative integer and goal digest / lifecycle enum in §6.1 / sorted typed observations with `known|unknown|unavailable` / `goalIdSha256,generation,observedAt,status` / typed code plus optional evidence digest |
| pool `capacity` | `configured,operator,certified,observed,pressure,reserved,effective`, each `CapacityValue` in `concurrent-tasks` |
| pool `workers` | sorted `{workerId,subjectSha256,workspaceLease,processIdentitySha256,state,heartbeatMonotonicMs,resultSha256}[]` |
| pool `cleanup` | `ownerNonce,requested,completed,blocked,receipts`; receipt list is sorted `EvidenceRef[]` |
| async `providerJob` | `provider,jobIdSha256,adapterVersion`; raw job/account coordinates prohibited |
| lease `operations/targets` | sorted closed operation IDs / sorted target digests; status `issued|active|revoked|expired|unknown` |
| Antigravity sections | every source is `url,retrievedAt,contentSha256`; CLI is `version,executableSha256,versionOutputSha256`; all behavioral sections are sorted observed cells with evidence |
| forge `cells` | sorted `{capabilityId,mode,status,evidence}[]`; target is `provider,baseUrlClass,projectCoordinatesSha256,objectType,objectIdSha256` |
| external mutation `preview/confirmation/readback` | `previewSha256,expiresAt` / `authoritySha256,previewSha256,confirmedAt` / `observedSha256,expectedSha256,status,observedAt` |
| macOS `os/toolchain` | `version,build,architecture` / sorted `{tool,version,executableSha256}[]`; private host serial/account data prohibited |
| macOS `filesystem` | sorted `{capability,status,evidenceSha256}[]`; lifecycle continuity is closed in §6.6 |

Closed discriminators:

- backlog operation: `initialize|assign|close|amend-evidence`;
- binding expiry disposition:
  `not-applicable|revalidate:YYYY-MM-DD`; a revalidation date at or before
  close requires fresh PO renewal evidence;
- preview/receipt status:
  `preview|rejected` and `applied|noop|rejected`, respectively;
- sandbox state/failure/expiry use only the states and timing rules in §5.2;
- execution/locality/state use only §§4 and 5.4;
- provider sequence is a non-negative integer or literal `not-provided`;
- capability cells use only the enums in §§5.2 and 6.5;
- external mutation uses only the §6.5 states; and
- all record chains use `previousSha256:null` at genesis and the exact prior
  semantic record digest thereafter.

Every public validator throws or returns a stable domain-prefixed code from
`SHAPE`, `SCHEMA`, `BOUND`, `AUTHORITY`, `CAS`, `STALE`, `REPLAY`,
`CONFLICT`, `UNAVAILABLE`, `DURABILITY`, `READBACK` or `INTERNAL`.
`INTERNAL` never maps to success. JSON Schema owns closed structural shape and
all constraints expressible in JSON Schema 2020-12. When the normative
contract also contains ordering, cross-item uniqueness, digest equality or
relational timing rules, the Spec names one canonical semantic runtime
validator. Public acceptance then requires both structural and semantic
success, and that combined public contract must accept/reject the same corpus
as runtime admission. B1-I uses
`validateLocalWorkerSupervisorRequest` as that canonical semantic validator;
standalone Schema success is not supervisor admission.

### 7.3 Exact implementation paths

Every slice may modify only the listed paths. A new need returns to the Spec
gate with collision review. In this table, “schemas `<name>` under
`plugins/pipeline-core/scripts/`” means the exact path
`plugins/pipeline-core/scripts/<name>.schema.json` for every listed name.

| Slice | New paths | Existing paths allowed to change |
| --- | --- | --- |
| A1 | `plugins/pipeline-core/lib/backlog-delivery-reconciliation.mjs`, matching `.test.mjs`; `plugins/pipeline-core/scripts/reconcile-backlog-delivery.mjs`, matching `.test.mjs`; schemas `backlog-delivery-intent`, `backlog-spec-binding`, `backlog-reconciliation-preview`, `backlog-reconciliation-receipt`, `backlog-evidence-amendment`, `backlog-transition-v2`, `backlog-transaction-lock` and `backlog-state-transaction` under `plugins/pipeline-core/scripts/`; `backlog/schemas/transition-v2.schema.json`; `specs/sprint-nova-epic/design/backlog-spec-bindings.json`; `specs/sprint-nova-epic/evidence/backlog/2026-07-24-unreachable-evidence-disposition.md`; `event-39-amendment-intent.json`; `event-40-amendment-intent.json`; `issue-57-bootstrap-intent.json` in that evidence directory | `plugins/pipeline-core/lib/backlog-state.mjs`, matching `.test.mjs`; `plugins/pipeline-core/scripts/check-backlog-state.mjs`; `plugins/pipeline-core/lib/feature-package-topology.mjs`, matching `.test.mjs`; `plugins/pipeline-core/scripts/check-artifact-lifecycle.mjs`, matching `.test.mjs`; exact canonical targets `backlog/items/2026-07-24-backlog-delivery-status-reconciliation.md`, `backlog/transitions.ndjson`, `backlog/index.json`, `backlog/STATUS.md`; bounded receipts `backlog/receipts/<64-lowercase-hex-idempotency-key>.json`; transient lock/journal paths named in §3.1 |
| A2 | `plugins/pipeline-core/lib/runner-capability-report.mjs`, matching `.test.mjs`; `plugins/pipeline-core/lib/selected-sandbox-disposition.mjs`, matching `.test.mjs`; `plugins/pipeline-core/scripts/runner-capability-report.schema.json`; `plugins/pipeline-core/scripts/selected-sandbox-disposition.schema.json` | none |
| A3 | `plugins/pipeline-core/lib/invocation-reliability.mjs`, matching `.test.mjs`; `plugins/pipeline-core/scripts/invocation-preflight.mjs`, matching `.test.mjs`; `plugins/pipeline-core/scripts/invocation-request.schema.json`; `plugins/pipeline-core/scripts/invocation-attempt.schema.json` | none |
| A4 | `plugins/pipeline-core/lib/execution-plane-contract.mjs`, matching `.test.mjs`; `plugins/pipeline-core/lib/scheduling-lifecycle.mjs`, matching `.test.mjs`; `plugins/pipeline-core/scripts/nova-execution-subject.schema.json`; `plugins/pipeline-core/scripts/execution-plane-request.schema.json`; `plugins/pipeline-core/scripts/nova-execution-state.schema.json`; `plugins/pipeline-core/scripts/scheduling-lifecycle.schema.json` | none; frozen planner/exchange/workflow files are test inputs only |
| A5 | `plugins/pipeline-core/lib/critic-review-lineage.mjs`, matching `.test.mjs`; `plugins/pipeline-core/scripts/critic-review-lineage.schema.json` | `plugins/pipeline-core/scripts/critic-packet-preflight.mjs`, matching `.test.mjs`, only for closed lineage admission; `plugins/pipeline-core/lib/review-economy.mjs`, matching `.test.mjs`, only for projection |
| A6 | `plugins/pipeline-core/lib/multi-cli-benchmark.mjs`, matching `.test.mjs`; `plugins/pipeline-core/scripts/multi-cli-benchmark.schema.json`; `plugins/pipeline-core/scripts/release-preflight.mjs`, matching `.test.mjs`; `plugins/pipeline-core/scripts/release-preflight.schema.json`; exact fixtures `plugins/pipeline-core/scripts/fixtures/nova-benchmark/mini.json`, `feature.json`, `review.json`, `migration.json`, `failure-recovery.json` | none |
| A7 | `plugins/pipeline-core/lib/nova-increment-receipt.mjs`, matching `.test.mjs`; schemas `nova-increment-receipt` and `nova-increment-readback` under `plugins/pipeline-core/scripts/`; exact evidence paths `specs/sprint-nova-epic/evidence/nova-a/evidence-manifest.json`, `increment-receipt.json`, `increment-readback.json`, `verify.json`, `security.json`, `critic.json`, `po-activation.json` | `harness/scripts/verify.mjs`; `specs/sprint-nova-epic/lifecycle.json`; `specs/sprint-nova-epic/plans/nova-a.md`; `specs/sprint-nova-epic/plans/nova-b.md`; append-only `specs/sprint-nova-epic/result.md` |
| B0 | `plugins/pipeline-core/lib/runner-native-continuation.mjs`, matching `.test.mjs`; `plugins/pipeline-core/scripts/runner-native-continuation.schema.json`; `plugins/pipeline-core/scripts/codex-goal-host.mjs`, matching `.test.mjs`; `plugins/pipeline-core/scripts/claude-goal-host.mjs`, matching `.test.mjs`; cross-runner fixtures under `plugins/pipeline-core/scripts/fixtures/runner-native-continuation/` | `plugins/pipeline-core/lib/continuity-state.mjs`, matching `.test.mjs`; `plugins/pipeline-core/lib/continuity-status.mjs`, matching `.test.mjs`; `plugins/pipeline-core/lib/interaction-continuity.mjs`, matching `.test.mjs`; `plugins/pipeline-core/scripts/continuity-status.mjs`, matching `.test.mjs`; `plugins/pipeline-core/hooks/stop-suggest.mjs`, matching `.test.mjs`; append-only `specs/sprint-nova-epic/result.md` for sanitized activation/readback evidence |
| B1-C | `plugins/pipeline-core/lib/local-worker-pool.mjs`, matching `.test.mjs`; `plugins/pipeline-core/scripts/local-worker-pool.schema.json`; `specs/sprint-nova-epic/design/execution-state-authority-proposal.md` | none; pure contract/synthetic reducer only |
| B1-I | `docs/adr/0048-local-goldfish-supervisor.md`; `plugins/pipeline-core/lib/local-worker-supervisor.mjs`, matching `.test.mjs`; `plugins/pipeline-core/scripts/local-worker-supervisor.mjs`, matching `.test.mjs`; `plugins/pipeline-core/scripts/local-worker-supervisor.schema.json`; `plugins/pipeline-core/scripts/fixtures/local-worker-supervisor-worker.mjs` | `.claude/pipeline-state.json`; `docs/adr/README.md`; `docs/local-supervisor-state-threat-model.md`; `docs/product-capability-inventory.json`; `docs/state.md`; `governance/observation-doc-governance.json`; `harness/scripts/verify.mjs`; this Spec; `acceptance.md`; `plans/nova-b.md`; `prd_sprint-nova-epic.md`; append-only `result.md`; `lifecycle.json`, exactly as accepted in ADR-0048 |
| B2-C | `plugins/pipeline-core/lib/async-execution.mjs`, matching `.test.mjs`; `plugins/pipeline-core/lib/credential-lease.mjs`, matching `.test.mjs`; `plugins/pipeline-core/scripts/async-execution-journal.schema.json`; `plugins/pipeline-core/scripts/credential-lease.schema.json`; `specs/sprint-nova-epic/evidence/nova-b/execution-state-authority-decision.json` | none; synthetic contract only |
| B2-I | external broker/remote adapter files fixed by the approved ADR | blocked until separate remote/credential/state-authority ADR and path manifest |
| B3-R | `specs/sprint-nova-epic/evidence/nova-b/antigravity-contract-decision.json` | `specs/sprint-nova-epic/lifecycle.json`; append-only `specs/sprint-nova-epic/result.md` |
| B3-A | `plugins/pipeline-core/scripts/antigravity-alpha-adapter.mjs`, matching `.test.mjs` | `GEMINI.md`; this Spec; `acceptance.md`; `plans/nova-b.md`; `plans/integration-and-close.md`; `prd_sprint-nova-epic.md`; append-only `result.md`; `lifecycle.json` |
| B3-I | blocked until B3-R appends exact paths and migration decision | blocked |
| B4 | `plugins/pipeline-core/lib/forge-capability.mjs`, matching `.test.mjs`; `plugins/pipeline-core/scripts/gitlab-forge-adapter.mjs`, matching `.test.mjs`; `plugins/pipeline-core/scripts/forge-capability.schema.json`; `plugins/pipeline-core/scripts/external-mutation.schema.json`; design artifact `specs/sprint-nova-epic/design/forge-capability-b4.md` | none before live-operation approval |
| B4R | design artifact `specs/sprint-nova-epic/design/v4-recovery-b4r.md` | `plugins/pipeline-core/lib/project-onboarding-v3.mjs`, matching `.test.mjs`; `plugins/pipeline-core/scripts/project-onboarding-v3.mjs`, `project-onboarding-e2e.test.mjs`; `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`, matching `.test.mjs`; `plugins/pipeline-core/hooks/codex-pretool-guard.test.mjs`; `plugins/pipeline-core/skills/pipeline-start/SKILL.md`, `pipeline-start-v3.test.mjs`; `.claude/pipeline-state.json`; `docs/codex-onboarding-threat-model.md`; this PRD, Spec, Acceptance, Nova B plan, backlog binding, lifecycle manifest and append-only Result |
| B5/B6 | `plugins/pipeline-core/lib/macos-acceptance.mjs`, matching `.test.mjs`; `plugins/pipeline-core/scripts/macos-acceptance.schema.json`; exact fixtures `plugins/pipeline-core/scripts/fixtures/nova-macos/filesystem.json`, `unicode.json`, `case-folding.json`, `symlink.json`, `permissions.json`, `durability.json`, `process.json`, `tool-resolution.json`; exact evidence `specs/sprint-nova-epic/evidence/nova-b/candidate-freeze.json`, `evidence-manifest.json`, `macos-acceptance.json`, `verify.json`, `security.json`, `critic.json`, `increment-receipt.json`, `increment-readback.json`, `po-close.json`; `docs/runner-support.md`; `docs/macos-support.md` | `harness/scripts/verify.mjs`; `specs/sprint-nova-epic/lifecycle.json`; `specs/sprint-nova-epic/plans/nova-b.md`; append-only `specs/sprint-nova-epic/result.md` |

The remaining deliberately deferred manifests are B2-I, B3-I and live B4
integration. B1-I is resolved by accepted ADR-0048, but its provider-backed
live `N+1 >= 2` capability observation remains a separate activation and Issue
closure gate. The other research/ADR gates remain because external executor
storage, current contracts and credential boundaries cannot be safely frozen
by assumption.

### 7.4 Focused verification commands

Each slice runs its matching `node <path>.test.mjs`, relevant unchanged
dependency tests and `git diff --check`. A1 additionally runs the default
`node plugins/pipeline-core/scripts/check-backlog-state.mjs`; A2 runs existing
Codex sandbox compatibility/select/runtime tests; A4 runs existing planner,
control-exchange and workflow-boundary tests; A5 runs existing Critic and
review-economy tests. B4R runs
`project-onboarding-v3.test.mjs`, `project-onboarding-e2e.test.mjs`,
`guard-lifecycle-ready.test.mjs`, `codex-pretool-guard.test.mjs` and
`pipeline-start-v3.test.mjs`; process fixtures requiring real Git execute in
the selected process-capable boundary rather than accepting sandbox `EPERM`.

A7 and B6 register only completed focused suites in
`harness/scripts/verify.mjs` and run the repository-configured Full Verify and
Security commands. A registration is not evidence that the suite passed.

## 8. Security, privacy and authority boundaries

Threats and required controls:

| Threat | Control |
| --- | --- |
| false success from admission/process exit/provider status | common non-success states plus result/verification/PO separation |
| replay or stale candidate | full subject, CAS, revision and idempotency bindings |
| confused deputy | closed authority, path, resource, target and operation scopes |
| worker escape/secret access | observed isolation only, leases, canaries and external broker |
| ledger corruption/partial write | append-only hash chain, v2 journal, rollback and exact readback |
| forged historical repair | target sequence/hash/OID plus reachable replacement and repair authority |
| capability inflation | requested/advertised/certified/observed fields remain separate |
| private-host leakage | bounded enums/digests; no raw env, user, home, account or token data |
| cross-Sprint collision | declared paths/resources and later accepted-OID reconciliation |
| remote mutation ambiguity | exact preview, confirmation, idempotency and readback |
| gate laundering through retained evidence | evidence proves occurrence only; verdict stays independent |

No Nova contract grants delegation, merge, release, approval, credential
issuance, policy waiver or broad external mutation authority. Logs use
allowlisted fields and bounded cardinality. Synthetic fixtures contain only
fake credentials and hosts.

## 9. Compatibility and migration

- Existing backlog items/events/index remain valid. Transaction v1 is
  recoverable but never newly written after A1.
- Evidence amendment is additive; old event bytes and hashes do not change.
- Frozen exchange/planner/workflow/runner V3 schemas remain byte-compatible.
- Existing Claude and Codex behavior remains the regression baseline.
- Product capability inventory remains authoritative; Nova runner reports are
  inputs, not a replacement.
- Public Core remains forge-neutral and Git remains the only VCS.
- Nova makes no release version bump.
- Nova does not merge or rebase from `main` or consume unpublished Cyborg
  output. Later integration uses exact accepted Nova and Cyborg OIDs.

Rollback of code uses a normal forward Git change. Rollback of canonical
backlog history never deletes events; it appends an authorized corrective
transition only if the lifecycle permits one. Because closed is terminal in v1,
an erroneous closure requires a new approved schema/decision rather than a
fabricated reopen.

## 10. Readiness and completion predicates

The technical Spec is ready for PO approval only when:

1. its digest, the PRD/acceptance digests and baseline bindings validate;
2. every new schema has exact producer, consumer and owner;
3. every stateful surface has transition, crash, recovery and concurrency
   semantics;
4. every Nova A package has exact files/tests and no unresolved frozen edit;
5. B3-I and live credential/external mutations are explicitly blocked behind
   their own research/ADR/authority gates;
6. the Nova/Cyborg collision matrix remains consistent;
7. an independent high-risk Advisor has no undispositioned blocker/major
   design finding; and
8. lifecycle and Result record only Spec readiness, not implementation or
   product completion.

After approval, implementation still starts only through the Nova A entry gate.
No acceptance ID is satisfied by this document alone.

## 11. Rejected alternatives

- **Close backlog items from issue labels or file presence:** rejected because
  neither proves accepted delivery.
- **Hand-edit ledger projections:** rejected because it breaks append-only
  provenance and atomic readback.
- **Rewrite events 39/40:** rejected because historical bytes are authority.
- **Treat CAS or child launch as selected-sandbox success:** rejected because
  it does not attest the selected child/duty/result.
- **Extend frozen v1/V3 schemas in place:** rejected because existing consumers
  would accept ambiguous authority.
- **Use worktrees/processes as OS isolation evidence:** rejected because
  separation and isolation are different properties.
- **Implement a live provider from remembered CLI behavior:** rejected because
  current official contract, authentication and version provenance are
  required.
- **Make Nova completion depend on Cyborg:** rejected because both Sprints must
  close independently before a later integration lifecycle.
