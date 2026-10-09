# E2E-ONB-A: onboarding and design-chain suites on WSL (interim, partial)

Slice E2E-ONB-A-20261009, candidate `3f7708289400d67577c46d0eb0e87ff0b71b8e8f`. Measure only. Status: PARTIAL, budget
checkpoint reached. Captures are `evidence/E2E-ONB-A-20261009/<dir>-<file>.txt` (written by `capture-evidence.mjs`, one per file, 100 s cap each,
`node --test --test-timeout=90000`, run from `<repo-root-in-wsl>` under `bash -lc`). 53 files match the briefed finds (26 in `scripts/`, 27 in `lib/`).

## Table (15 files measured; first 15 in the driver's order)

| File | tests | pass | fail | skip | note |
|---|---|---|---|---|---|
| scripts/clone-hook-readiness.partial | 8 | 8 | 0 | 0 | |
| scripts/clone-hook-readiness.rollback | - | - | - | - | TIMEOUT at 100 s (rc 124), no summary; finding, not yet analysed |
| scripts/clone-hook-readiness | 1 | 1 | 0 | 0 | |
| scripts/codex-design-readiness-bootstrap | 6 | 6 | 0 | 0 | |
| scripts/codex-design-readiness-host | 10 | 10 | 0 | 0 | |
| scripts/codex-readiness-app-server | 3 | 3 | 0 | 0 | |
| scripts/design-course-coordinator | 1 | 1 | 0 | 0 | |
| scripts/design-course-session | 9 | 9 | 0 | 0 | |
| scripts/design-readiness-course.e2e | 1 | 1 | 0 | 0 | |
| scripts/design-workflow-signing-default | 5 | 0 | 5 | 0 | RED, see below |
| scripts/onboarding-consent-mark | 1 | 1 | 0 | 0 | |
| scripts/onboarding-init | - | - | - | - | TIMEOUT at 100 s (rc 124); briefed known red (TR-S1 key-copy pin) cannot be confirmed by a summary, the run did not finish in 100 s |
| scripts/onboarding-runner-identity | - | - | - | - | TIMEOUT at 100 s (rc 124) |
| scripts/pipeline-start-preflight-antigravity-hard-enforcement | 23 | 19 | 4 | 0 | RED, 4 failures not yet classified |
| scripts/pipeline-start-preflight-enforcement | 20 | 19 | 0 | 0 | counts do not add up (tests 20, pass 19, fail 0, cancelled 0, skipped 0): one test unaccounted, look at the capture |

## Reds

1. `design-workflow-signing-default.test.mjs`: RC21C001 to RC21C005 all fail with `Error: DRHS-UNSAFE-DIRECTORY`, thrown from the
   `fixture` helper at `design-workflow-signing-default.test.mjs:53`. Same cause in all five. Test fault vs product fault: NOT classified
   (the product line that throws `DRHS-UNSAFE-DIRECTORY` was not located). Hypothesis only: a directory-mode/ownership check on a WSL
   `/mnt` (drvfs) tree. Proposed slice: F (investigate), write set `plugins/pipeline-core/lib/design-readiness-host-*` plus the test fixture.
2. `pipeline-start-preflight-antigravity-hard-enforcement.test.mjs`: 4 of 23 fail; names and lines not extracted (open, see capture).
3. Three timeouts (`clone-hook-readiness.rollback`, `onboarding-init`, `onboarding-runner-identity`): no summary line, so no pass/fail counts.
   Possible causes: slow drvfs I/O or a real hang; not distinguished. Re-run each alone with a larger cap.

## Not yet measured (38 files)

Driver `scratch/e2e-onb-a-driver.sh` (untracked, scratch) was still running in the background when this was written; it continues
writing captures for the remaining files. Remaining list, in driver order: scripts/pipeline-start-preflight-pre-push-observation,
.path-spelling, .session-intent, pipeline-start-preflight, project-onboarding-e2e, project-onboarding-v3-argv-closure,
project-onboarding-v3-pre-push-hook-offer, project-onboarding-v3-unborn-head, resume-hint, runner-design-readiness-bootstrap,
spec-readiness-host; and all 27 files under `plugins/pipeline-core/lib` matching the finds (architecture-entry-readiness through
security-readiness). The LE language case (LE-F2) was not reached.

## Next dispatch needs

Read the driver's summary output (or its captures that exist under `evidence/E2E-ONB-A-20261009/`), classify the 4 antigravity reds and the
3 timeouts, locate the `DRHS-UNSAFE-DIRECTORY` throw site, and append the rows above. Brief a cap of 100 s as too small for 3 files; use 300 s.
