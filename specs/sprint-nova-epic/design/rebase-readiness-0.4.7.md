# Nova 0.4.7 rebase-readiness dossier

> Planning-only artifact. It authorizes no fetch, rebase, stash, commit,
> force-push, merge, release, Issue mutation or protected-surface edit.
> Normative requirements remain in the approved PRD, Spec and Acceptance
> matrix. This dossier makes their later execution deterministic.

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
