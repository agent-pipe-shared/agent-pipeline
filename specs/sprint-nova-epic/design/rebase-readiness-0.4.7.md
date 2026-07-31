# Nova 0.4.7 adoption and rebase record

> This artifact began as the planning-only readiness dossier and now retains
> the exact completed local adoption record. It authorizes no force-push,
> merge, release, Issue mutation or protected-surface edit. Normative
> requirements remain in the approved PRD, Spec and Acceptance matrix.

## Current observation — 2026-08-01

- Nova branch: `feat/sprint-nova-codex-v046`.
- Pre-design-reconciliation Nova head:
  `7f47613908e4be862865aaa92c8b888d066585c4`, tree
  `0ab81c85412432d424db0961d6d439a8e5fd6c2f`.
- Released `main` / `v0.4.7` commit:
  `89cb12b99e3fd86ac44878d0c23b278f00538921`, tree
  `b6537dcaa7bee526d9a393e2603b28648f4b0438`.
- The release identity is accepted as the immutable NVA-G13 baseline; a newer
  `main` head does not retarget Nova silently.
- The Nova worktree contains the explicitly activated runner-neutral project
  authority migration and the open Design reconciliation. The PO authorizes a
  local design/migration commit before rebase. No push is authorized.

## Completed local adoption — 2026-08-01

- Previous Nova head: `480f2f7091990da06924e33c280b47dcc7921fa8`,
  tree `c7f0121098b3ceedd7e7e6153398afb1505efb3d`.
- Adopted release commit: `89cb12b99e3fd86ac44878d0c23b278f00538921`,
  tree `b6537dcaa7bee526d9a393e2603b28648f4b0438`.
- Immediate post-rebase head:
  `94a4904a13518bed4b060ad89a17f3ba2bb36cb3`, tree
  `ce4d74cf00dc3976734dfff264b884d31916e240`.
- `git merge-base` readback equals the adopted release commit. The local
  branch contains 54 replayed Nova commits above that base and has not been
  pushed.
- Git executed 56 replay steps with `ort` and the rebase-side `ours`
  preference, meaning released v0.4.7 bytes won every overlapping hunk while
  conflict-free Nova additions were retained. No manual conflict resolution
  was required.
- Commit `28e797f7ca6231cffcf702d5ce6ad79d953bc2ad` (cleanup recovery)
  and commit `480f2f7091990da06924e33c280b47dcc7921fa8` (neutral guard
  audit) were dropped because their patch contents already existed upstream.
- The automatic strategy selected the v0.4.7 `project/pipeline-state.json`
  preimage wholesale. That was correct for released code but not sufficient
  for the active branch authority: it reactivated the already closed Hotfix
  and orphaned the Nova cleanup binding. The lifecycle then returned
  `partial` with `cleanup_recovery_observation_unavailable` and exposed no
  `nextAction`.
- The PO-confirmed recovery required an exact three-way state postimage. It
  retained all v0.4.7 closed-feature records, retained the older Sentinel
  close record, restored the approved Nova PRD/Spec/continuity authority and
  then used the sanctioned writer for the phase transition. The checked
  preimages were Nova
  `1466996e0ec19aa291052e7866126566d7bed9d95fa5554e9e621dcf697b6175`
  and v0.4.7/current
  `c3232a33ff3caf6f838753d1498b1a9d18214fe221770721f5def2a1640dc0c2`;
  the recovered Design-state postimage was
  `b339d356cd63e9dfb4853376fbd1d46820b373be0c88c40f2d6d1d490739cd48`.
- The first postimage session inspection returned `ready`, runtime
  `readback-current`, valid continuity and `CAS-READY`. The safety stash
  `nova-rebase-pre-0.4.7` remains retained until candidate verification.

### Evidence disposition

- All pre-rebase candidate-bound Verify, Security, Critic, release-preflight
  and publication evidence is invalidated for the rebased candidate.
- Historical B4R and v0.4.7 evidence remains historical provenance only and
  cannot satisfy a Nova gate.
- Focused results may guide test selection, but every source/schema/shared
  dependency touched by the 0.4.7 range is rerun. The complete configured
  Verify, Security and independent Critic gates are always fresh for the final
  Nova candidate.
- The guard deadlock, missing recovery action, non-overridable command classes,
  expired-plan retry behavior and multi-step Human friction observed during
  this adoption are explicit A6R/#98 regression inputs, not successful guard
  behavior.

## Rebase admission record

The PO must supply or confirm all values in this record before any rebase:

| Field | Required value | Admission rule |
| --- | --- | --- |
| Stable ref | `89cb12b99e3fd86ac44878d0c23b278f00538921` | released `main` / `v0.4.7` identity |
| Stable tree | `b6537dcaa7bee526d9a393e2603b28648f4b0438` | read back from the same commit |
| Version evidence | published `v0.4.7` tag/release and Issue #98 observation basis | exact released baseline, not partial/auth |
| #63 evidence | accepted upstream recovery candidate and required regression command set | Nova consumes it only as compatibility input; it makes no #63 delivery claim |
| Worktree disposition | commit the reviewed Nova design and activated project-authority migration locally before rebase | preserve the existing safety stash until post-commit readback; no reset/overwrite |
| Rebase authorization | already supplied for the exact released baseline after Design correction | execution waits for renewed design gate |

