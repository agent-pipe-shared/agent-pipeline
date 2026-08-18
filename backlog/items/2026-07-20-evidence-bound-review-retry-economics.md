---
schema: "pipeline.backlog-item.v1"
id: "pipeline.evidence-bound-review-retry-economics"
type: "workflow-improvement"
owner: "pipeline"
status: "in_progress"
created: "2026-07-20"
source: "Public V3 Foundation stabilization review of formal review and dispatch retries"
due: "2026-09-08"
expires: "2026-09-15"
---

# Bound review retries to valid evidence

## Description

A formal review or dispatch abort can force a broad repeat even when the
candidate and already validated domains are unchanged and the abort produced no
new domain finding. Repeating every stage increases latency and model cost while
also obscuring which evidence was actually invalidated.

## Triggering situation

The Public V3 Foundation stabilization on 2026-07-20 retained this workflow debt
from `docs/known-issues.md` for explicit product design rather than embedding an
ad hoc retry shortcut in verification.

## Affected artifact

The public review-economy policy, dispatch/review receipts, retry planning, and
the evidence invalidation rules used by Verify and Critic admission.

## Proposal

Define a deterministic retry planner that preserves prior evidence only when it
is still valid for the exact candidate and domain. A retained receipt must bind
the same commit, tree, scoped diff/domain, policy version, route and assurance,
and must remain within its declared freshness window. The abort evidence must
classify the failure as transport, execution, or orchestration rather than a
domain finding.

The acceptance boundary is:

- candidate, scope, policy, route, assurance, or freshness drift invalidates the
  dependent receipts and triggers the required broader rerun;
- a domain finding always reopens its affected domain and dependencies;
- an evidenced infrastructure-only abort may retry only the failed stage while
  retaining exact still-valid receipts;
- bounded attempt counts and per-stage reuse/rerun decisions are recorded in
  machine evidence so retry cost is measurable; and
- retained evidence never becomes a Critic PASS, readiness, release, or
  conformance claim by itself.

This is **P2**: it improves review economics after the P1 recovery false-success
boundary is addressed. The owner is the next Pipeline Elephant with review-
economy and receipt-contract scope. Target review date: **2026-08-03**.

## Ownership and expiry

The next Pipeline Elephant owns triage and an accepted implementation package.
The triage due date is **2026-08-03**. If no decision is recorded by
**2026-08-10**, this item expires and must be renewed with current evidence
before further implementation or prioritization.

## Close-retro addendum — 2026-07-21

