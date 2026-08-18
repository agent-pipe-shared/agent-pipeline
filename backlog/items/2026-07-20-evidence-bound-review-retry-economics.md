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
