# C1 emission and local reports — bounded implementation plan

Status: design refinement of approved #103, 2026-09-08. No emission, native
observation qualification, baseline start, independent review or acceptance is
claimed by this document. This is a staged design, not a production dispatch
brief: the exact new observer/projection/collector schemas called out below
must be frozen before their respective implementation tasks. Step 1
classification and step 2 aggregation are
locally implemented; step 3 remains open until real observation, persistence
and reporting work together.

## Authority and contract boundaries

The first-slice contracts are [C1 preflight observation](c1-preflight-observation.md)
and [C1 store/controller](c1-store-controller.md). The store plan refines the
older flat-filename proposal with a digest-directory layout, synchronous
controller, and expanded bounded metadata.

Authority: `specs/sprint-alfred-epic/spec.md` §§2, 6.1, 9, 10, 12 and 13,
the #103 snapshot at lines 377–466, `plans/c1-core.md` step 3, and
`plans/c1-aggregation.md`. Preserve the Interruption receipt + registry family
revision 1, digest
`e60c80dd242b9d4dde5fd3b035b4ad56671c10117568f82b31d77d430fe12ff5`,
`c1-classification-r1`, and the exact validated registry digest.

Keep the existing receipt/aggregate module pure. The new adapter imports its
constructors and validators; it does not add file access, implicit clocks or
authority decisions to them. Source validators for invocation, review and
usage retain their contracts. No policy/registry change, guard relaxation,
runner-profile migration, hosted telemetry or installed-plugin change belongs
to this work. An emitted receipt never authorizes a blocked operation.

The existing classifier matches source kind and a complete set of facts within
one observation. A non-null original typed code is also required. It does not
infer classification from an error-code prefix or natural-language diagnosis.
The adapter must therefore construct facts at their owning observation branch,
not accept arbitrary `--facts` or a model-selected classification.

## Source ingestion and privacy projection

The first exact contract is the [C1 source-projection plan](c1-source-projection.md).
Pure invocation/review source projection belongs in
`plugins/pipeline-core/lib/interruption-source-adapter.mjs`. It accepts bytes
plus closed repository-local routing/binding context, validates full owning
source records, and builds only existing C1 observations and join rows. It
does not launch a tool, inspect a session or write a file. Usage ingestion is a
later separate read-only I/O adapter because owning `ingestRunnerUsage` reads
shipped schemas and an exact route receipt during binding.

Reject duplicate JSON keys before source validators see parsed data. Reuse
`parseStrictJson` from `lib/governance-event.mjs`, preceded by a byte/nesting
bound because that parser is recursive and has no such bound. Limits for this
new ingestion boundary: 1 MiB per document, 16 MiB per call and depth 64 for
the full source document, checked without interpreting quoted brackets as
structure. Existing per-receipt depth 16 and source-specific cardinality limits
still apply independently. Reject malformed UTF-8, BOM, non-scalar Unicode,
nonfinite numbers, duplicate keys and unsupported byte inputs. Hash the exact
accepted source bytes before projection; canonical source-record hashes keep
their owning definitions. Do not substitute one kind of digest for the other.

| Source | Required validation and projection |
|---|---|
| Invocation | Validate request and ordered complete attempts with `validateInvocationChain`; project the six existing C1 invocation-row fields. Derive `invocationResolutionKey` only with its owning function and actually available fingerprint. |
| Review | Validate complete oldest-to-newest history with `validateCriticReviewHistory`; project existing review identity/predecessor/digest fields. Current receipt candidate remains distinct from predecessor candidates allowed by correction history. |
| Usage | Later separate read-only I/O adapter: strictly inspect exact native bytes, then pass those same bytes and authentic source/route context to `ingestRunnerUsage`. Admit only a bound dispatch matching receipt scope and its native event digest. Never export native thread/turn/provider IDs. |
| Recovery | Accept only a validated sanctioned recovery artifact with existing public artifact identity and exact digest; a free-form claim or newly minted repair ID is insufficient. |

The first adapter supports complete invocation/review histories only. A caller
without a complete valid history omits that optional join and records unknown
or unavailable coverage; it must not certify a partial list with a full-history
validator. Invalid supplied evidence is rejected, not silently omitted. A
later partial-source adapter would need its own bounded design; existing pure
C1 support for partial projected links remains unchanged.

