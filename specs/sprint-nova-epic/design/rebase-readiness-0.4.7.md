# Nova 0.4.7 rebase-readiness dossier

> Planning-only artifact. It authorizes no fetch, rebase, stash, commit,
> force-push, merge, release, Issue mutation or protected-surface edit.
> Normative requirements remain in the approved PRD, Spec and Acceptance
> matrix. This dossier makes their later execution deterministic.

## Current observation

- Nova branch: `feat/sprint-nova-codex-v046`.
- Last observed branch/upstream commit: `28e797f7ca6231cffcf702d5ce6ad79d953bc2ad`.
- Last observed remote main: `83640cec22d494d227eebc82929370277ce926b9`.
- `main/VERSION` currently reads `0.4.7-partial-auth`; no `v0.4.7` tag was
  observed. It is therefore **not** the stable baseline required by NVA-G13.
- The Nova worktree is intentionally dirty. It must not be stashed, reset,
  committed, discarded or rebased by this dossier.

## Rebase admission record

The PO must supply or confirm all values in this record before any rebase:

| Field | Required value | Admission rule |
| --- | --- | --- |
| Stable ref | exact accepted `main` 0.4.7 commit | full 40-hex Git object ID |
| Stable tree | tree of that commit | full 40-hex Git object ID, read back from the same commit |
| Version evidence | release/version receipt | proves stable 0.4.7 rather than a partial/auth or development baseline |
| #63 evidence | accepted upstream recovery candidate and required regression command set | Nova consumes it only as compatibility input; it makes no #63 delivery claim |
| Worktree disposition | explicit PO-approved snapshot mechanism | no implicit stash, auto-commit, reset or overwrite |
| Rebase authorization | affirmative PO signal naming the exact commit/tree | branch/remote names alone are insufficient |

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

### Deliberately excluded user-owned inputs

`project/pipeline.json`, `project/pipeline.yaml`, `project/pipeline-state.json`
and `project/guard-config.json` are untracked local inputs. They are not Nova
candidate bytes, must not be staged or removed by the rebase preparation, and
are excluded from candidate and conflict accounting unless the PO later gives
separate authority.

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
2. Produce a fresh working-tree and untracked-file inventory. Obtain the
   explicit snapshot disposition; do not choose one automatically.
3. Rebase only the approved Nova snapshot onto the exact accepted baseline.
4. For every conflict, record the upstream path, Nova path, affected acceptance
   IDs, selected resolution, and whether the resolution changes Nova scope.
   An uncertain or protected conflict stops for PO review.
5. Regenerate the Spec/backlog/lifecycle bindings and compare the 16-Issue
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
| A7 | central Verify registration, clean candidate, Full Verify, Security and independent Critic | always fresh after the rebase; pre-rebase evidence cannot satisfy this row |

## Exit criteria for this dossier

This preparation is complete when the stable baseline has not been assumed,
the worktree disposition remains a PO decision, the exact snapshot is
inventoried, all protected conflicts fail closed, and the test/invalidation
matrix can be applied without redesign. It does not satisfy NVA-G13, accept
Nova A, activate Nova B or complete any Issue.
