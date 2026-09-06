# C1 first pure core — implementation plan

Status: implementation preparation under Alfred's approved semantics; no code,
collection, baseline, independent review result, or PO acceptance is claimed here.

## Authority and bounded delivery

The contract is [spec §§2, 3, 6.1, 9, 10, 12](../spec.md), the
[#103 snapshot, lines 377–466](../evidence/issues-snapshot-2026-08-27.md), and
[#103 intake](../design/issue-intake.md#103--interruption-telemetry--wp-c1).
[PRD §5](../prd_sprint-alfred-epic.md#5-sequencing-and-entry-conditions)
places C1 in Wave 0. It requires no live A1 result: the eventual producer is
the orchestrator's existing observation boundary (spec §6.1).

Pin family `Interruption receipt + registry`, revision `1`, digest
`e60c80dd242b9d4dde5fd3b035b4ad56671c10117568f82b31d77d430fe12ff5`
from [freeze contracts[]](../design/contract-freeze.json), lines 71–84.
Aggregate freeze revision `2` does not change this C1 family revision.
The freeze records family metadata, not an exhaustive wire schema. The closed
shapes below refine the approved fields; changing classifications, privacy,
identifier meaning, or baseline policy requires a PO-visible freeze decision.

First code package owns exactly these new files:

| Path | Responsibility |
|---|---|
| `plugins/pipeline-core/lib/interruption-receipts.mjs` | Pure validation, deterministic classification, one-lineage receipt construction, canonical digest |
| `policies/interruption-registry.v1.json` | Closed versioned rule data and public source provenance |
| `plugins/pipeline-core/lib/interruption-receipts.test.mjs` | Behavioral fixtures, including canonical-join projections |

Two production files plus one test; no registry loader with filesystem effects,
writer, report CLI, instrumentation, baseline clock, or policy gate in this
package. Callers pass parsed registry and normalized observations. Pure functions
must neither read files/environment/time nor launch processes or use a network.
No edits to existing Nova producers, Verify registration, inventory, exclusions,
guards, lifecycle, authority files, or freeze are part of this first package.
Suite registration remains a required separate delivery through spec §12's
authorized ceremony; absence of registration must remain visible at handoff.

## Closed vocabulary and common types

Every object below has exactly its listed keys; all keys are required, including
nullable keys. Reject unknown keys, wrong primitive types, non-finite numbers,
duplicate keys at JSON ingestion, and custom-prototype non-JSON inputs. Plain
objects with Object.prototype or null prototype are allowed; accessors, symbol
keys and custom prototypes are rejected without invoking getters. Input
objects and arrays are not mutated. No coercion, default-zero, free-text fallback,
or missing-key repair is permitted. Each collection is bounded to 4096 rows;
fact and rule sets are bounded by the closed vocabularies below. JSON text
parsing remains the adapter's boundary; pure functions receive validated JSON
values and cannot detect duplicate keys already discarded by a parser.

- `Class = planned-gate | unplanned-interrupt | external-wait | terminal-blocker | unknown`.
- `Status = measured | estimated | unavailable | unknown`.
- `State = unresolved | resolved | terminal | skipped | unavailable | unknown`.
- `Category = lifecycle-gate | workflow-interruption | authority-wait | terminal-stop | read-only-refusal | readiness-partial-deadlock | tp-ceremony-wait | dispatch-truncation | unknown`.
- `SourceKind = lifecycle-boundary | workflow-observer | authority-wait | terminal-decision | guard-observation | readiness-observer | dispatch-observer`.
- `Fact = expected-boundary | next-step-prevented | declared-authority-wait | deliberately-stopped | non-recoverable | read-only-command | readiness-partial | writer-observer-disagreement | tp-ceremony | report-missing | dispatch-ended`.
- `Id`: repository-owned public logical identifier, ASCII
  `/^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/`; never a provider/account/session ID.
  Existing review IDs additionally retain their source's narrower validator.
- `Digest`: exactly 64 lowercase hexadecimal characters. `Oid`: exactly 40 or
  64 lowercase hexadecimal characters; commit and tree must use the same length.
- `Metric(unit) = {value, status, unit}`. For `count` and `ms`, a present value
  is a nonnegative safe integer. `measured`/`estimated` require a value;
  `unavailable`/`unknown` require `null`. A measured zero requires positively
  complete observation. No quantitative output field is an untagged number.
- `Time = {value, status}`: value is canonical UTC ISO-8601 with milliseconds
  (`YYYY-MM-DDTHH:mm:ss.sssZ`), validated by parse-and-roundtrip; same status/null
  pairing as Metric. Timestamps are observations, not implicit clock reads.
- `Candidate = {commit, tree}` using Oid; no branch name, abbreviated SHA, or
  working-tree fallback. `Artifact = {id, sha256}` using Id and Digest.
- `Pin = {family, revision, digest}`: exact family/digest above and revision 1.
  Revision is version metadata, not a measurement; the status rule applies to
  measured quantities, not schema versions or identifiers.

Public logical IDs are supplied only by the owning adapter's allowlisted source
fields. A regex is a syntax check, not proof of privacy. Adapters must reject or
omit unsafe identifiers before projection; hashes do not authorize copying raw
payloads. The core additionally rejects recognizable credential shapes inside
otherwise syntactically valid Id fields (including synthetic `sk-`/`ghp_` token
fixtures); such screening does not establish the provenance of an opaque ID.
Test hostile values in allowed fields as well as forbidden extra keys, using
synthetic data only; diagnostics return typed codes, never rejected values.

## First-core input and output

`buildInterruptionReceipt(input, registry)` accepts one interruption lineage at
one explicit observation cutoff. Input has exactly:

```text
{ eventId, lineageId, scope, actor, typedCode, observations,
  state, firstObservedAt, observedThroughAt, resolvedAt, terminalAt,
  attemptCoverage, recoveryCoverage, joins, resolution, binding }
```

Nested closed shapes:

| Field | Shape and invariant |
|---|---|
| `eventId`, `lineageId` | Id; event identifies this immutable observation receipt, lineage identifies the interruption episode across attempts/updates |
| `scope` | `{featureId, packageId, dispatchId, phase}`; each Id or null, null means not observable; at least one of the first three is present |
| `actor` | `{runner, role}`; each Id or null; no model, account, session, thread, or provider identifiers |
| `typedCode` | Id or null; original producer code, unchanged; null remains unknown, never a fabricated historical code |
| `observations` | Nonempty array of `{sourceKind, facts, artifact}`; sourceKind in SourceKind, facts sorted unique Fact[], artifact is Artifact; sort uniquely by artifact.id, no duplicate id with changed digest |
| `state` | State, independent of classification; a syntactically valid unresolved receipt is not successful progress |
| timestamps | `firstObservedAt`, `observedThroughAt`, `resolvedAt`, `terminalAt` are Time; first observation and explicit cutoff are required keys even if unavailable |
| `attemptCoverage`, `recoveryCoverage` | Status describing completeness of the corresponding join collection; measured means the supplied collection is complete through cutoff, estimated means known partial coverage, unavailable means producer cannot expose it, unknown means completeness cannot be established |
| `joins` | `{invocations, reviews, usages, recoveries}`; each array, closed rows below |
| `resolution` | Null or `{class, reference}`; class `sanctioned-recovery | resumed | deliberate-stop | non-recoverable`; reference Artifact; evidence reference, never execution authority |
| `binding` | `{candidate, artifacts}`; candidate Candidate or null; artifacts sorted unique Artifact[]; must include all observation/resolution artifacts; nonempty |

`buildInterruptionReceipt` returns exactly `{ok, code, receipt}`. Successful
construction is `{ok:true, code:null, receipt:<record>}`; invalid inputs return
`{ok:false, code:<diagnostic>, receipt:null}`. Closed diagnostic enum:
`C1-SHAPE | C1-REGISTRY | C1-BINDING | C1-TIME | C1-LINEAGE | C1-CONFLICT`.
Shape validity means safe data handling, never approval or an evaluator `pass`.

Receipt `pipeline.interruption-receipt.v1` has exactly these root keys:

```text
{ schema, contractPin, eventId, lineageId, scope, actor, typedCode,
  category, classification, derivationRevision, registrySha256, matchedRuleIds,
  observations, state, firstObservedAt, observedThroughAt, resolvedAt, terminalAt,
  blockedWallTime, attemptCount, recoveryCount, collectionStatus,
  joins, resolution, binding, recordSha256 }
```

Copied keys preserve validated input values. `schema` is the literal above;
`contractPin` is Pin; `derivationRevision` is `c1-classification-r1`;
`category` and `classification` are derived; `matchedRuleIds` is sorted unique
Id[], empty on unknown/conflict. Metrics are `blockedWallTime: Metric(ms)` and
`attemptCount`, `recoveryCount: Metric(count)`. `collectionStatus` is Status,
the conservative fold of applicable timestamp/metric statuses: unknown dominates
unavailable, then estimated, then measured. Include firstObservedAt,
observedThroughAt, all three metrics and the state's applicable endpoint
(resolvedAt for resolved, terminalAt for terminal). Exclude only endpoints that
the state requires to be absent; never exclude a genuinely missing applicable
observation. Thus a fully measured unresolved event can have measured collection
status without inventing its future resolution time. A null actor does not imply
zero measurements. The receipt contains no boolean `green` or evaluator outcome.

`recordSha256` is SHA-256 of UTF-8 canonical JSON of the complete record excluding
that field, using the existing canonical ordering convention. `registrySha256`
hashes the entire registry using the same convention; it is distinct from the
frozen family digest. This hash binds bytes/semantics, not provenance truth.
`validateInterruptionReceipt(record, registry)` returns exactly `{ok, code}`
and recomputes derived classification, metrics and digest from retained input
fields; recover coverage statuses from the corresponding metric statuses.
Expose `validateInterruptionRegistry(registry)` with the same result shape and
`classifyInterruption(input, registry)` returning exactly
`{classification, category, matchedRuleIds}` after input validation.

## Registry predicates and provenance

Registry root keys are exactly `{schema, contractPin, derivationRevision, rules}`,
with schema `pipeline.interruption-registry.v1`, Pin, the revision above, and
nonempty rules sorted uniquely by id. Each rule is exactly
`{id, sourceKind, allFacts, classification, category, provenance}`.
`allFacts` is nonempty sorted unique Fact[]. `provenance` is exactly
`{sourceId, section}`: static public Ids naming the source mapping below, never
runtime paths. Rule validation requires the exact combinations in this table;
an injected rule cannot authorize a new semantic predicate.

| Rule id / sourceKind | Required allFacts | Result Class / Category | Accepted source |
|---|---|---|---|
| `expected-gate` / lifecycle-boundary | expected-boundary | planned-gate / lifecycle-gate | #103 Classification-1 |
| `prevented-step` / workflow-observer | next-step-prevented | unplanned-interrupt / workflow-interruption | #103 Classification-2 |
| `authority-wait` / authority-wait | declared-authority-wait | external-wait / authority-wait | #103 Classification-3 |
| `deliberate-stop` / terminal-decision | deliberately-stopped | terminal-blocker / terminal-stop | #103 Classification-4 |
| `non-recoverable` / terminal-decision | non-recoverable | terminal-blocker / terminal-stop | #103 Classification-4 |
| `read-only-refusal` / guard-observation | next-step-prevented, read-only-command | unplanned-interrupt / read-only-refusal | intake #103, 2026-08-27 read-only refusal observation |
| `readiness-partial` / readiness-observer | next-step-prevented, readiness-partial, writer-observer-disagreement | unplanned-interrupt / readiness-partial-deadlock | intake #103, 2026-08-27 discard/observer observation |
| `tp-wait` / authority-wait | declared-authority-wait, tp-ceremony | external-wait / tp-ceremony-wait | spec §6.1 lines 369–373; intake #103, 2026-08-18 OT09 attempts |
| `dispatch-truncation` / dispatch-observer | dispatch-ended, next-step-prevented, report-missing | unplanned-interrupt / dispatch-truncation | intake #103, 2026-08-08 truncation observation |

For generic rows provenance is `{sourceId:"issue-103", section:"classification-N"}`
with N as above. Seed provenance uses sourceId `alfred-issue-intake-103` and
section `read-only-refusal-2026-08-27`, `readiness-partial-2026-08-27`,
`tp-ceremony-2026-08-18`, or `dispatch-truncation-2026-08-08` respectively.
Those public intake references establish category provenance; they do not supply
raw producer codes, receipt timestamps, counts, or live observation evidence.
Do not claim that these planned rule IDs already exist as historical codes.

A rule matches only a single observation with the exact sourceKind and all its
required facts. Fact provenance must be a bound observation artifact produced
by a deterministic observer; prose/model labeling is insufficient. The pure
core checks shapes, references and consistency. Actual source authenticity and
candidate/artifact byte matching are the later adapter's responsibility; fixtures
cannot establish that live provenance. Rules never use code suffixes, substrings,
regexes on error messages, or guessed interpretation of `*-REQUIRED`.

Compute every matching rule. If classes disagree, return unknown/unknown with
empty matchedRuleIds. Otherwise a seed category takes precedence over its generic
category; two different seed categories also yield unknown/unknown. Same-class,
same-category matches retain all matching rule IDs. No match yields unknown.
Missing typedCode, unmatched source/facts, and contradictory observations never
become planned gates by default. A missing code forces unknown even if facts
would otherwise match, preserving original-code collection failure visibly.
Terminal state additionally requires a matching terminal-decision observation;
state alone is not a classifier. Contradictory state/evidence is C1-CONFLICT.

## Existing joins, attempts, and resolution boundaries

These are projections referencing existing contracts, not replacement schemas.
The producer validates full source records with their owning validators before
projection; this package checks the closed projections and link consistency.
It must not import private source bodies or reimplement Nova authority decisions.

| Join array | Exact row shape and source semantics |
|---|---|
| `invocations` | `{invocationId, attemptId, requestSha256, previousSha256, recordSha256, invocationResolutionKey}`; all existing fields except the last are projected from the validated attempt; previousSha256 nullable; invocationResolutionKey Digest or null from the existing function, never invented from a new repair ID |
| `reviews` | `{reviewId, parentReviewId, previousSha256, recordSha256}`; parentReviewId and previousSha256 null together for root, otherwise existing link; existing Id/Digest types |
| `usages` | `{scope, source}` where scope exactly `{dispatchId}` and source exactly `{eventSha256}`; dispatchId must equal receipt scope.dispatchId; both required for an admitted usage join |
| `recoveries` | Artifact[] of distinct sanctioned resolution evidence; these are evidence references, no new recovery/repair identity namespace |

Exact source references: `invocation-reliability.mjs` lines 24–25, 144–165
(`validateInvocationChain`, `invocationResolutionKey`) bind invocation, attempt,
request, predecessor and record hashes; `critic-review-lineage.mjs` lines 53–70
and `candidateCode` lines 107–111 preserve review links and `{commit,tree}`;
`runner-usage-v1.mjs` lines 300–324, 490–514, 555–577 bind
`scope.dispatchId` and `source.eventSha256` without exporting source.threadId or
source.turnId. All three files are under `plugins/pipeline-core/lib/`.
`review-economy.mjs` `projectCriticReviewEconomy` and its predecessor-link checks
remain owner of review economics; no token/cost projection is added to C1.

Canonicalize each join array by its source key, collapsing byte-identical rows.
Same `(invocationId, attemptId)` or reviewId with changed digests is C1-CONFLICT.
Invocation predecessor chains stay within invocationId/requestSha256; review
parents stay within the supplied review chain. If coverage is measured, missing
predecessors, cycles, duplicate-child branches, and conflicting request bindings
are C1-LINEAGE. Partial coverage must be estimated/unknown, never silently complete.
An invocationResolutionKey identifies the existing resolution grouping; it is not
an attempt count or proof that a repair was executed successfully.

`attemptCount` counts distinct invocation attempts when invocation joins exist;
otherwise distinct reviewIds when review joins exist. Never sum both views of the
same dispatched work. If neither source is available, count is null with unknown
or unavailable status; a complete observed empty attempt set may be measured 0.
The coverage status supplies the metric status: estimated counts are lower-bound
observed counts, not extrapolations; unknown/unavailable counts remain null.
`recoveryCount` counts distinct recoveries by artifact id and sha256, using the
same coverage rule; changed digest for the same id is C1-CONFLICT. Resolution
reference must appear in binding.artifacts and, for sanctioned-recovery, recoveries.

The orchestrator assigns and retains a repository-local lineageId when planned
progress first becomes blocked, then reuses it for retries and receipt updates.
It must not mint an episode per attempt or coalesce unrelated interruptions just
because a code recurs. A review correction can bind a new candidate in its own
source chain; C1 must not equate predecessor candidate identity with current
candidate identity. Current candidate is exact `{commit,tree}` plus artifact
digests (spec §2 and §9); null candidate means inapplicable/unobservable, with no
candidate-qualified acceptance claim. Candidate-required emission will reject a
missing binding in that adapter; pure receipt data grants no exception.

## Time and non-green invariants

For resolved state, resolvedAt must have a value, terminalAt must be null, and
resolution class must be resumed or sanctioned-recovery. Terminal state requires
terminalAt with value, resolvedAt null, and matching deliberate-stop/non-recoverable
resolution plus terminal observation. Other states require both endpoint values
null and resolution null. Missing endpoints use unknown or unavailable Time,
not a fake timestamp. Both endpoint values present is C1-TIME.

Choose elapsed endpoint resolvedAt for resolved, terminalAt for terminal,
observedThroughAt for unresolved. `blockedWallTime = endpoint - firstObservedAt`
in integer milliseconds; reject negative intervals or endpoints after cutoff.
All measured operands yield measured; an estimated operand yields estimated;
unknown dominates unavailable, and either yields null elapsed. For skipped,
unavailable, or unknown state, elapsed is null with unavailable for unavailable
state and unknown otherwise. Never sum overlapping attempt intervals; elapsed
is time blocked in the lineage, including an external wait, not CPU/worker time.
Unresolved elapsed is observed-so-far, not final duration; terminal elapsed ends
at the explicit stop and is not recovery time. A recurrence after a resolved
episode gets a new lineage from the observer, not from a code-family heuristic.

Unknown class, conflicting evidence, skipped/unavailable/unknown state, unresolved
state and terminal-blocker never become successful recovery. A resolved receipt
does not erase earlier interruption or skipped evidence. Later reports must retain
those facts and source statuses; estimates cannot be presented as measured data.

## Behavioral checks and independently deliverable sequence

First-core fixtures must assert computed values and rejection behavior, not just
schema text. Synthetic observation digests and logical IDs must be explicit.

| Fixture | Executable expected result |
|---|---|
| Each generic predicate and four seed predicates | Exact class/category above; TP wait external-wait; a `*-REQUIRED` code alone unknown |
| Missing code/facts, prose-only object, unknown registry field/rule | Unknown for insufficient valid evidence; C1-SHAPE/C1-REGISTRY for invalid shape |
| Planned and unplanned facts with valid distinct artifacts | Unknown class/category, empty match list; never first-match-wins |
| Same input twice; permuted object keys | Identical canonical receipt digest; no input mutation |
| Registry change / digest mismatch / candidate half-binding | C1-REGISTRY or C1-BINDING; no qualified receipt |
| Start 00:00:00.000Z, cutoff 00:00:10.000Z, unresolved | blockedWallTime `{value:10000,status:"measured",unit:"ms"}`; state still unresolved |
| Same start, resolved 00:00:04.000Z, cutoff +10s | measured 4000ms; terminal timestamp null; sanctioned reference checked |
| Same start, terminal 00:00:06.000Z, cutoff +10s | measured 6000ms, terminal-blocker; no recovery success |
| Missing start, estimated cutoff, negative endpoint, dual endpoints | Null unknown elapsed; estimated elapsed when operands present; C1-TIME for invalid ordering/dual endpoint |
| Two invocation attempts plus replay of first, same episode | One lineageId, measured attemptCount 2; byte-identical replay has no effect |
| Same attempt ID different digest; missing measured predecessor | C1-CONFLICT; C1-LINEAGE respectively |
| Invocation and review views of same dispatch | Count invocation attempts only; retain review join without double counting |
| Repeated recovery reference, missing usage dispatch context | Recovery counted once; unjoinable usage omitted by adapter, never assigned guessed dispatchId |
| No observations of attempts vs complete observed empty collection | Null unknown/unavailable versus measured 0, visibly different |
| Raw prompt/transcript/path/account/thread/token keys at any level | C1-SHAPE; source bodies never included by object spread |
| Updated receipts with same lineage | Later aggregation counts one episode and deduplicates eventId; core preserves both event/lineage IDs without claiming aggregation shipped |

Implementation commit sequence, each independently green:

1. `feat(telemetry): add pure interruption receipt classification` — exactly the
   three first-package paths above, closed shapes and all first-core fixtures.
   Run `node --test plugins/pipeline-core/lib/interruption-receipts.test.mjs`
   and `node --test harness/scripts/check-consumer-safe-paths.test.mjs`.
2. Separate pure aggregation increment: add bounded aggregation to the receipt
   module plus behavioral tests; deduplicate event replay and lineage updates,
   reject conflicting duplicates, retain all classifications/states, group by
   phase/code family/runner/role/recurrence signature/resolution class. Explicit
   denominator and coverage statuses precede any effectiveness ratios. No
   baseline or threshold claims. Its detailed aggregation shape is a later plan.
3. Separate emission/local-report increment: validate source bytes with existing
   #38/#54/#75 validators, project privacy-safe facts, bind exact artifacts and
   candidates, wire existing orchestrator observations, write ignored root
   `evidence/` receipts and spec §6.1 `telemetry/` aggregates. Define retention,
   privacy, and user/reference documentation; register suites through the
   authorized spec §12 path. Test real local adapter behavior without network.
4. Separate actual-collection/baseline increment: only after working emission
   record the real `interruption-baseline.json` start and collection availability.
   No backdating to this plan, seed incidents, fixture runs or pure-core commit.
   Require measured `windowDays >= 14` before B1 promotion/D2 thresholds; failed
   or absent collection never qualifies through elapsed calendar time alone.

The complete #103 requirements remain mapped: fields/classifier/privacy/joins
and per-lineage metrics → step 1; local recurrence/resolution effectiveness →
step 2; emitted receipts, reports, retention and user/reference docs → step 3;
two-week dogfood and threshold qualification → step 4. No hosted service in any
step. Exact-candidate documentation verification and issue closure remain E2
delivery work, not a result of this plan.

These are routine implementation choices: field names, source-fact projection,
closed diagnostic vocabulary, millisecond precision, deterministic conflict
handling, projection-based joins, and splitting aggregation from emission.
No new foundational PO choice is needed for this first package. Any proposal to
reclassify TP waits as defects, infer missing provider metrics, weaken unknown
handling, replace existing join identities, or begin/shorten the baseline without
real collection is semantic expansion and must stop for the existing PO route.

Plan validation commands: `node harness/scripts/check-doc-contracts.mjs --root
<repo-root>` and `git diff --check`; captured document evidence belongs in ignored
root `evidence/` under [ADR-0063](../../../docs/adr/0063-repository-directory-contract.md).
Full Verify and independent Critic review remain pending at this plan's handoff;
the architectural contract refinement triggers review-protocol §2.1 T1, with no
Critic skip. Implementation and PO acceptance are separate, outstanding acts.
