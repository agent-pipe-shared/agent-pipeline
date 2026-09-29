---
schema: pipeline.backlog-item.v1
id: pipeline.git-hook-runtime-snapshot-omits-protected-baseline-catalog
type: defect
owner: pipeline
status: open
done_when: manual
created: 2026-09-29
sprint: alfred
tracking: "0.7 local candidate remediation — shipped hook runtime dependency closure"
source: "Original four-shard onboarding qualification and bounded runtime snapshot import-path diagnosis."
---

# Git-hook runtime snapshot omits its protected-baseline catalog

The hook installer publishes a private, digest-bound runtime snapshot and
points the installed implementation at its `lib/` directory. Snapshot
enumeration includes only `lib`, `hooks`, `scripts`, `config` and `schemas`.
It omits the plugin-root `protected-baseline.json` that the copied baseline
loader resolves relative to its own module.

Consequently the original onboarding handover callback fails its commit with
`PB-BASELINE-UNAVAILABLE` for `architecture/adoption-state.json`. The catalog
is absent from the snapshot by construction. The separate proposed loader
fix for optional idle close history does not restore this omitted data.

## Evidence and limits

- Prepared complete original onboarding attempt: 149 passed, one failed,
  34 unobserved at the original 900-second limit; not a complete or Source PASS.
- Frozen result:
  `scratch/0.7-onboarding-fixture-source-failure-repair-20260929/prepared-184-proposal/manifest.json`,
  SHA `899998a367bcf039ab3c75ec625d45d5be35749808a5ff4051a169b0a8df745e`.
- Bounded static diagnosis:
  `scratch/0.7-onboarding-fixture-source-failure-repair-20260929/prepared-184-proposal/static-diagnosis.json`,
  SHA `3a28c48a5fabf947fe4cd598f37d421437564b0f69b7a3d17c203473c8676f8d`.
- The proposed loader alone was overlaid read-only; the actual Source loader
  stayed unchanged. No snapshot correction or successful handover is claimed.
- The merged timeout output cannot establish which internal operation stalled
  the remaining callbacks. This catalog defect does not explain all 34 missing
  outcomes.

## Required correction

Include the exact public root catalog in the existing inventory/hash/copy and
physical verification contract. Use a narrow named allowlist, preserving
budgets, ownership and refusal of aliases, tampering and unsafe paths. Do not
copy arbitrary plugin-root files or introduce an invented permissive catalog.
Missing required catalog data must produce a useful failure rather than a
successfully published runtime that cannot perform its guard checks.

## Acceptance criteria

- An installed runtime snapshot contains the exact intended catalog and its
  digest; the copied loader resolves that snapshot-local catalog.
- The original onboarding handover commit succeeds after all relevant actual
  Source corrections and remains bound to an honest completion result.
- Missing, changed or aliased catalog content remains refused under the
  existing physical/inventory integrity controls.
- Original hook, install/removal, protected-path refusal and onboarding
  assertions remain intact; no fixture hides a missing shipped dependency.
- The final source dependency/registration closure and candidate-bound checks
  include the corrected snapshot producer and its regression coverage.

## Intake status

Confirmed defect; the snapshot and admission corrections are delivered in Source.
The original hook suite passes 55/55 with explicit fixture enrollment and its
inactive-repository control retained. Delivery manifest SHA
`2717d61b6505f337eaeca2b8012f26a4b4ea70dcdfe969f4371e6df537f408ac`;
three-path Source lineage SHA
`66142bbe06436a066651ac1701d262e68a9b3786916ad9598d2939033654f5f7`.
The full original184 onboarding suite and final candidate qualification remain
pending. The earlier prepared-run statements above are historical. This item is not
committed or registered yet because the current product commit is held at the
normal protected-path backstop. Do not mark it closed from the static diagnosis
or an isolated snapshot test.
