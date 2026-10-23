# Counted pin results, 2026-10-23 (set e: recounts listed by the delivery remeasure)

Measured on commit `d2e9bd4e9` in a local clone (`scratch/clones/k85`), one test file after the other (never two at the same time), each run once with its own private TMPDIR outside every repository (spawn of `node <file>` with TMPDIR/TMP/TEMP set, 20 minute per-file cap). Other dispatches used the machine in the same window (a pin-restatement dispatch ran a few of its own pins and a read-only reader ran), so the machine was not idle. The one red file was re-run once alone and was green. Nothing was fixed or diagnosed beyond one line.

Source of the item list: the "Open per item" entries of `delivery-remeasure-2026-10-23/README.md` and `snapshot.json` that ask for a recount. Counts are copied from the node summary line of each run. A skipped or todo case is not a pass; a green row with skips or todos is counted green for the cases that ran.

Summary: 32 distinct test files run. 30 green on the first run, 1 red on the first run (`hgo-stale-capability-shadows-current-authorization`, green on the lone retry, so 31 green after retry), 1 timeout (`model-family-host-store.test.mjs`, 20 minute cap), 0 no suite found as a file (`critic-scratch-name-randomness-has-no-admitted-command` has no pin file of its own; its pin cases live in the notes pin, d760fcc6b). 1 file skipped as already counted (`rebind-approval.test.mjs`). 1 listed item left out on purpose (`installed-design-trailer-example-is-rejected-by-git-guard`, owned by another dispatch). Every other listed item has a row below with a counted green result or the skip pointer; `model-family-approval-with-automatic-version-upgrades` carries the timeout.

Paths are relative to `plugins/pipeline-core/`.

