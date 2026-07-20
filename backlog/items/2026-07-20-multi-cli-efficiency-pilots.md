---
type: workflow-improvement
status: new
created: 2026-07-20
source: Public transfer completeness review of post-v0.3 Multi-CLI design and measurement work
owner: Pipeline Elephant
due: 2026-08-10
expires: 2026-08-17
---

# Measure post-v0.3 Multi-CLI efficiency pilots

## Description

The portable Multi-CLI implementation from v0.3 is present in the Public Core;
no portable Multi-CLI implementation file is missing from the Public transfer.
The remaining work is future design and measurement: reduce repeated
final-delivery evidence without losing package-specific bindings, and evaluate
review-routing hypotheses without weakening independent review or gates.

## Triggering situation

The Public transfer completeness review on 2026-07-20 distinguished delivered
Multi-CLI behavior from unimplemented post-v0.3 efficiency ideas. Those ideas
need bounded pilots and observed evidence before they can support any efficiency
claim.

## Affected artifact

The public Multi-CLI final-delivery evidence contract, package binding rules,
review-wave planning, route-selection policy, PO gates, and cost evidence.

## Proposal

Design a normalization layer for evidence repeated across final-delivery
packages while retaining an explicit binding from every package to its exact
candidate, scope, route, assurance, and result. A normalized shared fact must
not replace a package-specific binding or make one package's evidence authorize
another package.

Evaluate two independent hypotheses behind explicit PO gates:

- a wave-review pilot may reduce repeated review work when package boundaries
  and independent review obligations remain intact; and
- a remote-mini-train pilot may reduce routing overhead when every included
  package remains separately attributable, reviewable, and fail-closed.

Each pilot must define a baseline, route, cost unit, success threshold, stop
condition, and rollback before execution. Efficiency claims require observed
route and cost evidence from the bounded pilot; estimates or receipt reuse
alone are insufficient. The pilots must not weaken independent Critic review,
candidate binding, PO gates, security gates, or publication admission.

## Ownership and expiry

The next Pipeline Elephant owns triage and any accepted pilot design. The
triage due date is **2026-08-10**. If no decision is recorded by
**2026-08-17**, this item expires and must be renewed with current evidence
before further implementation, experimentation, or efficiency claims.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
