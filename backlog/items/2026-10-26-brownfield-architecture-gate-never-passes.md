---
schema: pipeline.backlog-item.v1
id: pipeline.brownfield-architecture-gate-never-passes
type: defect
owner: pipeline
status: open
created: 2026-10-26
priority: P0
release: 0.7.0
sprint: alfred
source: "PO relay of a consumer handover (Toolbox, Windows), 2026-10-26, on the D163 hotfix candidate; full handover with code sites, fix proposals and a regression test is on the PO's Windows machine at D:/Dev/Web/Toolbox/scratch/defekt-uebergabe-architektur-gate.md (not yet in this repository)"
done_when: manual
---

# A brownfield project never reaches implementation: the architecture gate cannot pass (D1-D5)

The consumer agent derived these from the plugin code; it could not run the check scripts because the
Pipeline refuses them in that phase (itself D3). Interim-candidate priority (D165). Likely interaction with the
D162 patches applied in the D163 hotfix (the deferral allowance was removed).

## D1 (blocks everything)

- Fitness class 10 always reports unavailable in `architecture-fitness.mjs`, so the overall result is at best
  unavailable, never passed.
- The guard (`lib/guard/entry-gates.mjs`, `architectureFitnessAuthorityVerdict`) admits only passed or an
  exception. The only remaining exception covers freshly created projects with a design package; the earlier
  exception for deferred projects was removed by the update.
- Contradiction in the plugin: the library treats class 10 elsewhere (`projectPlanningFitness`) as report-only;
  the guard does not use that evaluation.
- Proposed fix: the guard adopts the same evaluation or relies on `inspectArchitectureEntryReadiness`.

## D2 (blocks after D1)

- The proposed conversion deferred -> approved-scoped keeps only the old scope (CLAUDE.md, config, docs, lib,
  specs). Fitness class 9 additionally requires `architecture/map`, `project/pipeline.json` and
  `pipeline.user.yaml`; when missing, class 9 reports unavailable, which now also blocks.
- Open question: does a hand-written map count as measured baseline, or must `architecture-measure.mjs` run?

## D3 (contradiction)

The preflight recommends `architecture-adoption.mjs propose` as next step; the guard refuses exactly that
command in phases draft and approved.

## D4 (wrong order)

The architecture hurdles surface only after the PO's plan signature; it cost two extra signatures and reopened
the plan. The trust anchor behaved the same way.

## D5 (no write route)

The agent may not write `architecture/` or `AGENTS.md` in any phase although implementation requires them; the
PO had to copy the map into place by hand (Copy-Item).

## Second Toolbox handover (build 0.7.0+claude.20261026152532.b8a2ec6, 2026-10-26)

The consumer re-ran the gates on the hotfix build; the three handover files are distilled here and in the items named
below (the German originals stay on the consumer machine).

| ID | Consumer status on that build | Status in this repository |
|---|---|---|
| D1 | fixed (`lib/guard/entry-gates.mjs:181-187` evaluates `planningFitnessBlockingStatus`) | applied; the consumer's idea of a regression test remains useful |
| D2 | open: scope had to be extended by hand (`architecture/map`, `project/pipeline.json`, `pipeline.user.yaml`) | `D165-S3` scope union applied in `1bcce7add` |
| D3 | open: `propose` refused as `GUARD-DEVPLAN-SHELL` | `D165-S1` applied (propose, status, check, prepare, measure, fitness); `materialize-architecture` and the Phoenix wrapper remain, see `pipeline.draft-guard-blocks-the-sanctioned-recovery-wrappers` |
| D4 | open, aggravated: more gates (D8, D9) first appear at `set-phase implementation` | `D165-S4` held patch, not applied (turns ten fixture suites red, scope decision pending) |
| D5 | open: map written via `scratch/` and `Copy-Item` | `D165-S2` Edit/Write parity applied |

New gates found behind D1-D5: D8 (`pipeline.missing-docs-adr-directory-blocks-implementation-entry`), D9
(`pipeline.fitness-class-6-blocks-documentation-modules-without-a-verification-entry`), D10 (`prepare` without
`--decided-at` throws a TypeError, in `pipeline.toolbox-session-friction-and-feature-wishes`). The consumer build
predates S1-S3 and S5; each row above needs a live confirmation on the installed candidate.

## Windows side findings

- After the confirmation prompt of a `...ry.mjs` script one input line is swallowed (name cut off in the paste).
- `release-lock` reports `EPERM fsync` but releases the lock anyway (cf. matrix row
  `pipeline.greenfield.r2.windows-lock-release-postcondition`).
- Ctrl+C during `apply` leaves a lock file behind.
