---
schema: "pipeline.backlog-item.v1"
id: "pipeline.evidence-bound-review-retry-economics"
type: "workflow-improvement"
owner: "pipeline"
status: "open"
created: "2026-07-20"
source: "Public V3 Foundation stabilization review of formal review and dispatch retries"
due: "2026-08-03"
expires: "2026-08-10"
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

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
