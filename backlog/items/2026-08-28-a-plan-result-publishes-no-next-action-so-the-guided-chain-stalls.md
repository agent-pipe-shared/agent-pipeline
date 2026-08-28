---
schema: pipeline.backlog-item.v1
id: pipeline.plan-result-publishes-no-next-action
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
tracking: "NOW / Nova A — the last measured gap between the guided init and a full drive to ready; found by smoke-testing the driver against a genuinely fresh repository"
source: "Smoke test of onboarding-init.mjs against a fresh temporary repository, 2026-08-28, at HEAD 92d1b711. Measured, not reported by any runner."
---

# Some plan results publish no `nextAction`, so the guided chain stalls at exactly those steps

## What was measured

A genuinely fresh repository was created, driven with `onboarding-init.mjs`, and answered
with canned values whenever the driver stopped on a `collect-input` action:

| | measured |
| --- | --- |
| human rounds needed | 3 |
| onboarding commands the driver chained by itself | 9 |
| repair subcommands on the normal path | 0 |

Round 1 alone chained five digest-bound steps with no human turn between them —
`inspect` → `plan` → `apply-portable-seed --plan-sha256 …` → `plan-runtime` →
`initialize-runtime --plan-sha256 …`. That is the behaviour the guided init exists to
produce, and it works.

Then it stops. After the intake design questions are answered, the driver runs
`intake-generate-plan` and halts with its own `no-automatic-next-step` outcome.

## The cause, read from the code rather than guessed

`buildOnboardingIntakeGeneratePlan()` (`lib/onboarding-continuity.mjs`, ~line 5707)
returns:

```
{ schema, root, repositoryCapability, featureId, checkpointDataSha256, targets, planSha256 }
```

There is no `nextAction`. The driver is deliberately generic over the `nextAction`
protocol and holds no domain knowledge, so it has nowhere to go and correctly refuses to
guess.

**The convention it is missing already exists and already works.** The older `plan`
command's result publishes a `nextAction` naming `apply-portable-seed` with the
`--plan-sha256` value filled in, which is exactly why round 1 chained five steps. The
Wave-4 coordinator's own plan builders simply do not follow it.

`lib/onboarding-continuity.mjs` has seven `planSha256 = canonicalSha256(...)` sites, so
this needs checking per builder rather than fixing only the one the smoke test happened
to reach.

## Why the fix belongs in the library, not the driver

The driver could be taught "a result carrying `planSha256` implies an apply step". That
would be the wrong place: it is precisely the domain knowledge the driver's own header
comment says it must not hold, and it would have to encode which apply command pairs with
which plan for all seven builders. Publishing the `nextAction` from the builder that
already knows both halves keeps the knowledge where it belongs and fixes every consumer
at once, not just this driver.

## Acceptance criteria

- Every plan builder that has a corresponding apply command publishes a `nextAction`
  naming that command with its `--plan-sha256` already filled in, in the same shape the
  `plan` → `apply-portable-seed` pair already uses.
- The smoke measurement above is re-run and reaches a terminal ready state, with the human
  rounds being only genuine decisions.
- No digest binding is weakened: the published `nextAction` carries the same
  `planSha256` the caller would otherwise have copied by hand.

## Related

- `2026-08-28-onboarding-needs-one-guided-init-instead-of-a-turn-by-turn-state-machine.md`
  — the driver this gap blocks from finishing its job.
- `2026-08-28-push-approval-mode-is-not-chosen-at-onboarding.md` — the other half of the
  same class: a question that exists but is published where the flow does not read it.
  Together these two are the pattern: the chain protocol is right, and it is applied
  inconsistently across the commands that should speak it.
