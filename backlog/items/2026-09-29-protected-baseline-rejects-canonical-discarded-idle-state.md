---
schema: pipeline.backlog-item.v1
id: pipeline.protected-baseline-rejects-canonical-discarded-idle-state
type: defect
owner: pipeline
status: open
created: 2026-09-29
sprint: alfred
done_when: manual
source: "Actual Guard CLI positives after public onboarding, canonical discard, ready-gate validation and active governance-scope observation."
---

# Accept the canonical optional close-history shape in protected path discovery

The public portable/runtime/kickoff/discard path produces a valid idle State
without `closedFeatures`. Source inspection and the ready gate accept it, and
the governance scope is active. Actual patch-guard CLI execution nevertheless
fails in `guard-testpath` with `PB-DYNAMIC-UNAVAILABLE`: the protected baseline's
dynamic classifier requires `closedFeatures` to be an array even when absent.

Direct contracts: `lib/protected-baseline.mjs` unconditionally checks the field;
the `pipeline-state.mjs` discard writer appends `discardedFeatures` without
creating close history; `onboarding-continuity.mjs` explicitly permits the
discarded-only shape and reads absent close history as empty. Do not mask this
product mismatch by adding invented State fields to the fixture.

Actual Source fixture evidence:
`scratch/0.7-patch-guard-canonical-fixture-qualification-20260929/idle-classifier-finding.json`.
One exact runner-boundary callback passed; both original positive callbacks
failed at this classifier. Source bindings remained stable. The correction's
native Source write was refused with `PB-BASELINE-LOADER`, request
`cc61d914d8336a7e0bfcca237381bf5f17a022ea983b9961509c2747f1ec39c5`.
The exact inert proposal is under
`scratch/0.7-canonical-idle-protected-baseline-compatibility-20260929/`;
no Source delivery, alternate writer or override consumption is claimed.

## Acceptance

- Canonical valid idle/discarded State without close history resolves dynamic
  protection as available with no close bindings, retaining the immutable
  shipped baseline and project additions.
- Present malformed close history, malformed State, unreadable paths, physical
  escapes and aliases remain fail closed.
- Valid existing close bindings remain dynamically protected.
- Both original positive guard CLI/fanout tests pass on actual canonical ready
  fixtures; preserve their assertions and the original failing trajectory.
- Bind correction receipts and the fixed committed candidate. Installed
  acceptance remains separate; this item is open during correction.