Any missing, ambiguous or mismatched value is a stop condition. A newer `main`
head or a same-version string alone is not a substitute for this record.

## Frozen Nova inventory

### Pre-rebase contract deltas

The current dirty delta contains the following Nova-owned A1--A6 kernels and
their focused tests/schemas:

- `runner-capability-report`, `selected-sandbox-disposition`;
- `invocation-reliability`, `invocation-preflight`, invocation request/attempt
  schemas;
- `execution-plane-contract`, `scheduling-lifecycle`, execution subject/state
  and scheduling schemas;
- `critic-review-lineage`, `review-economy`, Critic packet preflight and schema;
- `multi-cli-benchmark`, `release-preflight` and schemas; and
- the approved Nova PRD/Spec/Acceptance/plan/result/lifecycle and intake
  reconciliation artifacts.

The exact path list is always regenerated from the worktree immediately before
the PO-approved snapshot. No hand-maintained list here can supersede that
readback.

### Activated project-authority migration

`project/pipeline.json`, `project/pipeline.yaml`, `project/pipeline-state.json`
and `project/guard-config.json` were explicitly activated by the PO through the
digest-bound 0.4.7 migration. They are now intended local candidate bytes and
must be included in the pre-rebase design/migration commit with their exact
post-selection Design state. The older stashed copies are recovery input only
and cannot overwrite the selected Spec binding or current revocation.

### Protected and shared surfaces

Before the rebase, do not edit or auto-resolve:

- Bootstrap/onboarding, installation/marketplace, runtime projection/readback,
  or V4/#63 recovery paths;
- `.claude/guard-config.json` and protected TP-1/TP-2/TP-4/TP-5 surfaces;
- central Verify registration, ADR register, generated runtime projections,
  canonical backlog writer/ledger projections, or product capability inventory.

The standing TP-1/TP-3/TP-5 lift is path-scoped and must be applied/restored
only for an exact future task. It does not authorize automatic conflict
resolution on any of these paths.

## Rebase execution order

1. Read the supplied stable-ref/tree/version/#63 admission record from the
   exact remote target.
2. Validate and commit the explicitly approved project-authority migration and
   reviewed 17-Issue Design reconciliation locally; retain the safety stash
   until exact commit readback.
3. Rebase only that approved Nova snapshot onto the exact accepted baseline.
4. For every conflict, record the upstream path, Nova path, affected acceptance
   IDs, selected resolution, and whether the resolution changes Nova scope.
   An uncertain or protected conflict stops for PO review.
5. Regenerate the Spec/backlog/lifecycle bindings and compare the 17-Issue
   intake against the current GitHub `sprint:nova` intersection. Do not infer
   a closure or import another Sprint/hotfix issue.
6. Run the #63 recovery regressions on the rebased Nova candidate as baseline
   compatibility evidence. Do not report their success as Nova or #63 delivery.
7. Reclassify every focused A1--A6 result by actual changed path: rerun affected
   tests; invalidate results whose source, schema, test, fixture, generator or
   shared dependency changed; retain only explicitly unaffected evidence.
8. Only then open the separate protected A7 integration package. Its central
   registrations and candidate gates remain a fresh Goldfish task.

## Post-rebase evidence matrix

| Scope | Required focused evidence | Rebase impact rule |
| --- | --- | --- |
| A1/#57 | reconciliation and backlog-state suites; default checker | any backlog/schema/ledger or #63 change reruns all; reachable-history result must be observed, never assumed |
| A2/#7/#29 | runner report, selected disposition, Codex compatibility/select/runtime tests | any runtime, adapter, profile or schema change reruns the affected matrix |
| A3/#38 | invocation reliability and preflight suites | any invocation, selected-sandbox or repair-taxonomy change reruns both |
| A4/#12/#14 | execution contract, scheduling, planner, control-exchange and workflow-boundary tests | any shared exchange/planner change reruns the complete A4 matrix |
| A5/#54 | lineage, review economy and host-capable packet preflight | any packet/host/lineage change reruns all; sandbox `EPERM` is not success evidence |
| A6/#8/#56 | benchmark and release-preflight suites | any candidate/version/doc-governance/gate change reruns the affected suite |
| A6R/#98 | publication capability/CLI, Verify resume, Critic release-lineage and release-state consistency suites | always built and tested from the released 0.4.7 surfaces; no Hotfix gate evidence substitutes for Nova evidence |
| A7 | central Verify registration, clean candidate, Full Verify, Security and independent Critic | always fresh after the rebase; pre-rebase evidence cannot satisfy this row |

## Exit criteria for this dossier

This preparation is complete when the released baseline and pre-rebase Nova
identity are exact, the design/migration snapshot is locally committed and
read back, all protected conflicts fail closed, and the test/invalidation
matrix can be applied without redesign. It does not itself satisfy NVA-G13,
accept Nova A, activate Nova B or complete any Issue.