Scope, actor and public artifact IDs come from actual local dispatch/feature
context. No source object spreading is allowed. Prompts, command arguments,
paths, transcripts, account/session IDs, findings bodies and raw usage stay
out of receipts, diagnostics and reports. Context that cannot be established
remains null with the existing explicit status. Candidate-required observers
reject absent or mismatched full commit/tree bindings. Byte validation proves
source consistency, not authentic acquisition from a native host.

The existing scope requires at least one observed feature/package/dispatch ID.
If none can be established, do not emit a receipt; record a closed collection
diagnostic and unknown coverage instead of fabricating scope.

## Observation and integration contract

The production observer must execute once at the existing result branch,
after the owning decision is known. It must not rerun a guard, consume an
override twice, turn a read-only inspection into a writer, or fabricate an
event from a fixture launcher. Preserve the operation's admission decision,
exit status and existing stdout/stderr protocol. A telemetry failure produces
a separate closed local diagnostic and a collection gap; it cannot turn a
denial into permission or silently claim successful collection.

Concrete observation mappings and the first live caller follow below. Required
coverage includes guard refusal, expected/authority gate waits, dispatch
failure or missing report, readiness transition and deliberate terminal stop.
Missing source contracts are explicitly incomplete coverage, not reasons to
invent facts. In particular:

- Packet-ready Critic preflight is not an interruption or spawn authority.
- Readiness `partial` alone does not prove writer/observer disagreement.
- A failed dispatch is not automatically deliberately stopped/non-recoverable.
- Missing native report delivery requires an actual host observation, not a
  pure normalizer called with invented input.
- Expected policy and TP waits retain planned/external classifications.

Paths in this table are relative to `plugins/pipeline-core/`. These are
source-inspected seams, not results of executing their authority actions.

| Source kind | Existing owner and supported mapping | Integration still required |
|---|---|---|
| `workflow-observer` | `scripts/critic-dispatch-preflight.mjs`, `preflightCriticDispatch` and its real CLI catch: rejected result is exactly `{schema:"pipeline.critic-dispatch-preflight.v1",status:"rejected",code}`. A bound attempted packet step that is prevented can establish `next-step-prevented`. | First live slice: capture typed rejection and candidate already resolved inside the producer. Invalid CLI syntax/unbound input stays unknown; normal expected evidence/decision pauses must use the expected-boundary path. Never substitute ambient HEAD for missing candidate or accept imported imitation JSON as a live observation. |
| `lifecycle-boundary` | `scripts/po-approval-gate.mjs` calls `runHumanApproval`; ordinary preparation returns `PO-HUMAN-REQUEST-READY`, candidate and intent digest. | Add a closed observation at the caller's actual configured pause, after successful preparation/readback. Preparation alone may be proactive and does not establish `expected-boundary`. |
| `authority-wait` | `scripts/guard-human-override.mjs` invokes the existing HGO plan/authorization preparation owners; they provide request/plan/selection bindings. | Observe actual wait entry and owner-verified continuation. Establish `tp-ceremony` only from the owning typed denial/policy; do not invoke preparation again, activate a capability or infer consent to obtain telemetry. |
| `terminal-decision` | `scripts/close-coordinator.mjs` prepares durable-stop/runtime-transfer plans. Lifecycle status writers observe succeeded/failed. | Identify and validate the accepted episode-ending decision before emission. A stop plan, failure, cancellation vocabulary or runtime transfer is insufficient. Exact accepted terminal owner remains to be located; no nonrecoverability fact is currently established. |
| `guard-observation` | `hooks/guard-lifecycle-ready.mjs` owns `evaluateLifecycleReadyGuard`, `main`, private typed `blocked` branch and `isReadOnlyDiagnosticCommand`; public verdict is only `{exitCode,stderr}`. | Add internal structured observation where the verdict is already chosen, then wire its actual runner/orchestrator caller. Capture the owning command recognizer's read-only result without exporting command/input or parsing stderr. Guard changes need their own bounded scope and review. |
| `readiness-observer` | `lib/project-onboarding-ready-gate.mjs` throws typed `PORG-NOT-READY` with intent/lifecycleStatus after validating the owner's V4 envelope. | Observe the existing gate call; correlate validated writer postimage and observer result for the exact same revision/authority binding before asserting disagreement. Session-ready inspection can clear a consent marker; do not rerun it as a supposed pure telemetry read. |
| `dispatch-observer` | `lib/continuity-host-adapter.mjs`, `normalizeContinuityHostObservation`, normalizes `CHA-COMPLETED-UNDELIVERED`; actual lifecycle writer callers exist in `scripts/pipeline-state.mjs`. | Find and exercise the real selected runner status/final acquisition path. Only authentic completed-without-final plus prevented integration establishes the three truncation facts. The pure normalizer and delivered-final writer cannot manufacture native absence evidence. |

