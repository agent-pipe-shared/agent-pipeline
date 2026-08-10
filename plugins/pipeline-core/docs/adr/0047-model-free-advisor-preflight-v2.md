# ADR-0047: Model-free Advisor preflight and on-demand consultation v2

**Status:** accepted · **Date:** 2026-07-29

## Context

ADR-0038 correctly froze runner-neutral Advisor routes, but also made the
route execute at every Epic/Feature session start. Bootstrap therefore launched
model children and waited through availability timeouts even when no advisory
question existed. Resume, re-entry and Compact could repeat the same cost and
delay. A configured route or export consent is capability configuration, not a
reason to consult.

Changing the meaning of the frozen `pipeline.runner-profiles.v3` registry in
place would erase the distinction between route authority and lifecycle
trigger authority.

## Decision

- Keep `pipeline.runner-profiles.v3` unchanged as the route, same-runner
  fallback and legacy sanitized-receipt authority.
- Add the closed `pipeline.advisory-lifecycle-policy.v2` as the trigger
  authority.
- Epic and Feature bootstrap run only one local model-free capability
  preflight. Mini and declined consent are disabled before any child or export.
- Capability evidence reports exactly
  `available|degraded|unavailable|disabled|unknown`, an explicit assurance and
  primary/fallback disposition. With only a configured unprobed route, the
  honest state is `unknown`.
- Bootstrap receives no question and launches no child, makes no model request,
  exports no prompt, creates no consultation receipt and consumes no
  consultation budget.
- Session start, profile selection, restart, resume, re-entry, Compact,
  unchanged handover, configured route and consent are non-trigger events.
- Consultation requires one concrete question, one allowlisted reason and
  bounded evidence. `pipeline.advisory-demand.v2` binds their digests to the
  runner/profile, dispatch candidate, lifecycle policy and frozen route.
- `pipeline.advisory-consultation-record.v2` prevents an unchanged reuse key
  from launching another model. Question, reason, evidence, candidate or
  route-policy drift invalidates reuse.
- Only after a valid demand may the V3 Claude/Codex route run. If Codex keeps
  the expanded 180/90-second budgets, those budgets belong only to actual
  consultation and never to bootstrap.

## Consequences

Bootstrap latency no longer depends on Advisor model availability. Capability
state is not a consultation result, and a consultation receipt is not
bootstrap readiness. Claude and Codex share trigger semantics while retaining
their runner-specific adapters and assurances.

ADR-0038 remains authoritative for route topology but is superseded for
session-trigger and mandatory-receipt semantics. ADR-0040 remains authoritative
for consent and Codex tool/export boundaries.

## Discarded alternatives

- Lowering bootstrap timeouts was rejected because it would still launch a
  model without a question.
- Treating a configured route as `available` was rejected because configuration
  does not observe provider/model availability.
- Silently rewriting V3 `eligibility: required` was rejected because V3 is a
  frozen registry and a lifecycle split requires a version boundary.
- Reusing a prior consultation after evidence or candidate drift was rejected
  because the old judgment is not bound to the new material.

## Resubmission

Revisit when a runner exposes a stronger model-free capability attestation or
when consultation reason, evidence, reuse or privacy boundaries change.
