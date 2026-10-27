# W7 fixture repair c: real submit-plan fixtures get a ready architecture readiness (PARTIAL: 2 of 3 files repaired)

Patch: `w7-fixture-submit-plan-architecture-c.patch` (git diff --binary against a local "bundle stack base" commit; apply order: `scratch/agent-out/compose/bundle.patch` first, this patch second). `git apply --check` of this patch in a clone at the candidate with the bundle applied: exit 0.

## Cause (re-verified)
With the bundle, submit-plan refuses a governed root without a ready architecture (ARCHITECTURE-MAP-MISSING) before the case body runs. The fixtures ran the real submit-plan on a root with no map.

## RED (clone, bundle base; logs `scratch/agent-out/w7fc/red.*.log`)
- check-state-phase-consistency: 1 failing, "the marker stays atomic with a real design -> implementation transition" (submit-plan exit 2, ARCHITECTURE-MAP-MISSING).
- pipeline-state-rebind-runner: 5 failing: the four `submit-plan ...` cases (exemption, modified non-exempt bytes, independent feature authority, mini) and "inspect exposes one typed PO approval action ...".
- design-approval-route.e2e: 8 failing (DABC001, DABR001-004, DABV001, DABX001, DABX002), first failure text "fixture submit-plan --profile feature failed: ... ARCHITECTURE-MAP-MISSING".

## Change (shape per file; only fixtures, no assertion or case touched, +5 lines)
- check-state-phase-consistency.test.mjs, `lifecycleDeps` (in-process run): added `architectureEntryReadiness: () => ({ status: "ready", code: null, nextAction: null })` — shape (a), exact stub of D165-S4's planAuthorityFixture.
- pipeline-state-rebind-runner.test.mjs, `generatorSubmitFixture` deps: same line — shape (a).
- design-approval-route.e2e.test.mjs (spawns the real CLI): import `materializeArchitectureDesignFixture` and call it in `buildSubmittedFeature` right after the "finished design sources" commit (planPath PLAN_PATH, sourcePath src/index.mjs, decisionRef TEST-DAR-ROUTE) — shape (b).

## GREEN (read by the Elephant from `scratch/agent-out/w7fc/green.*.log` after the Goldfish budget ended)
- check-state-phase-consistency: 3 of 3 pass (clean candidate 3 of 3; composed before repair 2 of 3). REPAIRED.
- pipeline-state-rebind-runner: 18 of 18 pass (clean candidate 18 of 18; composed before repair 13 of 18). REPAIRED.
- design-approval-route.e2e: 10 of 14 pass, 4 fail (clean candidate 14 of 14; composed before repair 6 of 14). PARTIAL. Failing: DABC001, DABR002, DABR003, DABR004. DABR002-004 fail at `approve-plan` with `CAC-SOURCE-UNAVAILABLE` ("serialized state write failed before commit; zero mutation"), which points at shape (b): `materializeArchitectureDesignFixture` leaves the fixture root with uncommitted architecture or policy files, so the approval source is unavailable. The follow-up slice commits the helper's output inside the fixture (or places the call before the "finished design sources" commit) and re-checks DABC001.
Apply check (Goldfish `driver check`, bundle applied in clone2, then this patch): exit 0. Clean-candidate failing-name sets for the three files (clone2) were not run; the clean-candidate counts above come from the isolated-worker run of the Elephant.

## Not done
design-approval-route.e2e back to 14 of 14 (the follow-up slice, which also covers `hooks/design-course-command-admission.test.mjs` for repair b). Cleanup of the scratch clones under `scratch/agent-out/w7fc/`.

## Proposed commit message
test(fixtures): give the real submit-plan fixtures a ready architecture readiness (composed-stack repair c)

## Operator flow
apply-diff (bundle first), `git add -u` with a path limit, `--no-verify` commit, stamp, install. Independent Critic review stays a parent-owned batch gate.
