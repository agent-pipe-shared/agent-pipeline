# Class B multi-dispatch plan

Status: design, not yet sequenced for dispatch

Date: 2026-08-11

Source: this session's Class B survey (`docs/state.md`, "PO said keep going"
and following sections) plus one further check tonight: `H-AC-12`'s two
remaining reachable-without-GMW subsystems (release planning, deploy/override
consumption) do not obviously fit the existing dual-evaluation primitive
either, and Class A turned out to be empty on inspection (both its listed
criteria are code-and-test-complete, gated only on Critic PASS — see
"Class A was not real headroom" below). This document is the "start planning"
half of the PO's `4` answer; it does not dispatch anything tonight.

## Why this is a planning document and not a dispatch briefing

Every criterion below shares the shape that made L-AC-01 untractable in one
dispatch: closing it needs either a new producer/enforcement point wired
across call sites the investigation hasn't enumerated yet, or new upstream
state that doesn't exist. Each needs its own scoping pass — done in the
Elephant's own context, per this session's hard-learned rule, not delegated
to an open-ended dispatch — before a briefing can be written at all.

## Class A was not real headroom

The closure doc (`acceptance-evidence-map.mjs --mode closure`, written
2026-08-09, stale) lists Class A as 2 criteria at the lowest cost tier ("one
named test case in an already-registered, unprotected suite"). Checked
tonight: both are already done.

- **PX0-AC-03** — this session's own DELTA-0811 measurement already found
  all five recheck axes pinned, 468/468 tests passing. `partial` only for
  lack of a Critic PASS.
- **A-AC-14** — 12 of 13 conformance scenarios pinned;
  `agent-decision-journal.test.mjs:419-420` confirms the 13th
  ("decomposition") is structurally unrepresentable (no such value exists in
  `kind`, `state`, or any command-offer scenario). Same ceiling shape as
  R-AC-13. Nothing left to build.

Both are Class P in substance now, mislabeled Class A in a report that
predates this session's corrections. **There is no cheap, code-writable
target left in this epic that doesn't route through the same Critic-PASS
gate the GMW window unlocks.** Stated once, plainly, per this session's own
discipline: since the GMW window stays postponed (PO answer `1`), no
criterion — Class A, B, or otherwise — can move `partial` → `implemented`
tonight regardless of how much further code lands. The four criteria below
are worth scoping anyway, because scoping is real, durable progress that
doesn't depend on the window.

## The four candidates

### L-AC-01 — no lifecycle-event producer exists (leads by dependency, not tractability)

**Gap:** no Pipeline path emits a `lifecycle`-origin event at all;
`governance/events/lifecycle/` doesn't exist on disk though the stream is
registered.

**Blocker:** `validateLifecycleGovernanceEvent` requires
`correlation.{packageId, dispatchId, attemptId, workerId, correlationId}`
plus `queueRevision`, all non-null. Those five co-exist only inside
`lib/control-execution-exchange.mjs`'s `createControlExecutionExchange`,
whose `orchestrationAssignment` input has zero production callers anywhere
in the repo.

**Two candidate starting points, neither scoped to briefing-readiness yet:**
1. Wire `createControlExecutionExchange`'s first production caller. Covers
   5 of the 9 EARS trigger words at once (admission/progress/terminal/
   cancellation/verification/review-handoff) — the structurally clean fit,
   but "first production caller" for a function with none today means
   picking where dispatch actually happens in this repo's own
   orchestration path and understanding why nothing calls it yet. That's a
   real investigation, not a wiring task.
2. `pipeline-state.mjs`'s `apply-legacy-v2-revocation-recovery` case — a
   real, unprotected, already-tested production site (test:
   `plugins/pipeline-core/scripts/pipeline-state-revocation.test.mjs`,
   confirmed unprotected against TP-5) — but likely has no live
   dispatch/worker identity to populate the schema with. Needs a read of
   that function to confirm before it's a candidate at all.

**One naming loose end, not chased:** `acceptance.md` says "candidate
change"; the schema's `KINDS` enum calls it `candidate-invalidation`. Worth
resolving before or during whichever path is picked.

**Next scoping step:** read `control-execution-exchange.mjs` end to end and
grep every call site that constructs an `orchestrationAssignment`-shaped
object anywhere in the repo (not just this module) to confirm option 1's
"zero callers" claim still holds and find the nearest existing dispatch path
that could supply one.

### A-AC-01 — nothing enforces recording before dependent action

**Gap:** the record shape (domain, status, selected option, reason codes,
evidence basis/gaps, revalidation trigger) is pinned. Nothing enforces that
the record is written *before* the dependent action, where policy requires
it.

**Blocker:** "where policy requires" names an unknown set of call sites —
the acceptance text doesn't enumerate them, and no code marks a decision
point as policy-requiring today. Same ordering-across-unknown-call-sites
shape as L-AC-01's missing producer.

**Next scoping step:** search for every existing call site that already
constructs an `agent-decision-journal`-shaped record (there are several,
per A-AC-05/A-AC-09/H-AC-08's dispatches this session) and determine which
of them has a nearby dependent action whose ordering could actually be
checked mechanically — vs. which are informational-only writes with no
"dependent action" to order against. This determines whether the criterion
is even satisfiable as a general enforcement rule or needs per-site
judgment calls, which is itself the kind of finding that changes whether
this is one dispatch or several.

### V-AC-02 — estimate/assumption value classes unlabeled

**Gap:** the renderer labels seven of nine value classes (fact, unknown,
unavailable, redacted, invalid, not-applicable, human-decision). `estimate`
and `assumption` remain unlabeled.

**Blocker:** confirmed no field anywhere in the current schemas represents
an approximate or unverified-premise value at all — this needs a new value
class to exist upstream before the renderer could label it, not just a
rendering fix.

**Why this is likely the smallest of the four:** unlike L-AC-01/A-AC-01, this
doesn't need cross-cutting call-site enumeration — it needs exactly one new,
well-defined value-class concept (what makes a value an "estimate" vs a
"fact"? what makes it an "assumption" vs "unknown"?) threaded through
whichever producer(s) currently emit `fact`-typed values that are actually
approximations, plus the renderer's existing seven-way label switch.

**Next scoping step:** find every current producer of the `fact` value class
in `evidence-view-model.mjs` and its callers, and check whether any of them
already compute or receive a value that is actually an estimate (e.g. a
derived count, a projected date) mislabeled as `fact` today — that would be
the natural first caller to convert, giving the new value class a real
production emitter on day one rather than a schema addition nothing uses.

### R-AC-08 — rollback/cleanup as occurred events

**Gap:** a readback lifecycle event appends exactly once and never rewrites
the original offer (already pinned). Rollback/cleanup as *occurred* events
are absent — no such state exists at all today, only prospective values
inside `recoverability`.

**Blocker:** needs a new event kind plus wiring, not a check over existing
data — closer to L-AC-01's shape (new producer) than V-AC-02's (new value
class only).

**Next scoping step:** read `external-command-offer.mjs`'s `recoverability`
field and every call site that currently performs an actual rollback/
cleanup/apply-recovery operation (the GMW's own `close`/`apply-recovery`
verbs, `pipeline-state.mjs`'s recovery cases) to determine whether any of
them already has the data a new `occurred` event would need, or whether the
data itself (not just the event kind) is missing at the point of action.

### H-AC-12's remaining two reachable subsystems — investigated tonight, not resolved

**guard-push.mjs and pipeline-state.mjs are TP-5-blocked**, same as the
casOutcome/`.v1`-journal punch-list items — out of scope until the GMW
window. That leaves **release planning** and **deploy/override consumption**
as the only subsystems reachable without the window, and tonight's check
found neither obviously fits the existing `dualEvaluateDecisionReference`
primitive:

- `plugins/pipeline-core/scripts/release-version-plan.mjs` has its own
  `decisionId` concept (a digest of a release-version decision payload —
  private/neutral-public candidate, target version/tag). It is a different
  kind of "decision" from the `pipeline.human-decision-reference.v1` shape
  the dual-evaluation primitive checks. Read fully: no single old-path
  reader trusting one field alone was found — the module already validates
  `decisionId` bindings structurally at every read. Whether H-AC-12 even
  applies to this file, or whether "release planning" in the acceptance
  text means a different module entirely, is unresolved.
- `plugins/pipeline-core/lib/critical-action-authorization.mjs` (push/deploy
  approval consumption) uses full Ed25519 signature verification against a
  gate-strength-protected trust anchor — a stronger authority mechanism than
  a `decisionId` ledger reference, not an instance of the "old path trusts
  one field, needs a ledger cross-check" pattern the dual-evaluation module
  was built for. It's plausible this file is already at H-AC-12's intended
  bar for its routes (signature verification arguably subsumes what
  dual-evaluation buys elsewhere) rather than being an open gap — that's a
  disposition question, not a wiring task, and needs a PO/design read
  similar to P-AC-06's.

**Next scoping step, if this is picked up:** resolve which specific
module(s) "release planning" and "deploy approval/consumption" name in the
acceptance text (the two guesses above may both be wrong), then determine
for each whether it already satisfies H-AC-12's intent through a different
mechanism (as `critical-action-authorization.mjs` plausibly does) or is a
genuine gap needing the dual-evaluation primitive wired in.

## Recommended sequencing, once any of this is picked up

1. **V-AC-02** first — smallest, most self-contained, no call-site
   enumeration needed.
2. **L-AC-01** second despite being hardest — it's the epic's named
   structural gap ("no Pipeline path emits a lifecycle event at all") and
   several other packages' full closure depends on it existing.
3. **R-AC-08** and **A-AC-01** after, in either order — both need their own
   call-site scoping pass first; neither blocks the other.
4. **H-AC-12's remaining subsystems** last, and only after the disposition
   question above is answered — building against the wrong module would be
   the same class of mistake as the P-AC-06 orphan-check revert.

None of this is authorized for dispatch yet. Each item's "next scoping
step" is Elephant-context investigation, matching the pattern that made
`PHX-WP-PAC06-ORPHAN` a clean single-pass win instead of a fourth
truncated dispatch.
