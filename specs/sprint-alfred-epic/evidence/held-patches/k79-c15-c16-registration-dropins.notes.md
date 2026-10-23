# K79 notes (K79-K7-REGISTRATION-DROPINS)

Status: implementation complete in clone; independent Critic read, operator commit of the protected parts and PO acceptance pending.
Base: main HEAD 977903ac7. Diffs apply with `git apply -p1` from the repo root; `git apply --check` of all three is clean from the main checkout.

## Diffs
- `scratch/agent-out/k79-c15-verify.diff` (C15, `harness/scripts/verify.mjs`, 14 lines changed)
  - caseIds: `commit-message-policy-tests` + CMP040; `guard-testpath-tests` + TPC019-TPC021; `model-role-host-store-tests` + MRSR06-MRSR08; `windows-private-state-tests` + WPS014-WPS016; `commit-msg-hook-install-tests` + CMI023.
  - K1R: `import { userInfo } from "node:os"`, `import { repairAddressRootQuietly }` from `lib/session-power-address-repair.mjs`, and one `console.error` diagnostic line (`VERIFY-ADDRESS-REPAIR-BEFORE` / `-AFTER`, result only printed) around `runVerifyJournal(`. Same four edits as `scratch/c15/make-dropin.mjs`, re-applied to the HEAD base.
- `scratch/agent-out/k79-c16-verify-suites.diff` (C16, `harness/verify-suites.json`, +6 lines at the array end)
  - registers `run-parallel-tests` -> `scripts/run-parallel.test.mjs` (the only unregistered test file of the content work; PO list row 11b). The registry admits it: `file` is any non-empty string, verify.mjs joins it to the repo root. The registration checker scans only `harness` and `plugins/pipeline-core`, so it neither requires nor rejects this entry.
- `scratch/agent-out/k79-c16b-inventory-surface.diff` (NOT in the briefing's two-file scope; a third protected file, offered, not required to be used)
  - `docs/product-capability-inventory.json`: one surface line `verify-phase:harness/scripts/verify.mjs:run-parallel-tests` in capability `deterministic-verification`, sorted after `run-codex-isolation-control-decomposition-tests`.

## C16 finding: most of the C16 row is already committed
At HEAD the three named files (`resume-hint-inspect-...`, `session-cleanup-lost-binding`, `session-power-address-repair`) and every other added `*.test.mjs` since `c1771bc98` (dispatch-model, dispatch-record-liveness is in verify.mjs line 815, read-command-diagnosis, onboarding-init-intake-author, authority-restore, git-cmd-push-classifier, guard-git-gg22, the pins, ...) are ALREADY in `harness/verify-suites.json`. Only `scripts/run-parallel.test.mjs` was missing.

## Case ids and where verified (each suite run ALONE, directly, on this machine under a private TMPDIR; helper `scratch/k79-case-scan.mjs`)
- commit-message-policy-tests: declared 39, executed 40, undeclared CMP040 (test file: 40 `check(` calls).
- guard-testpath-tests: declared 18, executed 21, undeclared TPC019, TPC020, TPC021.
- model-role-host-store-tests: declared 5, executed 8, undeclared MRSR06-MRSR08.
- commit-msg-hook-install-tests: declared 22, executed 23, undeclared CMI023 (test file: 21 top-level `test(` + a 2-entry loop).
- windows-private-state-tests: file has 16 `check(` calls = WPS001-WPS016. On Linux 12 run green; WPS013 (`invoke()` mode skip) and WPS014-WPS016 (`context.skip`, win32-only) are skips, so the scan shows WPS013 "missing"; the registered list keeps WPS013 and adds WPS014-016 by the static count (the Windows host executes them). Not measured on Windows.
- All five suites exit 0.

## Checker results (each run alone)
- `node --check harness/scripts/verify.mjs`: exit 0 after the change.
- `node harness/scripts/check-verify-suite-registration.mjs`: before (HEAD) "1084 registered, 0 unregistered"; with only the verify-suites.json entry: exit 2, `UNCATEGORIZED-VERIFY-SURFACE "run-parallel-tests"` (needs the inventory line); with entry plus inventory line: "1085 registered, 0 unregistered".
- `node harness/scripts/check-product-capability-inventory.mjs`: before PASS; with the inventory line but the old `sourceBaseline` it is FAIL (`references missing surface ... run-parallel-tests in committed sourceBaseline 85d46b82...`). The documented order (docs/operating-tools.md): operator commits verify-suites.json (and verify.mjs), THEN runs `node scripts/rebaseline-inventory.mjs`, then commits the inventory including the new surface line. Not run as a commit.
- `scripts/run-parallel.test.mjs` run alone: 5 of 5 green (exit 0).

## Not done / open
- Broad case-drift scan of all other inline-registered suites was not run (tool budget). The scanner is ready: `node scratch/k79-case-scan.mjs scratch/clones/<name> all [comma-separated name substrings]` (the five above took about 2 minutes together; the whole set is heavy, run alone). The `case-drift` group of the earlier Full Verify (`fv-c1771bc98-groups-2.md`: native-goldfish-host-return, antigravity-topology-refresh-host, project-uninstall, model-family-runtime-host, design-course-session) is not covered by this diff; those five carry JSON/augmentation registrations and were not re-measured.
- The clone tree is NOT reverted: 3 tracked files carry the edits (reverting 14 hunks by Edit exceeded the budget). The clone is throwaway; the diffs above are the deliverable.

## Proposed commit messages (operator)
1. `test(verify): register the added cases of five suites and diagnose the address root around the Verify run`
   Body: CMP040, TPC019-TPC021, MRSR06-MRSR08, WPS014-WPS016, CMI023 added to the inline caseIds (Full Verify case-drift, C15); K1R diagnostics repairAddressRootQuietly before and after runVerifyJournal (D71/D72).
   Trailers: `AI-Assisted: true` / `Dispatch: K79-K7-REGISTRATION-DROPINS (goldfish)`
2. `test(verify): register the run-parallel suite` (verify-suites.json + the inventory surface line; then `node scripts/rebaseline-inventory.mjs` and a follow-up `chore(inventory): move the sourceBaseline after the run-parallel registration`)
   Trailers: same two lines.
