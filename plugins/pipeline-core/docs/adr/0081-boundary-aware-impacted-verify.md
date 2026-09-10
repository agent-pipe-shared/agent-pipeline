# ADR-0081: Verify is impact-scoped at ordinary boundaries and full at release

**Governs:** .github/workflows/verify.yml, docs/operating-model.md, docs/push-release-flow.md, docs/usage.md, guardrails/quality-gates.md, harness/scripts/self-verify-selection.mjs, harness/scripts/verify.mjs, plugins/pipeline-core/hooks/guard-push.mjs, plugins/pipeline-core/lib/consumer-baseline-verify.mjs, plugins/pipeline-core/lib/consumer-verify.mjs, plugins/pipeline-core/lib/human-guard-override.mjs, plugins/pipeline-core/lib/project-onboarding-v3.mjs, plugins/pipeline-core/lib/verify-selection.mjs, plugins/pipeline-core/scripts/codex-critic-host.mjs, plugins/pipeline-core/scripts/consumer-verify-check.mjs, plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs, plugins/pipeline-core/scripts/pipeline-state.mjs, plugins/pipeline-core/scripts/publication-gate-evidence.mjs, plugins/pipeline-core/scripts/push-gate-satisfiability.mjs, plugins/pipeline-core/scripts/push-prepare.mjs, plugins/pipeline-core/scripts/verify-evidence-producer.mjs, plugins/pipeline-core/scripts/verify-evidence.schema.json, plugins/pipeline-core/scripts/verify-journal.mjs

> Agent-Pipeline · Nova sprint (`sprint-nova-epic`) · 2026-09-10

**Status:** accepted (2026-09-10, PO instruction: *"Macht es nicht Sinn die
verify Logik auch etwas umzubauen, so dass nur betroffene Bereiche nötig sind
außer für einen echten release flow?"* followed by *"Okay baue das so"* and the
explicit requirement that the standard also apply to user repositories).

**Supersedes:** ADR-0065 Decision 3 and Decision 8 only where they require a
full candidate or ordinary push run. ADR-0065's exact candidate binding,
declared-input receipts and runtime enforcement remain in force.

## Context

The journal can resume suite receipts, but the public Verify result does not say
why suites were selected or omitted. Its production caller registers the entire
suite inventory, while consumer projects expose one opaque command. This makes
ordinary work, Critic preparation, local candidates and pushes pay release cost.
It also leaves a newly onboarded project with no useful check when it has not yet
defined a product command.

## Decision

Verify has five explicit boundary modes: `work`, `critic`, `candidate`, `push`
and `release`.

- Work, Critic, candidate and ordinary push runs select a fixed baseline plus
  the commands registered for every changed area between an explicit base and
  candidate.
- Release, tag, marketplace and publication runs execute the complete registry.
  A release run never omits a suite and cannot consume an impacted receipt as a
  substitute.
- A missing base, unavailable diff, unknown changed path, invalid policy or
  unclassified suite selects the full registry. Selection failure increases
  work; it never removes a check.
- Evidence records mode, base, candidate, changed paths, complete registry,
  selected and omitted suites, matched areas, unmatched paths, fallback reason,
  rule digest, changed-input digest and selection digest.
- Consumers enforce their own boundary. Critic requires `critic`, normal push
  requires `push`, and publication requires full `release` evidence.

Consumer projects receive the same engine. The shipped baseline always checks
project authority and manifest validity, tracked JSON syntax, merge-conflict
markers and `git diff --check`. A project can register baseline and area
commands under `verifyImpact`. Until it has a full product command, evidence is
labelled `baseline-only`; it is usable for ordinary development but cannot pass
release preparation.

The project impact configuration schema is `pipeline.project-verify-impact.v1`:

```json
{
  "schema": "pipeline.project-verify-impact.v1",
  "baseline": [{ "id": "types", "command": "npm run typecheck" }],
  "areas": [
    { "id": "web", "paths": ["src/web/**"], "commands": [{ "id": "web-tests", "command": "npm run test:web" }] }
  ]
}
```

The full command remains the calibration's `verify` field. Unknown paths fall
back to that command. A release without it is refused.

## Consequences

The common path becomes cheaper while the release claim becomes more precise.
Area ownership is now a gate-strength input and must be versioned and reviewed.
Repositories with no area policy retain safe behavior: their configured command
runs for every change. Repositories with no product command gain honest baseline
coverage without acquiring a false product-test claim.

The self repository starts conservatively. Executable source, gate, template or
configuration changes select its full registry. Only classified documentation
changes may select the documentation registry. Expanding that mapping requires
the same guard and Critic treatment as any other gate-strength change.
