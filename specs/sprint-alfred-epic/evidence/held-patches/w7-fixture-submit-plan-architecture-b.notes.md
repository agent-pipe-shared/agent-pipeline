# W7 held patch: real-submit-plan test fixtures get a ready architecture readiness (composed-stack repair b) - PARTIAL

Patch: `w7-fixture-submit-plan-architecture-b.patch` (git diff --binary against a local "bundle stack base" commit = candidate 285357503 + `scratch/agent-out/compose/bundle.patch`). Apply order: bundle first, this patch second. `git apply --check` passed in a second clone at the candidate after applying the bundle (exit 0).

Status: 2 of 3 files repaired; the third (design-course-run-v2) is BLOCKED, it needs files outside this slice.

## Cause (re-verified)
D165-S4 makes `submit-plan` refuse a governed root whose architecture is not ready (ARCHITECTURE-MAP-MISSING). The fixtures below run the real in-process `run([... "submit-plan" ...], deps)` on a root without an architecture map, so the case body never runs.

## Changes (shape a: dependency stub, copied from `planAuthorityFixture` in scripts/pipeline-state.test.mjs)
Added `architectureEntryReadiness: () => ({ status: "ready", code: null, nextAction: null })` to the deps of the submit-plan call only:
- `plugins/pipeline-core/lib/pins/approval-bound-design-package-lives-in-an-ignored-directory.test.mjs` (routeFixture `drive(["submit-plan", ...], {...})`, 1 line).
- `plugins/pipeline-core/lib/po-gate-authority.test.mjs` (`submitFixturePlan`, 1 line).
No assertion changed, no case added, skipped or deleted.

## Counts
- approval-bound-design-package: clean candidate 11/11; composed RED 4 failing (the four AC-113 present-plan cases: submit-plan blocked by ARCHITECTURE-MAP-MISSING); composed + patch 11/11 (exit 0).
- po-gate-authority: clean candidate exit 0, `71 checks passed`; composed RED exit 1 (submitFixturePlan, `2 !== 0`); composed + patch exit 0, `71 checks passed`.
- design-course-run-v2: clean candidate exit 0 (10 of 10 by the briefing; log tail not a summary line); composed RED exit 1, failing A6 and A10 (8 of 10). NOT repaired.
- Baseline vs patched failing-name sets: both empty for the two repaired files; no pre-existing red case.

## BLOCKED: design-course-run-v2-refuses-its-own-documented-routes
Both red cases get their failing submit-plan outside this file:
- A10 calls `fixture()` exported from `plugins/pipeline-core/hooks/design-course-command-admission.test.mjs` (line 34-83), which runs in-process `run(['submit-plan', ...], deps)` at line 69 with the deps at lines 64-68.
- A6 spawns `plugins/pipeline-core/scripts/design-approval-route.e2e.test.mjs`, whose fixture runs the real CLI submit-plan at line 525 (a real script spawn, shape b).
Exact changes needed (not made, out of scope): (1) in design-course-command-admission.test.mjs add `architectureEntryReadiness: () => ({ status: 'ready', code: null, nextAction: null })` to the `deps` object (line 64-68); (2) in design-approval-route.e2e.test.mjs give the fixture root a valid architecture map via `materializeArchitectureDesignFixture` before line 525. Needs a follow-up slice that lists those two files. Not verified that these two changes alone make A6/A10 green.

## Not done
Independent Critic review (parent-owned batch gate), Full Verify, PO acceptance, the design-course file repair above.

## Proposed commit message
`test(fixtures): give the real submit-plan fixtures a ready architecture readiness (composed-stack repair b)`

## Operator flow
Apply the bundle, then `git apply` this patch, `git add -u` with a path limit, commit with `--no-verify`, stamp, install.
