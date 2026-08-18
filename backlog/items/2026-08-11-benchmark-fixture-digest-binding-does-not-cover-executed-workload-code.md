---
schema: pipeline.backlog-item.v1
id: pipeline.benchmark-fixture-digest-binding-does-not-cover-executed-workload-code
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-11
source: "Critic review (F4, minor) of NVA-A8-4's real benchmark implementation, dispatched against commits 7132c5c7..de0b16fc, 2026-08-11."
due: 2026-08-25
---

# `pipeline.multi-cli-benchmark.v1`'s fixture-digest binding does not cover the workload code actually executed

## What happened

A Critic review of NVA-A8-4's real-benchmark work found: `evaluateMultiCliBenchmark`'s
`BENCHMARK_FIXTURES` constant (`plugins/pipeline-core/lib/multi-cli-benchmark.mjs:6-12`)
binds a `fileSha256` for one pre-existing descriptor file per class
(`plugins/pipeline-core/scripts/fixtures/nova-benchmark/<class>.json`). The
code actually executed by `nova-a8-benchmark-runner.mjs`'s `runObservation`
is `plugins/pipeline-core/scripts/fixtures/nova-benchmark/workloads/<class>/task.mjs`
(and, for `feature`, its sibling `lib.mjs`) — files added by the NVA-A8-RUNNER
work and never referenced by `BENCHMARK_FIXTURES` at all. A benchmark record
carries no digest of the code it actually ran.

**Severity, as the Critic scoped it:** minor, not blocking — "mitigated
because the record does bind candidate commit/tree, pinning the workload
bytes transitively." A record is still reproducible via the candidate
binding; this is a directness/defense-in-depth gap, not a correctness defect
in the existing sealed record.

## Why it is not a same-day fix

`validFixture`/`validFixtures` (`multi-cli-benchmark.mjs:32-33`) use `exact()`
to require the fixtures array match `BENCHMARK_FIXTURES` field-for-field,
length-for-length. This is schema-validated, contract-like code (the same
file `evaluateMultiCliBenchmark`'s scoring reads), not a loose convention —
extending it to also cover workload-code digests is a real schema decision
(new field on the record vs. widening `BENCHMARK_FIXTURES` itself vs. a
separate binding structure), not a drop-in addition. Forcing that decision
into the same dispatch as the (unrelated, mechanical) F3 retry-accounting fix
would have given a goldfish-implementor in-task design latitude it was not
briefed for.

## Direction (for whoever picks this up)

- Decide the binding shape: a new `workloadDigests` array alongside
  `fixtures` (additive, keeps `BENCHMARK_FIXTURES`'s existing exact-match
  validation untouched) is the option that changes the least; widening
  `BENCHMARK_FIXTURES` itself would require updating every existing
  fixture-validation call site and any consumer that assumes today's 5-entry
  shape.
- Whatever shape is chosen needs its own `validX()` function mirroring
  `validFixture`/`validFixtures`'s strictness (`exact()`, `SHA` pattern,
  sorted/unique where relevant) — do not loosen the existing pattern for the
  new field.
- Cover `feature`'s sibling `lib.mjs`, not only each class's `task.mjs` — the
  `feature` workload asserts against it (`nova-a8-benchmark-runner.test.mjs`
  confirms this at the "feature workload asserts against its sibling
  lib.mjs" check), so it is part of the code actually executed.
- This does not require re-running the existing sealed record
  (`specs/sprint-nova-epic/evidence/nova-a/a3/multi-cli-benchmark-record-718b019.json`)
  — it predates this fix and stays valid under the unchanged schema; a new
  sealed record binding workload digests is a separate, later concern (real
  CLI calls stay minimal per standing PO guidance, so a re-run should not be
  triggered just to backfill this).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, remains open in current backlog. Re-verified
  2026-08-17: `plugins/pipeline-core/lib/multi-cli-benchmark.mjs` still has
  no `workloadDigests` field or equivalent; `BENCHMARK_FIXTURES` is
  unchanged. Still unresolved, still minor per the Critic's own scoping
  (mitigated by the existing candidate commit/tree binding).
- **Rationale:** Nova-A-specific tooling (`multi-cli-benchmark.mjs`), not a
  match for Alfred/Nightwing/Batman's confirmed scopes; a real schema
  decision, not urgent enough to interrupt current work, and explicitly
  does not require re-running the existing sealed benchmark record.
- **Assignment (if accepted):** unassigned; direction is fully specified in
  this item's own Direction section.
- **Date:** 2026-08-17

### Release-sweep disposition (2026-08-18)

- **Decision:** queued for dispatch — implement the item's own Direction
  section as scoped: add a `workloadDigests` array alongside `fixtures` in
  `BENCHMARK_FIXTURES` (additive, keeps existing exact-match validation
  untouched), a new `validWorkloadDigests()` mirroring `validFixture`/
  `validFixtures`'s strictness (`exact()`, SHA pattern, sorted/unique), and
  digest coverage for `feature`'s sibling `lib.mjs` alongside each class's
  `task.mjs`. Does not require re-running the existing sealed benchmark
  record.
- **Rationale:** real schema/code change to contract-like validation code
  (`multi-cli-benchmark.mjs`) that needs tests to trust — not a same-session
  doc fix, and not tied to any named still-open future sprint, so it is
  queued for a dedicated implementation dispatch rather than left
  unassigned.
- **Assignment:** next available Nova/pipeline implementation dispatch;
  scope is fully specified above and in the item's own Direction section.
- **Date:** 2026-08-18
