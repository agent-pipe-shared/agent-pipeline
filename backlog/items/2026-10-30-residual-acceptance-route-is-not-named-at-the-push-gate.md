---
schema: pipeline.backlog-item.v1
id: pipeline.residual-acceptance-route-is-not-named-at-the-push-gate
type: defect
owner: pipeline
status: open
created: 2026-10-30
priority: P2
release: 0.7.1
sprint: alfred
source: "Consumer handover 2026-10-30 (gate hints and command builder); PO 2026-10-30: minor, filed after 0.7.0"
done_when: manual
---

# The residual-acceptance route is not named at the push gate

## Evidence

For `critic-bound-verify`, `push-init` says only "run critic-dispatch-preflight … then Verify that exact
candidate". It names neither `approve-residual-acceptance` nor the carry-forward, so a FAIL with only minor
findings needs code reading (`lib/critic-verify-readiness.mjs`, `lib/critic-verify-lifecycle.mjs`). There is no
command builder for `authorize-critical --kind accept-residual-critic-findings` like
`authorizeCriticalPushCommand`; the consumer agent built the command itself.

## Wanted

1. `push-init` names the residual-acceptance route when the bound Critic verdict is FAIL with only minor
   findings.
2. An `authorizeCriticalResidualCommand` builder with the same copy-safe line forms as the push one.
