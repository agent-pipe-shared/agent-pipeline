# C1 pure aggregation — bounded implementation plan

Status: plan-only refinement of approved #103, dated 2026-09-06. This document
specifies step 2 of [c1-core.md](c1-core.md); implementation, integration Verify,
independent review and PO acceptance remain open.

## Authority, ownership and limits

Authority: [spec §§2, 3, 6.1, 9, 10, 12, 13](../spec.md),
[#103 snapshot, lines 377–466](../evidence/issues-snapshot-2026-08-27.md), and
the complete first-core plan. Retain the existing `Interruption receipt + registry`
pin, revision `1`, digest
`e60c80dd242b9d4dde5fd3b035b4ad56671c10117568f82b31d77d430fe12ff5`,
`c1-classification-r1`, and the exact supplied validated registry digest.
The aggregate is a derived local view of this family, not a replacement receipt
or a new identity, baseline, classification or policy contract.

Initial production ownership is exactly
`plugins/pipeline-core/lib/interruption-receipts.mjs`; fixtures extend exactly
`plugins/pipeline-core/lib/interruption-receipts.test.mjs`. Reuse its validation,
canonical JSON, safe-data inspection, metric/status and privacy conventions.
No registry, frozen family, source validator, authority, lifecycle, guard,
inventory, exclusion or protected Verify-registration change is authorized here.
Retain existing source join projections for invocation attempts, review lineage,
usage evidence and sanctioned recovery artifacts. No token/cost estimator or new
repair identifier is introduced.

The caller supplies bounded receipts, observation window and collection coverage.
There is no implicit clock, file/environment read, process, network, storage,
emission, retention operation or report CLI in this increment. No live-source
authenticity, repair execution, candidate acceptance or success authority follows
from aggregate validation.

## Closed callable contract

Add `aggregateInterruptionReceipts(input, registry)` returning exactly
`{ok, code, aggregate}`. Success has `ok:true`, `code:null`; failure has
`ok:false`, `aggregate:null`, and one existing diagnostic:
`C1-SHAPE | C1-REGISTRY | C1-BINDING | C1-TIME | C1-LINEAGE | C1-CONFLICT`.
Never echo rejected values or return a partly qualified aggregate.

Input is exactly `{receipts, window, coverage}`:

- `receipts`: array of zero to 4096 existing complete receipt records. Validate
  every row with `validateInterruptionReceipt(record, registry)` before use;
  validate the registry even for an empty array. No mixed pin, derivation
  revision or registry digest is admitted. Propagate the existing diagnostic.
- `window`: exactly `{start, end}`, both existing `Time` values. Present values
  obey `start <= end`. A present receipt cutoff must lie inside each known
  window boundary, otherwise `C1-TIME`. Missing boundaries/cutoffs are admitted
  as missing evidence. First observation may precede start: retained duration
  is lifetime blocked time through the receipt cutoff, not time clipped to the
  report window. Adapters must supply the observations needed for that lifetime.
- `coverage`: exactly `{receipts, followup}`, each existing `Status`.
  `receipts:measured` asserts complete episode/update collection in the caller's
  selected report population during the declared window; `followup:measured`
  additionally asserts complete collection of subsequent episodes of those
  signatures through window end. These are caller assertions, not provenance
  inferred by this pure function. Estimated means known partial coverage,
  unavailable means collection cannot be exposed, unknown means unestablished.
  A measured coverage assertion requires measured window boundaries; otherwise
  `C1-TIME`. Partial populations may still expose exact observed-set counts.

Use the existing safe-JSON rules: exact keys, required nullable fields, bounded
arrays, no accessors/symbols/custom prototypes/cycles/sparse arrays/coercion.
Apply the existing per-receipt bounds separately, including depth; the new
wrapper must not accidentally lower the admitted depth of an existing receipt.
Computed collections contain at most 4096 rows per dimension or source set.
Safe-integer overflow is `C1-SHAPE`. No new string accepts raw descriptions,
paths, provider/account/session IDs or arbitrary grouping expressions.

Aggregate has exactly these root keys:

```text
{ schema, contractPin, derivationRevision, registrySha256, window, coverage,
  receipts, episodes, totals, groups, categoryRanking, recordSha256 }
```

`schema` is `pipeline.interruption-aggregate.v1`; the pin and derivation are
unchanged. `receipts` is a deep-copied, event-deduplicated, eventId-sorted array
of full validated receipts, preserving every classification, state, timestamp,
resolution, join and candidate/artifact binding. `recordSha256` uses the existing
canonical hash convention over all other aggregate fields. Object-key/input-row
permutation leaves the output and digest unchanged. Output mutation cannot
mutate inputs or a second call's output.

Closed nested shapes (all keys required):

| Type/field | Exact shape |
|---|---|
| Episode | `{lineageId, eventIds, latestEventId, orderingStatus, classifications, states, blockedWallTime, attemptCount, recoveryCount}` |
| `eventIds` | Sorted unique existing Id[]; references retained receipts |
| `latestEventId` | Existing event Id or null; never a generated replacement receipt |
| `orderingStatus` | Existing Status; rules below |
| `classifications`, `states` | Sorted unique arrays of all observed existing enum values; never just the latest |
| `totals` | `{eventCount, episodeCount, unresolvedCount, resolvedCount, terminalCount, skippedCount, unavailableCount, unknownCount, unassessedCount}` |
| `groups` | `{phase, codeFamily, runner, role, recurrenceSignature, resolutionClass}`; each Group[] |
| Group | `{key, lineageIds, episodeCount, effectiveness}` |
| `categoryRanking` | Ranking[] |
| Ranking | `{category, lineageIds, episodeCount, repeatCount}` |
| Effectiveness | `{assessedCount, resolvedCount, unassessedCount, resolvedShare, followup}` |
| Followup | `{resolvedCohortCount, assessedCount, recurredCount, noRecurrenceObservedCount, unknownCount, recurrenceShare}` |
| Ratio | `{numerator, denominator, value, status, unit}`; numerator/denominator are `Metric(count)`, unit literal `ratio` |

All counts and costs are existing status-tagged `Metric(count)` or `Metric(ms)`.
Ratio value is a finite number in [0,1] or null; only ratios permit noninteger
measurement values. Measured/estimated ratios require positive denominator and
value exactly numerator/denominator (no display rounding). Zero denominator
means `value:null,status:unknown`, including a fully observed empty cohort;
the denominator itself may still be measured zero. Unknown/unavailable ratios
have null value. Every ratio keeps its explicit tagged operands.

Observed-set cardinalities are measured counts of supplied validated evidence,
even if population coverage is partial; they never claim population totals.
The separate coverage fields travel with every report projection. Empty input
with unknown coverage is an observed set of size zero with unknown population,
not evidence that no interruptions occurred. Current-state totals count each
episode once using a selected latest receipt; no selected latest increments
`unassessedCount`. Historical states remain in receipts and episode arrays.

## Immutable events and one-lineage history

1. Same eventId and canonical receipt bytes collapse to one event. Same eventId
   with any changed bytes (including lineageId) fails `C1-CONFLICT`, even if
   both receipts independently validate. Input multiplicity is not a metric;
   replay does not change aggregate bytes or counts.
2. Distinct eventIds sharing lineageId are updates to one interruption episode.
   All retain their original bindings. Feature/package/dispatch identifiers
   must agree wherever both are non-null; disagreement is `C1-LINEAGE`.
   Null-to-observed scope information is retained without silently rewriting an
   old receipt. Phase, runner, role, code and classification may differ across
   observations and remain visible in historical grouping.
3. Across a lineage, same observation artifact id must retain identical full
   observation content; same bound artifact id must retain its digest; same
   invocation `(invocationId,attemptId)`, reviewId or recovery artifact id must
   retain its existing row. Changed content is `C1-CONFLICT`. Validate the union
   of source links against existing chain rules with partial coverage: missing
   predecessors may remain partial, but forks, cycles, cross-request links and
   contradictory predecessor identity are `C1-LINEAGE`. Do not promote a union
   to complete because its rows happen to join.
4. If measured first-observation timestamps disagree, reject `C1-TIME`.
   Different estimated starts are retained as uncertain observations. Present
   measured cutoffs establish temporal order. With measured ordering, a later
   measured join collection cannot omit a previously observed source row from
   that collection (`C1-LINEAGE`); a partial collection may omit it and remains
   partial. Never treat dropped observations as erased history.
5. A resolved and a terminal receipt in one lineage are contradictory regardless
   of cutoff availability: `C1-CONFLICT`. Multiple resolved observations must
   agree on resolution class/reference and measured endpoint where both are
   measured; analogous rules apply to terminal observations. Conflicting
   references/classes are `C1-CONFLICT`; measured endpoint disagreement is
   `C1-TIME`. With measured chronology, a resolved/terminal episode followed by
   a different state is `C1-CONFLICT`. An earlier unresolved measured cutoff
   after the later measured resolution/terminal endpoint is `C1-TIME`.
   A recurrence after resolution needs a new caller-owned lineageId.
6. Select the sole receipt as latest if the episode has one event; its ordering
   status is its cutoff status. For multiple events, select the unique greatest
   cutoff only when every cutoff is measured. Equal-cutoff receipts must be
   identical after removing eventId and recordSha256, else `C1-CONFLICT`;
   equivalent ties select the lexicographically smallest eventId. Missing or
   estimated clocks produce `latestEventId:null` and the conservative cutoff
   status fold (`unknown > unavailable > estimated > measured`). Never order
   by input position, event ID, digest or a preferred resolved state.
7. Episode metrics copy the selected latest receipt exactly, including status;
   with no selected latest, all three values are null and status is unknown
   (unavailable when orderingStatus is unavailable). Never sum receipt updates,
   overlapping attempts or both invocation and review views. All earlier costs
   remain observable in retained receipts. A changing candidate is permitted;
   no aggregate candidate replaces the exact per-event candidate binding.

These checks reject contradiction, not ordinary uncertainty. They do not
reclassify an event. A latest resolved state cannot erase earlier skipped,
unavailable, unknown, unresolved or interruption observations.

## Grouping and highest recurrence

Every Group has sorted unique lineageIds; episodeCount is their observed-set
cardinality. Membership uses every retained receipt, deduplicated by lineage
inside each group. A lineage that changed runner/phase/category can occur in
several groups: group counts are deliberately nonadditive across rows. Null is
an explicit unknown-key bucket, distinct from the literal public Id `unknown`.
No empty rows or caller-supplied labels are invented.

- Phase/runner/role keys are the receipt's respective nullable Id.
- Code-family key is the existing normalized category. Here a family means
  the registry-derived category of codes; it does not imply a producer's
  prefix taxonomy. Original typedCode remains in the receipt and signature.
  An unknown category stays the literal `unknown`; no suffix/prefix/message
  heuristic invents a family. Changing this to a producer taxonomy requires
  separately evidenced mapping design, not ad hoc string splitting.
- Resolution-class key is the existing resolution.class or null. Null includes
  unresolved/skipped/unavailable/unknown observations, without inventing a
  resolution class or describing absence as successful repair.
- Recurrence-signature key is the closed tuple object
  `{phase, codeFamily, runner, role, typedCode, classification}` of these
  existing values. The aggregate's pin/revision/registry digest binds its
  interpretation. This is a comparison key, not a new episode, repair or
  contract identity; source joins remain available for contract-specific
  inspection. Candidate, event, lineage, attempts and resolution are excluded
  so an observed new episode can recur after a repair/candidate change.

Sort groups by canonical key bytes, using ordinal comparison, not locale.
Ranking includes every observed category, including planned gates, external
waits, terminal and unknown, without labeling them defects. Category lineage
membership is the same historical set used by codeFamily. Rank descending by
episodeCount, then category ordinal ascending; return all rows without a
top-N cutoff. `repeatCount = max(episodeCount - 1, 0)` measures additional
distinct observed episodes, not additional attempts. Ranking is explicitly
within the supplied population/window, never an optimization threshold.

## Observable resolution and follow-up denominators

For each group's historical lineage set, an episode is assessable for
`resolvedShare` when it has a selected latest receipt with known classification
and state unresolved, resolved or terminal. A resolved receipt classified as
terminal-blocker is unassessed for this measure, never a success. Skipped,
unavailable, unknown state/class and unordered histories are unassessed.
`assessedCount` is the denominator, `resolvedCount` counts its resolved members,
and `unassessedCount` counts all remaining group members:
`assessedCount + unassessedCount = episodeCount`; `resolvedCount` is a subset
of `assessedCount`, not an additional term. The ratio is a descriptive observed-resolution share,
not a causal effectiveness claim or a green gate. Its status is the fold of
receipt-population coverage and relevant selected-receipt collection statuses;
unknown/unavailable yields null ratio while tagged cohort counts stay visible.
It describes only this assessed subset; excluded coverage is never hidden.

Followup exposes recurrence after a recorded resolution:

- `resolvedCohortCount` counts the same resolved members just defined. For each
  such member, require one stable recurrence signature across its history,
  a measured resolution time, measured window end strictly later than that
  resolution, and measured start times for possible matching peer episodes.
- A peer is a different lineage in the entire supplied aggregate, with that
  same stable signature and first observation strictly after resolution and
  at or before window end. A matching peer proves observed recurrence even
  under partial followup coverage. Same-lineage retries never qualify.
- `recurredCount` counts resolved cohort members with at least one such peer,
  once per member, regardless of how many peers recur. It measures resolved
  episodes followed by recurrence, not a repair-attempt success probability.
- `noRecurrenceObservedCount` requires no such peer, measured receipts and
  followup coverage, and complete measured temporal evidence for the cohort
  member and every potential matching peer. Unknown peer signatures or clocks
  that could conceal a match prevent an absence claim. Resolution exactly at
  window end has no followup exposure and is unknown, not effective repair.
- `assessedCount = recurredCount + noRecurrenceObservedCount` is the explicit
  recurrenceShare denominator; `unknownCount` is the remaining resolved cohort.
  `recurrenceShare = recurredCount / assessedCount`; its status folds both
  coverage statuses and becomes at least estimated if unknownCount is nonzero.
  A zero denominator is unknown, never zero percent recurrence. Unavailable or
  unknown coverage keeps the ratio null even if positive observations exist.

These metrics answer whether recurrence was observed after a resolution, within
an explicit exposure window. They do not establish that a repair reduced it:
there is no equal-exposure comparison, counterfactual, workload adjustment or
causal evidence here. No improvement percentage or effective/ineffective label
is emitted. Resolution references and recoveryCount remain visible for later
local reporting; unknown observation coverage cannot become a successful repair.

## Behavioral fixtures and acceptance mapping

Build valid synthetic receipts through the existing builder and retain existing
source-projection fixtures. Assert computed values, status and rejection codes.

| Fixture | Required observable result |
|---|---|
| Exact event replay; object/input order reversed | Identical full aggregate and digest; one event/episode; no mutation |
| Same eventId, changed valid receipt/lineage | C1-CONFLICT, no aggregate |
| Two updates, same lineage, attempts 1 then 2; second episode same signature | Two episodes; latest attemptCount 2, not 3; repeatCount 1 |
| Same source identity/different bytes; measured dropped join; union fork/cycle | C1-CONFLICT or C1-LINEAGE as specified; no partial result |
| Measured cutoffs 2s unresolved then 10s resolved at 4s | One episode, latest resolved, lifetime blockedWallTime 4000ms; earlier unresolved retained |
| Same example, earlier unresolved cutoff 6s | C1-TIME: contradicts resolution at 4s |
| Terminal then resolved, including missing cutoffs; terminal then measured unresolved | C1-CONFLICT; never recovery success |
| Equal cutoffs with conflicting state; equivalent payloads with different eventIds | Conflict rejected; equivalent tie selects minimum ID without inflating episodes |
| Two receipts, one unknown cutoff or estimated cutoff | No latest; all history retained; unknown or estimated ordering; null summary costs |
| Different measured first/endpoint timestamps; changed resolution reference | C1-TIME / C1-CONFLICT; estimated disagreement retained without choosing a winner |
| Phase/runner/role change in one lineage, null actor, different candidate | Every historical group retained; null separate; one episode overall; both bindings retained |
| Seed families TP wait and read-only refusal; code ending REQUIRED with no facts | External-wait / unplanned-interrupt / unknown retained; no code-prefix inference |
| Categories with 3, 2, 2 distinct episodes, many event replays | Ranking 3,2,2 with category tie-break; repeatCount 2,1,1; replays irrelevant |
| Group: resolved 2, unresolved 1, terminal 1, skipped 1, unknown 1; measured eligible data | Denominator 4, numerator 2, resolvedShare 0.5; unassessedCount 2; non-green history retained |
| Two resolved cohort members; first has later peer, second has measured complete no-peer exposure | Recurrence numerator 1, denominator 2, share 0.5; unknownCount 0 |
| Same cohort with partial followup, only first positive peer observable | Recurred 1, noRecurrenceObserved 0, denominator 1, unknownCount 1; estimated ratio 1, explicitly subset-only |
| Matching peer lacks time; signature changed; resolution at cutoff | Unknown followup; no fabricated absence or repair effect |
| All skipped/unavailable/unknown or no resolved members | Appropriate unassessed counts; zero denominator; null unknown ratio |
| Empty complete population versus empty unknown population | Both observed count 0; coverage measured versus unknown persists; neither invents a ratio |
| Missing elapsed/attempt telemetry, estimated metrics, overlapping attempts | Existing null/status and invocation precedence retained; no sum of update costs |
| Wrong pin/registry, hostile allowed Id, extra private fields/getters, oversized input, overflow | Existing typed diagnostic; no payload echo/getter execution; no aggregate |
| Callable under time/files/network tripwires with explicit supplied data | Deterministic return; no ambient time or I/O dependency |

These fixtures cover #103's episode counting, grouping, recurrence ranking,
recovery-cost visibility, explicit denominators, missing-versus-zero and privacy.
Existing classification and join tests remain mandatory; this step adds no claim
of real collection or of the two-week acceptance criterion.

## Small delivery sequence and remaining gates

1. Add aggregate validation, event deduplication and history projection with
   conflicting-history, clock, binding and nonmutation fixtures. Export the
   complete closed aggregate shape with empty derived groups only for empty
   input; nonempty behavior must be fully implemented before claiming the API
   ready. An intermediate internal helper commit may remain unexported.
2. Add historical grouping, deterministic category ranking and observable
   resolution/followup calculations with the exact denominator fixtures above;
   expose the complete callable only once these paths are implemented.
   Keep each scoped commit green against the existing receipt test and consumer
   path check; no new production module is needed initially.

For each implementation package capture
`node --test plugins/pipeline-core/lib/interruption-receipts.test.mjs` and
`node --test harness/scripts/check-consumer-safe-paths.test.mjs`, plus
`git diff --check`. A caller contract fixture validates full output values, not
just schema markers. Focused green tests do not replace Stage 1 integration.

This architectural API refinement triggers
[review-protocol §2.1 T1](../../../harness/review-protocol.md#21-trigger-decision-table).
Independent Critic review is mandatory; no criticSkip determination applies.
The first-core Critic review remains pending; its eventual completion does not
automatically clear this new plan or aggregation code.
The Elephant owns the required review route and candidate scope; this plan does
not waive or silently batch A/G/S review. Full green Verify remains required
for delivery. The TP-3 suite registrations have since completed and the
first-core/exception candidate passed Full Verify; see the
[registered Verify handoff](../evidence/registered-verify-gate-handoff.md)
for exact bindings and the still-open installed Critic transport blocker.
Those results do not verify future aggregation code. Record each remaining
gate as pending until its actual candidate-bound result exists.

Emission/local reports remain a separate step 3 delivery: validate actual source
bytes, project safe identifiers, wire existing orchestrator observations, write
ignored `evidence/` receipts and `telemetry/` aggregates, and specify retention
and user/reference documentation. Step 4 records the real collection start and
availability and requires measured `windowDays >= 14`; no fixture, elapsed plan
age or this explicit analytical window creates/backdates that baseline. Full
Verify, required independent review, real baseline, documentation acceptance and
PO acceptance remain open; no implementation or wave completion is claimed.

Field names, conservative ordering, category-based families, historical group
membership and descriptive ratios are bounded implementation choices under
approved semantics. Reclassification, replacement join identities, causal repair
claims, discarded unknowns, baseline shortening, new policy thresholds or new
collection/authority effects require the existing PO-visible scope decision.

Plan checks: stage this new path before running
`node harness/scripts/check-doc-contracts.mjs --root <repo-root>` because link
validation requires tracked targets; also capture `git diff --check`. These
document checks verify the plan artifact, not the future aggregation behavior.
