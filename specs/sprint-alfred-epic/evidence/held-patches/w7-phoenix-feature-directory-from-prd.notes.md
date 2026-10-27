# Held patch notes: the PO gate derives the feature directory from the authority PRD path

Dispatch W7-PHOENIX-FEATURE-DIRECTORY-FROM-PRD-C1-20261027. Candidate b0bd45e2d489a99f8266d90fa8a3d7caafd05617.
Patch: `w7-phoenix-feature-directory-from-prd.patch` (git diff --binary vs the candidate; 2 files, +90/-7; `git apply --check` in an unchanged second clone at the candidate: exit 0).

Proposed commit message: `fix(po-gate): derive the feature directory from the authority PRD path after a revision`

## Cause (re-verified in the clone, recon lines confirmed)
`prdAuthority` in `plugins/pipeline-core/lib/po-gate-authority.mjs` derived `featureDirectory` from `active.planPath` (line 857), compared the sole PRD to `active.planPath` (PLAN-PATH-MISMATCH, ~895) and read `active.planPath` (~905). After a Phoenix revision to a new folder, `continuity.authority.prd.path` points into the new folder and `activeFeature.planPath` still into the old one, so submit-plan failed (cardinality 0 in the old folder) and only discard-feature helped.

## Change
- `activeFeatureState`: also returns `authorityPrdPath` = normalized `continuity.authority.prd.path` when it starts with `specs/` and its basename matches `prd_*.md`; else `null`.
- `prdAuthority`: `boundPlanPath = authorityPrdPath ?? planPath`; the directory, the cardinality message, the mismatch comparison and the PRD read use `boundPlanPath`. Evidence `planPath` reports `authorityPrdPath ?? planPath`.
- No state-machine, Phoenix wrapper or other file change was needed.

## Cases (test file, ids W7-1..W7-4, one `check` "W7 ...")
- RED on the unchanged clone (log `red.po-gate-authority.test.mjs.log`): W7-1 and W7-2 not ok; W7-3 and W7-4 passed already (regression guards, not discriminating).
- GREEN patched: all four ok; `po-gate-authority: 72 checks passed` (baseline: 71).
- W7-1 revise to new folder passes (planPath old, PRD path and file in new folder; evidence planPath/specPath are the new folder).
- W7-2 plan file stays only in the old folder: refused. Sub-case 1 (derived folder holds no PRD) is `PO-GATE-PRD-CARDINALITY`, not the briefed MISMATCH, because the existing cardinality check fires first. Sub-case 2 (derived folder holds a differently named sole PRD) gives `PO-GATE-PLAN-PATH-MISMATCH`. The refusal intent is kept; the code differs for sub-case 1.
- W7-3 no authority PRD path: identical to today. W7-4 PRD path outside `specs/`: not trusted, falls back to planPath (the prior behaviour).

## Baseline vs patched failing sets
Whole `po-gate-authority.test.mjs`: both clone2 (baseline) and clone (patched) end with the same pre-existing trailing line `Error: approve-plan blocked by PO-PROFILE-RECEIPT-STALE ...` after the last ok check (fixture/environment related, identical in both). No other `not ok`. Failing-name sets identical apart from the new W7 cases.

## NOT done
- Importing suites: `project-onboarding-v3.test.mjs` and `onboarding-continuity.test.mjs` were started in both clones, logs in scratch, but their results were NOT compared (budget). About 30 test files import the module; most only use `derivePoGateRepositoryFingerprint` / `resolvePoGateRepositoryTopology` (unaffected); the `pins/*` files with `import * as po` were not run.
- Flag for the batch Critic: the MISMATCH leading sentence (pinned by D171-5) still says "activeFeature.planPath" though the compared value is now the authority path; evidence `planPath` now reports the new-folder path to downstream consumers (approval snapshot, device rebind).
- Independent Critic review stays a parent-owned batch gate; Full Verify and PO acceptance pending.

## Operator flow
Apply the diff (`git apply`), `git add -u` with a path limit to the two files, `--no-verify` commit, stamp, install.

## Protected-path classification
`po-gate-authority.test.mjs` matches none of TP-1..TP-13; `po-gate-authority.mjs` is a plugin kernel path, hence a held patch. The repository tree under plugins/ was not edited; the test file has no in-repo diff.