| Item | File | Result | Pass / fail / skip / todo (cases) | Secs | First failing case | Note |
|---|---|---|---|---|---|---|
| critic-scratch-name-randomness-has-no-admitted-command | `lib/pins/critic-scratch-notes-write-is-refused-again.test.mjs` | GREEN | 26 / 0 / 2 / 0 (28) | 35 | - | d760fcc6b put this item's pin cases into the notes pin; one run covers both items; the 2 skips are the typed host skips |
| critic-scratch-notes-write-is-refused-again | `lib/pins/critic-scratch-notes-write-is-refused-again.test.mjs` | GREEN | same run as above | 35 | - | counted after e454442ca (the CR-03 text change) |
| git-for-windows-2-56-rejects-git-config-global-nul; node-v24-on-windows-creates-a-real-nul-file | `lib/git-null-device-sites.test.mjs` | GREEN | 9 / 0 / 0 / 0 (9) | 1 | - | 9 cases after GND009 was added (was 8); real-git cases ran on this Linux git; Git for Windows 2.56 not run (native-host item) |
| guard-override-request-digest-drifts-after-arming | `lib/pins/guard-override-request-digest-drifts-after-arming.test.mjs` | GREEN | 9 / 0 / 0 / 0 (9) | 5 | - | HEAD includes f76a3eb42 |
| hgo-patch-preflight-before-signature | `lib/pins/hgo-patch-preflight-before-signature.test.mjs` | GREEN | 12 / 0 / 0 / 1 (13) | 3 | - | 13 tests with 1 todo (the C23 optional residual), as the item states |
| hgo-stale-capability-shadows-current-authorization | `lib/pins/hgo-stale-capability-shadows-current-authorization.test.mjs` | GREEN after retry | first run 7 / 1 / 0 / 0 (8), 8 s; lone retry 8 / 0 / 0 / 0 (8), 5 s | 8 / 5 | first run: `AC8: tool-input binding is still enforced per candidate (different input is not consumed)` | red on the first run, green on the lone retry; the first run overlapped with another dispatch's pin runs, so the first failure is probably load-induced; not diagnosed further |
| kernel-closure-check-masks-violations-after-the-first | `lib/pins/kernel-closure-check-masks-violations-after-the-first.test.mjs` | GREEN | 8 / 0 / 0 / 0 (8) | 8 | - | live-repository case measured on this HEAD |
| opus-critic-only-batched-for-architecture-and-security | `lib/pins/opus-critic-only-batched-for-architecture-and-security.test.mjs` | GREEN | 15 / 0 / 0 / 0 (15) | 0 | - | 15/15 again after the template and role copy changes |
| outside-root-read-label-skips-option-value-file-tokens | `lib/pins/outside-root-read-label-skips-option-value-file-tokens.test.mjs` | GREEN | 13 / 0 / 0 / 0 (13) | 1 | - | after 5b3990a37 |
| passive-read-policy-admits-uncovered-credential-files-and-rg-follow | `lib/pins/passive-read-policy-admits-uncovered-credential-files-and-rg-follow.test.mjs` | GREEN | 10 / 0 / 0 / 0 (10) | 1 | - | restated pin counted; native Windows and macOS branches are not run here |
| plan-submission-must-not-require-separate-po-approval | `lib/pins/plan-submission-must-not-require-separate-po-approval.test.mjs` | GREEN | 21 / 0 / 0 / 0 (21) | 7 | - | after 37060e4b4 and afee1a33d |
| powershell-bypasses-onboarding-read-boundary | `lib/pins/powershell-bypasses-onboarding-read-boundary.test.mjs` | GREEN | 6 / 0 / 0 / 0 (6) | 50 | - | outside-root refusal assertions hold after 5b3990a37 |
| read-blocks-and-misleading-denial-texts-across-runners | `lib/pins/read-blocks-and-misleading-denial-texts-across-runners.test.mjs` | GREEN | 16 / 0 / 1 / 1 (18) | 49 | - | 1 skip (the WSL UNC U3 case, typed Linux-host skip) and 1 todo remain, so M5/M6 strict is counted as stated by the summary, not claimed beyond it |
| read-only-guard-admits-execution-and-output-options | `lib/pins/read-only-guard-admits-execution-and-output-options.test.mjs` | GREEN | 73 / 0 / 1 / 0 (74) | 2 | - | the skip is the Windows drive-letter spelling clause (typed non-win32 skip) |
| shell-grammar-file-is-a-kernel-path-without-capability-placement | `lib/pins/shell-grammar-file-is-a-kernel-path-without-capability-placement.test.mjs` | GREEN | 8 / 0 / 0 / 0 (8) | 1 | - | AC-255 pin counted on this HEAD, after the kernel-path list changes |
| codex-bootstrap-in-the-typed-next-action | `lib/pins/codex-bootstrap-in-the-typed-next-action.test.mjs` | GREEN | 8 / 0 / 0 / 0 (8) | 1 | - | retargeted refuted-premise pin |
| codex-readiness-private-receipt-omits-output-custody | `lib/pins/codex-readiness-private-receipt-omits-output-custody.test.mjs` | GREEN | 11 / 0 / 0 / 0 (11) | 66 | - | includes the three cases of 99d477455 |
| design-phase-runs-critic-advisor-and-readiness-instead-of-one-review | `lib/pins/fitness-model-qualification-observed-at-implementation-boundary.test.mjs` | GREEN | 6 / 0 / 0 / 0 (6) | 1 | - | the AC-155 fitness-model qualification pin |
| design-phase-runs-critic-advisor-and-readiness-instead-of-one-review | `lib/pins/design-phase-runs-critic-advisor-and-readiness-instead-of-one-review.test.mjs` | GREEN | 23 / 0 / 0 / 0 (23) | 39 | - | the item's own pin, run as well |
| readiness-input-omits-current-advisor-observation | `lib/pins/readiness-input-omits-current-advisor-observation.test.mjs` | GREEN | 11 / 0 / 0 / 0 (11) | 151 | - | the extended pin (was 9/9 before a4c0b4dad and 59c3a756b) |
| readiness-input-omits-current-advisor-observation | `lib/design-workflow-package.test.mjs` | GREEN | 21 / 0 / 0 / 0 (21) | 1 | - | cited suite 1 of 2 |
| readiness-input-omits-current-advisor-observation | `lib/pins/design-workflow-package-omits-contract.test.mjs` | GREEN | 17 / 0 / 0 / 0 (17) | 1 | - | cited suite 2 of 2 |
| revised-native-design-cannot-reach-a-new-advisor-course | `lib/pins/revised-native-design-cannot-reach-a-new-advisor-course.test.mjs` | GREEN | 10 / 0 / 0 / 0 (10) | 38 | - | the pin extended by b02abaa78 (baseline was 7/7) |
| role-route-preflight-with-self-dispatch-fallback | `lib/pins/role-route-preflight-with-self-dispatch-fallback.test.mjs` | GREEN | 25 / 0 / 0 / 0 (25) | 4 | - | after dd8845e39 and aa9b85443 |
| role-route-preflight-with-self-dispatch-fallback | `lib/role-route-preflight.test.mjs` | GREEN | 18 / 0 / 0 / 0 (18) | 0 | - | library sibling of the pin |
| role-route-preflight-with-self-dispatch-fallback | `scripts/dispatch-recovery.test.mjs` | GREEN | 8 / 0 / 0 / 0 (8) | 7 | - | dispatch-recovery suite 1 of 2 |
| role-route-preflight-with-self-dispatch-fallback | `scripts/dispatch-recovery-admission.test.mjs` | GREEN | 2 / 0 / 0 / 0 (2) | 1 | - | dispatch-recovery suite 2 of 2 |
| agy-driver-dispatch-and-design-routes-incomplete | `lib/pins/agy-driver-dispatch-and-design-routes-incomplete.test.mjs` | GREEN | 14 / 0 / 0 / 0 (14) | 21 | - | counted serial run after d80719e5f |
| approval-bound-design-package-lives-in-an-ignored-directory | `scripts/rebind-approval.test.mjs` | SKIPPED, already counted | 9 pass, 0 fail, 0 skip, 1 todo (10) | - | - | counted GREEN on `abb58235e` in `pin-counted-results-2026-10-23-b.md`; `git log abb58235e..HEAD` for `scripts/rebind-approval.test.mjs`, `scripts/rebind-approval.mjs` and `lib/rebind-approval.mjs` is empty, so unchanged since; the todo case is the open fixture-clone case named by the item |
| approval-bound-design-package-lives-in-an-ignored-directory | `lib/pins/approval-bound-design-package-lives-in-an-ignored-directory.test.mjs` | GREEN | 11 / 0 / 0 / 0 (11) | 4 | - | the item's own pin, run as well (extra, not required by the skip rule) |
| disjoint-signed-hgo-actions-invalidate-one-another | `lib/human-guard-override-disjoint.test.mjs` | GREEN | 35 / 0 / 0 / 0 (35) | 33 | - | serial recount on this HEAD |
| disjoint-signed-hgo-actions-invalidate-one-another | `lib/human-guard-override-disjoint-isolation.test.mjs` | GREEN | 38 / 0 / 0 / 0 (38) | 50 | - | the two documented diagnostic gaps are not todo cases in this run (0 todo) |
| implementation-without-dispatch-escapes-review-coverage | `lib/pins/implementation-without-dispatch-escapes-review-coverage.test.mjs` | GREEN | 13 / 0 / 0 / 0 (13) | 2 | - | the item text with its acceptance section is still to be created (agent open entry, not a pin matter) |
| model-family-approval-with-automatic-version-upgrades | `lib/model-family-host-store.test.mjs` | TIMEOUT | no node summary (killed by SIGTERM at the cap); MFHS001-MFHS018 printed as passing (18 pass, 0 fail) before the kill | 1200 | none printed | MFHS023 and MFHS028 (the real-process cases reported red in `pin-counted-results-2026-10-23.md`) were not reached within 20 minutes, so their state is NOT re-measured here. The earlier run needed about 32 minutes for the whole file, longer than the cap. No retry: a retry under the same cap ends at the same point. Needs a run with a cap above 32 minutes, or a split of the file |