The first live slice owns only the Critic-preflight integration and its adapter,
not all seven producer families at once. Each later producer gets a separate
scope after its closed observer contract is defined. If a runner lacks a native
status channel, declare dispatch truncation coverage unavailable for that runner;
other orchestrator observations can still operate independently of A1 hooks.

For each supported producer, freeze a discriminated closed observation schema
with producer identity/version, original typed result projection, repository-local
scope/actor, artifact binding, candidate or null, and observed clock/status.
Derive facts in the producer adapter; no model-facing facts/classification field.
Capture the actual in-process result and validate source data with its owner;
the projection validator must never claim that arbitrary valid JSON proves
native acquisition. Expected boundary arrival and subsequent authority waiting
are separate observations of the same episode where appropriate, so the adapter
does not combine conflicting classifications and pick one itself.

At first observed blocking, the orchestrator retains one repository-local
lineage ID. Updates and retries reuse it and acquire distinct immutable event
IDs. Invocation attempt count is never episode identity. Persist the lineage
association with the collector's own local state so ordinary restart does not
silently mint a fresh episode. If continuity cannot be recovered, expose that
gap rather than merging by matching code or guessing a predecessor.

Timestamps record actual observation instants with provenance/status. Replaying
an old artifact cannot replace its absent observation time with ingestion time
and claim measured blocked duration. Collection time may be recorded separately
in the collector envelope. Resolution requires the existing typed resolution
and sanctioned reference; a green test is not an inferred resolution of all
open episodes.

## Local storage, coverage and report behavior

Filesystem ownership belongs in
`plugins/pipeline-core/lib/interruption-receipt-store.mjs`, separate from pure
projection. Write immutable canonical receipts below root
`evidence/interruption-receipts/`; collector metadata belongs below root
`evidence/interruption-collection/`. Use the digest of the validated public
event ID as the filename so logical IDs containing colons remain portable.
The body retains the original ID. No caller-supplied output path or directory
traversal is accepted. Reject symlinks/nonregular files in owned path components
and verify the physical repository boundary before access.

Publish a completely written file using a tested create-only primitive on the
same filesystem. Never truncate/overwrite an existing event. Identical event
replay succeeds idempotently; changed bytes for the same event ID fail with a
conflict. Crash remnants are not receipts and never count as observed events.
Parallel writers must preserve these properties; tests must exercise separate
processes, not only sequential duplicate calls. No OS isolation claim follows
from shared-checkout task concurrency.

The initial store is bounded to 4096 retained receipt files and 64 MiB of receipt
bytes, with the same per-document ingestion limit. Count all retained files,
not just a requested report population. On exhaustion, refuse the new telemetry
write, preserve existing evidence and mark collection incomplete. No silent
eviction, oldest-file trimming or extrapolated counts. A storage limit is not
permission to continue a guarded operation or to discard active evidence.

The local report entry point is
`plugins/pipeline-core/scripts/report-interruptions.mjs`. It reads only this
owned store, revalidates registry and every included receipt, calls the existing
aggregate, and emits a complete JSON report plus a concise text view. Generated
reports live under root `telemetry/interruptions/`; add only the anchored
`/telemetry/interruptions/` ignore entry, not a broad telemetry ignore rule.
Report artifacts are immutable digest-named outputs; reports are derived views,
never source receipts or acceptance evidence by themselves.

