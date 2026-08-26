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

**Next scoping step — run same night, both halves confirmed:** a repo-wide
grep for `orchestrationAssignment` returns exactly two files,
`control-execution-exchange.mjs` and its own test — the "zero production
callers" claim holds, re-verified rather than re-trusted. Reading
`apply-legacy-v2-revocation-recovery`'s handler
(`pipeline-state.mjs:6292-6331`) directly rules out option 2: its identity
input is `by` (an operator's plain name, via `--by`), never a
`dispatchId`/`workerId`/`attemptId`/`correlationId` — this is a human-
attributed CLI recovery action, not a dispatch-scoped one, and has nothing
close to the five fields L-AC-01's schema requires. **Option 1 is the only
remaining path, and it's larger than a wiring task.** "First production
caller" for a function with zero callers means this repository's own agent-
dispatch mechanism would need an in-repo call site at all — and dispatch
today happens through the runtime harness issuing `Agent()`-style calls
from a chat session, not through a repo-internal orchestrator function.
Whether such a call site should be *built* (new orchestration-layer code,
not a caller for existing code) is a design question bigger than this
plan's other three items, not a scoping gap that more reading closes.

### A-AC-01 — nothing enforces recording before dependent action

**Gap:** the record shape (domain, status, selected option, reason codes,
evidence basis/gaps, revalidation trigger) is pinned. Nothing enforces that
the record is written *before* the dependent action, where policy requires
it.

**Blocker:** "where policy requires" names an unknown set of call sites —
the acceptance text doesn't enumerate them, and no code marks a decision
point as policy-requiring today. Same ordering-across-unknown-call-sites
shape as L-AC-01's missing producer.

**Next scoping step — run same night, and it changes the shape of the
problem.** `agent-decision-journal.mjs` exports exactly four names:
`EVENT_CLASSES` and three `validate*` functions
(`validateAgentDecisionEvent`, `validateCommandOfferEvent`,
`validateLegacyImportObservationEvent`) plus `representedEventClasses`.
**There is no constructor or builder anywhere in the module — nothing
exported creates a decision record.** Its two production importers
(`external-command-offer.mjs`, `governance-event-store.mjs`) both call it
only to *validate* a caller-supplied payload, never to build one. This
matches, and generalizes, what A-AC-05 and H-AC-08 already found
independently this session ("CONFIRMED ABSENT: no production caller emits
a selection/escalation/fallback event at all" / "...imports/migrates a
legacy record at all") — A-AC-01 has the identical root cause, just not
previously stated in those terms in the evidence map.

**"Before dependent action" is not yet the operative question for A-AC-01.**
It presupposes a recording call site to order against, and none exists in
production. The real gap underneath at least three criteria (A-AC-01,
A-AC-05, H-AC-08) is the same single missing thing: **no code path in this
repository ever constructs and emits an agent-decision-journal event during
real operation.** That is arguably the same shape of gap as L-AC-01's
missing lifecycle-event producer — the actual decision-making activity
(an Elephant/Goldfish/Critic session choosing an option, importing a
legacy record, dispatching work) happens at the chat-harness level, outside
this repository's own executable code, so nothing in the repo is ever in a
position to observe it and write the event. Building one real producer
(even for a single, well-chosen decision point) would likely move more
than one criterion at once — worth flagging to whoever scopes this next
rather than treating A-AC-01/A-AC-05/H-AC-08 as three independent tasks.

### V-AC-02 — estimate/assumption value classes unlabeled

**Gap:** the renderer labels seven of nine value classes (fact, unknown,
unavailable, redacted, invalid, not-applicable, human-decision). `estimate`
and `assumption` remain unlabeled.

**Blocker:** confirmed no field anywhere in the current schemas represents
an approximate or unverified-premise value at all — this needs a new value
class to exist upstream before the renderer could label it, not just a
rendering fix.

**CORRECTED same night, after actually doing the scoping step below: this is
NOT the smallest of the four.** The assessment above assumed a same-package
producer would turn up. It doesn't. `evidence-view-model.mjs` has exactly
one place that assigns a `valueClass` to per-artifact data
(`buildEvidenceViewModelFromFeaturePackage`, line 93) and it is
unconditionally `"fact"` — every artifact field it renders is a
digest-verified exact value from `validateFeaturePackage`'s receipt, never
an approximation. The one plausible estimate-shaped value found anywhere in
the codebase, `organization-policy-activation.mjs`'s `computeBackfillRange`/
`backfillRange` preview field (a projected date range, genuinely estimate-
shaped, already credited to P-AC-03/P-AC-09) — grep confirms
`evidence-view-model.mjs` and `evidence-view-renderer.mjs` contain **zero**
references to `organization-policy` anywhere. The two subsystems don't
share a seam today. Closing V-AC-02 for real means either building that
seam (project a `backfillRange`-shaped preview through the evidence viewer,
itself real cross-package wiring — Class S territory, not Class B) or
finding a different, still-unidentified estimate producer somewhere else in
the repo. Reclassify this as needing the same kind of investigation as
L-AC-01, not a quick local fix.

**Next scoping step, revised:** either (a) scope what projecting
`organization-policy-activation`'s preview data through the evidence viewer
would actually require (a new `evidence-view-model.mjs` entry point
alongside `buildEvidenceViewModelFromFeaturePackage`, not an edit to it), or
(b) grep the rest of the repo (`plugins/pipeline-core/lib/*.mjs`, not just
the evidence-viewer family) for any other computed-not-verified value —
a projected date, a derived count, a heuristic score — that could serve as
a smaller first producer than the organization-policy seam.

### R-AC-08 — rollback/cleanup as occurred events

**Gap:** a readback lifecycle event appends exactly once and never rewrites
the original offer (already pinned). Rollback/cleanup as *occurred* events
are absent — no such state exists at all today, only prospective values
inside `recoverability`.

**Blocker:** needs a new event kind plus wiring, not a check over existing
data — closer to L-AC-01's shape (new producer) than V-AC-02's (new value
class only).

**Next scoping step — run same night; corrects the plan's own file pointer
and sharpens the gap.** `recoverability` doesn't live in
`external-command-offer.mjs` (that file exports exactly one function,
`acknowledgeNonMaterialOfferWithoutJournal`, unrelated) — it's a field on
`agent-decision-journal.mjs`'s `command-offer`-kind event, alongside an
optional `requiredCleanup: {cleanupClass, status, digest}` companion field
whose `status` enum is **already** `["pending", "completed", "verified"]`
(`agent-decision-journal.mjs:13`). The vocabulary for "cleanup occurred" is
not missing, contrary to the plan's first-pass read — what's missing is any
mechanism to *append* a follow-up event carrying an updated status; every
fixture (`agent-decision-journal.test.mjs:39-47`) sets `requiredCleanup`
once, at construction, never demonstrating a second event referencing the
first via `offerEventId` with a transitioned status.

That question turned out moot for a sharper reason: **a repo-wide grep for
`kind.*command-offer` outside test files returns nothing.** No production
code anywhere constructs a `command-offer` event at all — the same
"validators only, no constructor" finding already made for A-AC-01 above,
just confirmed for this event kind specifically. R-AC-08 isn't a distinct
fourth gap; it's another symptom of the same one root cause.

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

**Follow-up scoping (2026-08-11, later the same night).** The two guesses
above were not wrong — grepped the full `lib`/`scripts` tree for
`release.plan|deploy.approv` variants and found no third candidate. Both
false leads (`releasePlanSha256` in `session-cleanup-recovery.mjs`/
`onboarding-continuity.mjs`) turned out to mean "release a session binding
lock," unrelated to shipping a product release; ruled out on inspection.

This also pins down the "deploy/override consumption" reader concretely:
`state.deployApprovals` is written by `pipeline-state.mjs` (TP-5-blocked, as
already known) and consumed by exactly one reader,
`authorizeRecordedDeploy()` in `critical-action-authorization.mjs:296`. Read
that function fully: it matches an approval entry by
`{forArtifact, forEnvironment, usedAt}` and verifies a detached Ed25519
proof (`verifySignedAction`) against a committed trust anchor. There is no
`decisionId` field, no reference into `pipeline.human-decision-reference.v1`,
and no dual-evaluation/migration semantics anywhere in the function —
confirmed by reading the full 45-line body, not inferred from naming.

Likewise for `release-version-plan.mjs`: its `decisionId` is
`sha256("pipeline.release-version-decision.v1\0" + canonicalJson(payload))`
— a self-binding content hash of the decision payload itself, checked
structurally on every read (`RVD-ID` / `RVP-DIGEST` failures). It is not a
reference to an externally-authored, owner/expiry-carrying human-decision
record; it cannot disagree with a second reader the way the dual-evaluation
primitive is built to catch, because nothing else produces or holds this ID
independently to disagree with.

Net: both candidate modules are confirmed correct (no third candidate
exists) and both are confirmed, by full read rather than plausibility, to
use an authority mechanism structurally different from
`pipeline.human-decision-reference.v1` + `dualEvaluateDecisionReference`.
Whether that difference means "already satisfies H-AC-12's intent by an
equally-strong alternate mechanism, document the equivalence" or "H-AC-12
means the specific reference shape literally, wire it in regardless of the
existing mechanism" is now a clean, fully-scoped PO/design call — no further
code investigation narrows it further. Put to the PO the same night via
`AskUserQuestion`; both answered "existing mechanism satisfies it," the
recommended option in both cases.

**Correction (2026-08-11, later still, advisor-flagged).** Recording that
PO answer as "satisfied, no code change, done" in the evidence map was
wrong — accepting an alternate mechanism in place of the literal
`pipeline.human-decision-reference.v1` reference changes what H-AC-12's own
SHALL text is read to require for these two subsystems. That is the same
category of act P-AC-06 is blocked on: an `acceptance.md` amendment, not a
code-evidence measurement. The PO's decision is not being re-litigated —
it stands as the answer once the amendment route clears — but it does not
land as a closed subsystem by itself, same as H-AC-11's O-4. **Both stay
open** for verdict/measurement purposes until the amendment actually lands
in `acceptance.md`, queued behind the same digest-coupling-gated signature
route as P-AC-06 (see `design/p-ac-06-clause-disposition-proposal.md`).
`evidence/acceptance-evidence-map.mjs`'s H-AC-12 entry corrected to match
(`acceptance-evidence-map-20260811d.md`).

**Git-guard override consumption — the third remaining named subsystem,
read tonight, not yet dispositioned.** Unlike the two above, this one may
not need a PO call at all: `guard-git.mjs`'s Phoenix override path
(`consumePhoenixOverrideAuthority`, restored from `998a609`) already
references a `decisionId` and validates it out-of-process against the
canonical governance-authority resolver before consuming it — mandatory
and unbypassable in a Phoenix-governed repository (this repo is one:
`governance/events/registry.json` exists), conjoined with, not instead of,
the base token check. There is no legacy "trust the token alone" path
surviving for a Phoenix-governed project to migrate away from, which is
what makes this different in kind from release-planning/deploy-consumption
above: this reader was built with the canonical check mandatory from
restoration, not layered on afterward as an alternate. Open question,
un-verified: does H-AC-12's second SHALL clause ("dual-evaluate during
migration... carry the shared compatibility owner and expiry") even apply
to a reader with no migration in progress, or does satisfying the first
SHALL clause (reference + validate the canonical decision ID) as written
already close this one as a measurement — no PO amendment needed, unlike
the other two?

**Follow-up (2026-08-11, still later the same night).** Read
`governance-authority.mjs`, the CLI `invokeGovernanceAuthority` spawns. It
is a thin wrapper over `queryHumanGovernanceDecisions` and
`requireGovernanceAuthority` (`lib/human-governance-ledger.mjs` /
`lib/governance-authority-resolver.mjs`) — the SAME checkpoint-verified,
append-only human-governance ledger H-AC-01 through H-AC-15's whole
apparatus is built on, accessed synchronously rather than in-process. This
is a materially stronger finding than release-planning/deploy-consumption:
those two use a genuinely *different* authority scheme (content hash;
detached signature) that H-AC-12's text could reasonably be read as not
contemplating. Guard-git's Phoenix override reads and writes the actual
canonical ledger — the first SHALL clause ("reference and validate the
canonical decision ID") is satisfied by the literal mechanism the criterion
is about, not a substitute for it.

The second SHALL clause is still genuinely unresolved, and it is an
interpretive question, not a further code fact to go read: "dual-evaluate
**during migration**" presupposes an old, non-ledger-backed check being
phased out that a new ledger-backed check must be reconciled against
(exactly guard-devplan.mjs/change-control.mjs's shape before WP-H-AC12).
Guard-git's Phoenix override has never had that shape — restored from
`998a609` with the ledger check mandatory and conjoined from the start, not
layered on top of a prior bare-trust path for a Phoenix-governed repo. Two
readings, both defensible, deliberately left both here rather than picked:

1. **"During migration" gates applicability.** No migration is in progress
   for this reader, so the second clause imposes nothing on it; the first
   clause is satisfied by the actual canonical ledger; this subsystem is
   done as-is.
2. **The clause is a standing requirement, not migration-conditional** —
   every direct reader carries the shared primitive's compat object
   regardless of whether a legacy path currently exists to disagree with,
   so a future legacy path (or a second, out-of-sync reader) is caught
   automatically rather than by remembering to add the check later. Under
   this reading guard-git's override does not yet close.

**Deliberately not put to the PO tonight.** Resolving this either way does
not flip H-AC-12's overall verdict — `guard-push.mjs`/`pipeline-state.mjs`
stay TP-5/GMW-blocked regardless, so there is no verdict payoff available
from a third mobile round tonight, only a partially-scoped subsystem
either way. Left for a dedicated future pass (or Critic read) rather than
spending another interruption on a question whose answer does not move the
criterion's actual state.

## The unifying finding: one root cause behind at least four criteria

Running every scoping step tonight converged on the same fact from four
different directions. `agent-decision-journal.mjs` exports validators for
three event shapes (`validateAgentDecisionEvent`, `validateCommandOfferEvent`,
`validateLegacyImportObservationEvent`) and nothing else — no constructor,
no builder, anywhere in the module. Its two production importers
(`external-command-offer.mjs`, `governance-event-store.mjs`) call it only to
validate a caller-supplied payload. A repo-wide grep for
`kind.*command-offer` outside test files returns zero results. **No code
path in this repository, during real operation, ever constructs and appends
one of these events.**

That single fact is the actual blocker behind:

- **A-AC-01** (record before dependent action) — moot until a record is
  ever written at all.
- **A-AC-05** (selection/escalation/fallback identity) — already found
  "CONFIRMED ABSENT: no production caller" independently, earlier this
  session.
- **H-AC-08** (legacy-import observation) — same, independently found.
- **R-AC-08** (rollback/cleanup as occurred events) — the vocabulary exists
  (`requiredCleanup.status`), the append-mechanism and the producer both
  don't.

The schema, validator, and storage layers for this entire capability are
built, tested, and green. What's missing is a bridge from where the
decisions this schema describes actually happen — an Elephant/Goldfish/
Critic session choosing an option, offering a command, importing a record —
to this repository's own code. That activity happens at the chat-harness
level today, outside the repo entirely, which is also exactly the shape of
L-AC-01's gap (no lifecycle-event producer) above. **Five of this plan's
originally-separate items may reduce to one architectural question:
should this repository grow a real integration point between live agent
sessions and its own governance/journal/lifecycle stores, and if so, where
does it live and who builds it first.** That's a question sized well above
"pick a Class B criterion and dispatch it" — worth surfacing to the PO
explicitly rather than continuing to scope its five symptoms as if they
were independent.

## Recommended sequencing, once any of this is picked up

**Revised same night — none of the four is a clean "smallest first" pick
anymore.** V-AC-02 was named smallest before its own scoping step ran; that
step (above) found it needs a new cross-package seam, same shape as the
other three, not a local fix. No item in this list currently has a
confirmed-small scope; all four need their revised "next scoping step" run
before any of them can be ranked by size in good faith.

**Revised again, same night — L-AC-01's own scoping step ran too, and it's
now the largest of the four, not merely the hardest-but-well-defined one.**
Both L-AC-01 candidate producers are ruled out (confirmed, not assumed):
zero production callers of `orchestrationAssignment` anywhere in the repo,
and `apply-legacy-v2-revocation-recovery` carries an operator name, not a
dispatch identity. What's left isn't "wire an existing caller" — it's
"decide whether this repository should grow an in-repo orchestration layer
at all," since dispatch today happens at the chat-harness level, outside
the codebase. That is a genuine architecture question, appropriately the
PO's to weigh in on, not a scoping gap.

1. **A-AC-01** and **R-AC-08** first, in either order — both still have a
   concrete, bounded next step (enumerate existing journal-write call sites;
   read the `recoverability` field and its readers) that hasn't been run
   yet tonight. Neither is confirmed small, but neither is confirmed to
   need new architecture either — they're the two genuine unknowns left.
2. **V-AC-02** after those, once someone either designs the evidence-viewer/
   organization-policy seam or finds an alternative producer.
3. **L-AC-01** and **H-AC-12's remaining subsystems** last, both now known
   to need a decision above the scoping level — L-AC-01 whether to build
   in-repo orchestration at all, H-AC-12 which module the acceptance text's
   "release planning"/"deploy approval" actually name. Both are PO/design
   questions, not dispatch targets, however the closure doc's dependency
   ordering ranks them.

None of this is authorized for dispatch yet. Each item's "next scoping
step" is Elephant-context investigation, matching the pattern that made
`PHX-WP-PAC06-ORPHAN` a clean single-pass win instead of a fourth
truncated dispatch.