## Left out on purpose

| Item | Reason |
|---|---|
| installed-design-trailer-example-is-rejected-by-git-guard | Named in the briefing of the other dispatch that edits its pin at the same time; its pin was not run here. |

## Long run of the model-family host-store suite

One serial run of `lib/model-family-host-store.test.mjs` alone, with a per-file cap of 60 minutes (the 20-minute cap of the row above ended before MFHS023 and MFHS028). Machine quiet, private TMPDIR outside every repository, no retry (the file finished well inside the cap and the result is not load-shaped).

| Measure | Value |
|---|---|
| Result | RED (the process exit code is non-zero) |
| Exit code | 1 (signal: none; not a timeout) |
| Duration | 1864 s (about 31 minutes) |
| Node summary | tests 32, pass 30, fail 0, cancelled 0, skipped 0, todo 2 |
| Cases that did not pass | MFHS023, MFHS028 (both printed as `# TODO` warnings in the node summary and listed under "failing tests"; node counts them as todo, not as fail) |
| Passing cases | all 30 others, including MFHS001 to MFHS022, MFHS024 to MFHS027 and MFHS029 to MFHS032 |

First error line per case, as printed in the log (machine-specific path prefixes replaced by `<fixture>`):

| Case | First error line |
|---|---|
| MFHS023 real competing transition and prepare serialize on the stored generation | `Error: ENOENT: no such file or directory, lstat '<fixture>/.git/agent-pipeline/model-family-host/authority-lifetimes/<digest>.json'` (the log also prints, after the test ended, an unhandled-rejection notice carrying `successor transition process failed (1)` with `SessionAuthorityError: model-family-host:unowned-retained-member`) |
| MFHS028 real process contention serializes same-key replay and different invocation CAS generations | `Error: concurrent writer failed (1)` carrying the child's `SessionAuthorityError: model-family-host:unowned-retained-member` (`SDC-AUTHORITY-UNAVAILABLE`) |

Not diagnosed here, as briefed. Both cases fail in the real-process (child process) steps, which agrees with PO list row 5 (cross-process ownership problem, after 0.7.0). The log is `scratch/agent-out/k90-model-family-host-store.test.mjs.log` in the dispatching checkout (untracked).