Report inputs are a closed measured/unknown time window and supported local
scope IDs, not arbitrary grouping expressions or paths. User-selected coverage
cannot be promoted by a CLI switch. Read collector coverage evidence: measured
requires uninterrupted observation for that supported population/window; known
gaps are estimated, inaccessible collection unavailable, unestablished coverage
unknown. Until real observation acquisition/coverage is qualified, defaults are
unknown. An empty store is observed-set zero with unknown population, never
proof of zero interruptions. Preserve the aggregate's status-tagged durations,
counts, denominators and follow-up eligibility in both JSON and text.

Corrupt/conflicting selected data fails the report with a closed diagnostic;
it is not silently skipped into a deceptively complete summary. Do not expose
raw rejected input or a private filename in diagnostics. Source/shape/binding/
storage/coverage diagnostics must be bounded and documented before code;
existing C1 diagnostics retain their current meanings.

## Retention and user documentation

Default retention is local and explicit: retain receipts and collector coverage
until the owner removes them; no background deletion or network upload. The
fixed capacity above bounds disk use and makes exhaustion visible. Reports may
be regenerated only while the required source/coverage evidence is retained.
Document that deletion creates a collection gap and can invalidate baseline or
follow-up qualification. Never use filesystem mtime as measurement provenance.

This increment provides inventory/status and documentation, not a pruning
command. A later deletion feature must name exact owned files, protect active
lineages and required baseline/follow-up evidence, and expose the resulting
coverage loss. It is not bundled as an undocumented cleanup side effect.

Add `docs/alfred-interruption-reports.md` for local usage, available observer
coverage, status meanings, privacy, capacity and retention. Add
`docs/reference/interruption-emission.md` for closed input/output schemas,
typed diagnostics, source validation, lineage continuity and platform/storage
guarantees. Document only commands that actually ship and are exercised.

## Delivery slices, ownership and verification

1. Source projection: follow the [C1 source-projection plan](c1-source-projection.md)
   for the new source-adapter module and its focused behavior in the existing
   registered C1 receipt suite. Freeze exact callable/output shapes and
   diagnostic vocabulary before dispatch. Source-validation, duplicate-key,
   privacy, candidate and incomplete-history tests must prove behavior using
   owning constructors. Usage ingestion remains a later separate read-only
   I/O adapter.
2. Local store/report: store module, report CLI, focused suites, exact ignore
   entry and user/reference docs. Freeze collector envelope/coverage schema
   before dispatch. Exercise actual filesystem replay/conflict, crash remnants,
   containment, capacity, corrupt data, concurrent writers and unknown-zero
   distinctions without network or production-source mutation.
3. Live observer integration: bounded ownership of exact actual caller/observer
   files from the source-boundary table, preserving all existing command and
   authority semantics. Each shipped observer needs an actual local acquisition
   test and precise supported/unavailable coverage. A helper or fixture run alone
   does not complete this slice. Unavailable native acquisition stays visible.
4. Integrate the complete flow: actual supported observation -> validated receipt
   -> immutable persistence -> report, including restart lineage continuity and
   a collector failure/gap. Record exact candidate/artifact evidence, complete
   required Full Verify and independent T1 review. Separate accepted fixtures
   from real runtime qualification. No automatic feature or issue closure.

New suites require the sanctioned spec §12 registration route before integration;
do not hide them in unrelated tests, add exclusions or treat direct execution as
registered Verify coverage. Existing generic Pipeline registry/expired-exclusion
failures remain owned separately. They do not authorize changing those controls
under this C1 plan. Focused green does not clear a red integrated candidate.

Each source dispatch receives exact paths, six-field brief, required checks and
single-writer commit ownership. Parallel read-only/design or disjoint draft work
may proceed, but no tracked mutation/commit during a candidate-bound Full Verify.
Run document contracts and diff checks for this plan; run relevant behavior tests
for each implementation slice. T1 review is required; deterministic Verify must
be green before Critic launch under the current review protocol.

Actual collection and `interruption-baseline.json` are step 4 of the parent plan,
after working and qualified emission. Do not backdate to this design, seed
incidents, fixtures or the pure core/aggregate commits. Require the existing
measured >=14-day rule before B1 promotion/D2 thresholds. Missing collection is
not repaired by calendar time. Routine adapter/storage choices do not require a
new PO decision; semantic expansion follows the existing PO route.