The recovery-preview quickfix showed that a synchronous duration check can
fail closed after a callback returns, but cannot pre-empt a callback that never
returns. Future retry and recovery evidence must therefore bind the execution
boundary explicitly and distinguish bounded completion from an unavailable or
interrupted transport.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Renewal (2026-08-18):** expired 2026-08-10 with an empty Triage section,
  never triaged in the ~4 weeks since filing — the SAME mistake class this
  session made and corrected for `pipeline.multi-cli-efficiency-pilots`
  (NVA-A8-5): trusting inherited matrix/known-issues prose over the
  defining backlog item itself. Its P1 prerequisite
  (`2026-07-20-recovery-preview-callback-attestation.md`, "the P1 recovery
  false-success boundary") was ALSO expired and untriaged; found to already
  be correctly implemented, independently Critic-reviewed (PASS, this
  session), and closed immediately before this renewal. P2 is therefore
  genuinely unblocked now, not just nominally.
- **Decision:** accepted, current scope, narrowed for a first implementation
  package. Build the retry planner as a new, standalone, independently
  testable library module — a pure decision function, not yet wired into
  Verify's or Critic admission's live retry path. This mirrors the pattern
  already used successfully elsewhere this session (the GMW kernel-closure
  invariant, the execution-plane real-outcome normalizer): build and prove
  the mechanism in isolation first; live wiring into the actual Verify/
  Critic retry call sites is a separate, later, higher-risk follow-up once
  the module itself is accepted and Critic-reviewed. This item's Proposal
  is otherwise ALREADY the design: a deterministic function from (prior
  stage receipts + a new abort event + policy) to a retry plan, per its own
  acceptance-boundary bullets — no further design decision is needed before
  a first implementation package can be dispatched.
- **Rationale:** the acceptance boundary this item already specifies is
  concrete and testable (receipt binding fields, freshness windows, the
  transport/execution/orchestration-vs-domain-finding classification, the
  "retained evidence never becomes a PASS/readiness/release claim by
  itself" invariant) — building it as an isolated module needs no PO input
  and carries far less risk than wiring it live into the gates that
  actually decide Verify/Critic admission on the first pass.
- **Assignment:** goldfish-deep implementation package, dispatched this
  session as `NVA-RETRYECON-1` (see `docs/state.md` for the outcome) — a
  new `plugins/pipeline-core/lib/review-retry-planner.mjs` (name subject to
  the dispatch's own judgment) implementing the acceptance boundary exactly,
  with a full regression suite covering every bullet, and a mandatory
  Critic review before this item can move toward closure. Live wiring into
  Verify/Critic's actual retry call sites is explicitly OUT of this
  package's scope — a distinct, later, separately-triaged follow-up once
  this module itself is accepted.
- **Date:** 2026-08-18

### `NVA-RETRYECON-1` landed and Critic-PASSed — 2026-08-18

`plugins/pipeline-core/lib/review-retry-planner.mjs` (427 lines) +
`review-retry-planner.test.mjs` (327 lines, 17/17 passing, one test per
acceptance-boundary bullet). Implements every acceptance-boundary bullet
above as a pure, unwired decision function: binding drift on candidate/
scope/policy/route/assurance/freshness invalidates and propagates through
declared dependents to a fixpoint; a domain finding always reopens its
domain; an evidenced infrastructure-only abort (`transport`/`execution`/
`orchestration`) retries only the aborted stage and retains every other
still-valid receipt; an unevidenced/unknown cause is representable only as
`unclassified` and fails closed to a full rerun (closing the exact
fraud-shaped gap an unevidenced infrastructure claim would otherwise open);
every per-stage decision is recorded in machine evidence; a retry plan is
structurally unreadable as a PASS/readiness/release/conformance claim (no
verdict vocabulary, no boolean `true` field, `claimAuthority` pinned to
`"none"` and re-validated, no embedded receipt, `isReviewRetryPlan`
exported so a consumer can positively refuse one). Deliberately more
conservative than `verify-resume.mjs`'s ADR-0065 Tier-B path: no
cross-candidate-reuse switch exists or should ever be added here, per this
item's own acceptance boundary and ADR-0065 Decision 8's own release-bound
default. Committed `4d23d8c2`.

Independent Critic review (`a3b9acbf..4d23d8c2`, functional-equivalent-
read-only): **PASS, no findings.** The reviewer independently re-derived
the exact plan-forgery attack the implementor's own first test run had
caught (promote a stage from `rerun` to `retained`, patch `cost`, recompute
the digest) before discovering the test already covered it — confirmed
the anti-forgery cross-check structurally prevents it. Confirmed no live
call site references the new module (`grep` across `plugins/pipeline-core`
and `harness` finds only the module's own test). 17/17 independently
re-run and byte-matched.

**What remains, for whoever picks this up next:** live wiring into the
actual Verify/Critic retry call sites (`harness/scripts/verify.mjs`,
`publication-executor.mjs`, or wherever review-economy retries are
actually decided today) — a separate, higher-risk follow-up, deliberately
out of this package's scope, not yet triaged or assigned. The module and
its test are also not yet registered in `verify.mjs` (by design, since
nothing calls it yet). Status stays `in_progress` until live wiring is
designed, triaged, and lands.

### Update, 2026-08-18 — release-bar triage: live-wiring follow-up decided

- **Decision:** decided, queued for dispatch. The module itself
  (`review-retry-planner.mjs`) is built, tested and Critic-PASSed; what
  remains — wiring it into the actual Verify/Critic retry call sites — was
  left "not yet triaged or assigned" immediately above, which is exactly
  the unresolved-remainder shape the 2026-08-18 release-bar sweep exists
  to close. Scoping it now: the wiring dispatch's job is to call the
  already-accepted, already-tested decision function from
  `harness/scripts/verify.mjs` and/or `publication-executor.mjs` at the
  points where a retry is currently decided ad hoc, and to register the
  module + its test in `verify.mjs`'s own suite enumeration — not to
  redesign the acceptance boundary, which this item's Proposal already
  settled and `NVA-RETRYECON-1` already implemented.
- **Rationale:** live wiring changes what Verify/Critic admission actually
  does on a retry, so it needs its own regression coverage and a
  Critic review before it can be trusted — the same reasoning that kept it
  out of `NVA-RETRYECON-1`'s own scope in the first place. `status` stays
  `in_progress` rather than closing, since the module existing unwired is
  not the same as this item's own goal (bounding retry economics in the
  live gates) being met.
- **Assignment (if accepted):** a follow-up `goldfish-deep` dispatch,
  scoped exactly as above, with a mandatory Critic review before this item
  can move toward closure — matching the same two-step pattern
  (build-in-isolation, then wire-and-review) `NVA-RETRYECON-1`'s own
  Triage already used successfully.
- **Date:** 2026-08-18
