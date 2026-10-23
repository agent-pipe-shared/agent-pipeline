# Count-pass suite list (K110)

`count-pass-suites.json` is the input of `scripts/sitting-count-pass.mjs` (see `docs/operating-tools.md`, "Serial count pass"). It covers the 55 rows of `evidence/delivery-remeasure-2026-10-23/snapshot.json` that carry an open entry owned by `agent` or `verify-wsl`, plus the suites that the notes in `evidence/held-patches/` name as counted.

120 entries: 69 serve at least one of the 55 rows (`items`), 47 are held-patch suites only (empty `items`, `why` names the notes), 4 are unresolved (`command: null`, never run). Entries are de-duplicated by suite file; the id is the file name without `.test.mjs`. Order: cheap suites first (by the seconds of an earlier counted run where one is on record, otherwise by name), the four heavy suites last, the unresolved entries at the end.

Resolution rule for a row: its own pin `plugins/pipeline-core/lib/pins/<slug>.test.mjs` (all pins named by a row exist under the full slug), plus the suites its `open.what` or backlog text names. `why` carries the open sentence(s) verbatim, tagged `[agent]` or `[verify-wsl]`. Read `why` before trusting a green: for rows whose open clause asks to build, restate or document something, a counted pin run is the evidence gap only if that work is committed first.

## Heavy suites (run alone, last)

| Id | Known runtime | Note |
|---|---|---|
| `onboarding-continuity` | 642 s | long suite |
| `onboarding-init` (`scripts/onboarding-init.test.mjs`) | 368.5 s (item text, 2026-09-29) | unsplit greenfield matrix, the baseline of `onboarding-init-greenfield-matrix-is-serial-and-slow` |
| `onboarding-init-greenfield-matrix-is-serial-and-slow` (pin) | unknown | split cases; compare the wall time with the 368.5 s baseline |
| `project-onboarding-v3` | 15 to 30 min | the original onboarding controller (184 cases in four shards, 216 cases with eight workers); run as `node <file>` (not `--test`), `expect.minPass` 216; serves `nongit-retirement-reader-calls-inaccessible-controller-helper`, `retirement-reader-masks-typed-unsafe-layout-inspection`, `onboarding-test-runner-reports-async-pass-before-settlement` and `git-hook-runtime-snapshot-omits-protected-baseline-catalog`; give it `--timeout-ms 3600000` |

Other suites may be slow without a recorded runtime (guard-lifecycle-ready, guard-dispatch, antigravity-pretool-guard, slice-queue); the runner's per-suite cap and `--resume` cover that.

## Unresolved (command null)

| Id | Row | Reason |
|---|---|---|
| `forensics-and-audit-evidence-not-reconstructable` | same | the open clause asks to BUILD the continuity digest drift, Verify contract and audit index with a pin; no pin or suite exists |
| `greenfield-comparisons-need-reproducible-public-evidence` | same | implementation and pin do not exist; deferred past 0.7.0 |
| `git-hook-runtime-snapshot-full-verify` | `git-hook-runtime-snapshot-omits-protected-baseline-catalog` | Full Verify and the candidate-bound closure checks are an operator step, not a suite file (its three suites are in the list) |
| `domain-scanner-real-gitleaks-reproduction` | `domain-scanner-findings-need-reproduction-before-remedy` | the real gitleaks historical reproduction is a manual WSL run with the real binary; the pin uses a fake scanner (the pin is in the list) |

## Not suite counts (the list cannot close these)

Several rows ask for work, not a count: `bounded-reader-terminal-binding` (the 2+1 Reader course), `elephant-main-context-spent-on-wake-ups-and-inline-reads`, `implementation-without-dispatch-escapes-review-coverage` (write the item text), `model-family-approval-with-automatic-version-upgrades` (fix or restate MFHS023 and MFHS028), `lifecycle-read-scope-blocks-host-declared-system-skill` (deferred, closed duplicate), `foreign-worktree-closes-the-implementation-gate` (needs a WSL host with a writable DrvFs mount). Their entries count the pin so a result exists once the work is done; a green run alone does not satisfy the open clause.

## Counts the open entries state

`expect.minPass` is set only where an open entry states the count: `goldfish-budgets-omit-the-closing-ceremony` 7, `feature-branch-push-admitted-without-signature-approval` 16, `dispatch-record-log-stays-empty-despite-mandatory-phase-entries` 31, `hgo-patch-preflight-before-signature` 12 (13 cases, 1 todo), `project-onboarding-v3` 216. Everything else is `null`.

The list was not run; the runner was smoke-run on its fixture suites and on one cheap real suite (`node-v24-on-windows-creates-a-real-nul-file`, 14 of 14).
