# K108-SITTING-REHEARSAL-2 notes (clone scratch/clones/k108, base main e46b4b0cb, final clone HEAD e18789b6f)

Implementation complete in clone; independent Critic read, operator commit of the protected parts and PO acceptance pending.
Main checkout touched only under `scratch/` and `scratch/agent-out/`. Helpers: `scratch/k108-*.mjs`. Raw data: `k108-status.jsonl`, `k108-results.txt`, `k108-final-*.log`, `k108-growth.txt`.
Every step is ONE commit through the clone's real pre-commit and commit-msg hooks (Node execFileSync helper); none refused. Trailers `AI-Assisted: true` + `Dispatch: stage-0 (elephant)`.

## Status per step (clone commit)
01 C15 d1a885baf clean | 02 C27a 3babf028b clean (both patches) | 03 C27b inventory 619d8d05f (surface patch clean, rebaseline moved sourceBaseline to 3babf028b) | 04 C17 151faab0f | 05 C18 726f0ebb2
06 C26 PRO b6c1eb8bc | 07 C26 UN 0ce1ef7a3 | 08 C19 s1 24be8857a | 09 C19 s2 3a9e768b0 (held `...-rebased.patch` applies clean on current main, no rebuild, so no `k108-d75-unprotected-rebased.diff`) | 10 C19 s3 afd6eadef
11 C20 ad4064ffc | 12 C21 a644441c8 | 13 C22 adef559e4 | 14 C24 a1432edb2 | 15 C23 PRO c4640c0ef | 16 C23 UN 94a559b4c | 17 C25 PRO a28546501 | 18 C25 UN ecea6e946
19 K92 PRO 7ce60c753 | 20 K92 UN 174f59ce7 | 21 K104 PRO 566c057a9 | 22 K104 UN ce462be41 | 23 K95 PRO c826959f6 | 24 K95+K106 UN 0bfb56177 (CONFLICT, see below)
25 K96 PRO acda887cc | 26 K105 PRO 16a3042e0 | 27 K96 UN 43fcbf94d | 28 K105 UN 306030352 | 29 K97 PRO ef698d6d3 (plain apply fails, 3-way clean) | 30 K97 UN db5c5087c
31 K98 PRO bd5ade657 | 32 K103 PRO fdb3f5c68 | 33 K103 UN 839758530 | 34 ratchet UN 0934961fe | 35 C28 PRO e18789b6f
All 35 steps committed; no step stopped. Conflicts used: 2 (limit 3 per step).

## Conflicts and resolutions
1. Step 24 (K95+K106 unprotected, `scripts/dispatch-briefing.mjs`): `git apply --check` failed; `--3way` left 2 conflict hunks. Cause: main already carries K104's shared running-dispatch reader (`readRunningDispatches` from `lib/dispatch-record-liveness.mjs`), the combined diff was built on the old inline `defaultRunningDispatches`/`briefedWriteScopes`.
   Resolution (minimal, both behaviours kept): import line = `import { observeGovernedItemIntegrationReadiness, resolveGovernedItemQueue } ...` + K104's `readRunningDispatches` import (K106's `readDispatchRecordLiveness` import dropped); K104's one-line `defaultRunningDispatches` kept, K95/K106's `defaultQueueRows`, `defaultIntegratedSliceIds`, `hasDeliveredSliceOfItem` kept, the old inline `briefedWriteScopes`/`BRIEFING_SCAN_LIMIT` block dropped (the lib owns it). `dispatch-briefing.test.mjs` 66/66 after. Operator uses `k108-k95-unprotected-rebased.diff` (staged diff of the resolved tree against the state after step 23, 3 files) instead of the held patch.
2. Step 29 (K97 protected): plain `git apply --check` fails on `lib/guard/shell-grammar.mjs:9` (K96 changed the neighbouring lines, as predicted). `--3way` applies both files with no conflict markers; both behaviours present (K96 `qp4OperandIsCredentialTarget` branch and K97 `gitShowObjectOperand` use). Exact resolution: `k108-shell-grammar-resolution.diff` (the shell-grammar part: import gains `gitShowObjectOperand`, `areGitObjectSpecOperandsContained` uses it, +2 lines); full rebased protected diff `k108-k97-protected-rebased.diff` (both files) is what the runbook applies.
No other overlap: C19 vs K95 (`dispatch-briefing*`/`slice-queue*`) none for the protected lib; C20 vs K103 (`pipeline-state.mjs`) none; K98 files untouched by others.

## Counts (in clone at final HEAD, each alone, private TMPDIR; runner `scratch/k108-run.mjs`, results `k108-results.txt`)
| check / suite | stated in notes | measured | diff |
|---|---|---|---|
| check-verify-suite-registration | 1085 reg / 0 unreg (K91) | exit 2, 7 UNREGISTERED | FLAG (below) |
| check-verify-case-completion | exit 0 (C27); K91 saw 1 finding | exit 0 | now as C27 says (K102 pin registered on main) |
| check-product-capability-inventory | PASS | exit 0 | = |
| architecture-boundary-check --root . | 0 over-bound at main; 16 over-bound with bundle | 18 violations, all unowned-path `scripts/*.mjs` (same 18 on main), 0 over-line-bound | = after ratchet commit |
| guard-lifecycle-ready.test | 392/389/3 skip | 392/389/0 fail/3 skip | = |
| antigravity-pretool-guard.test | green expected (K92 64) | 64 ok / 0 not ok, first run, 536 s | = (no timeout seen) |
| guard-dispatch.test / -fanout.test | 67 / 34 | 67/67, 34/34 | = |
| scripts/dispatch-briefing.test | 66 (K95+K106) | 66/66 | = |
| lib/slice-queue.test / scripts/slice-queue.test | 40 / 19 | 40/40, 19/19 | = |
| lib/dispatch-scope-overlap.test | 12 | 12/12 | = |
| lib/onboarding-continuity.test | 306 | 306/306 | = |
| scripts/session-cleanup-binding.test | 68 | 68/68 | = |
| lib/human-guard-override.test | 178/177/1 | 178/177/0/1 skip | = |
| read-blocks pin | 23 / 22 pass / 1 skip | 23/22/0/1 skip | = |
| advertised-git-to-head pin | 227 | 227/227 | = |
| claude-windows pin | 16 / 15 / 1 skip | 16/15/0/1 skip | = |
| signature-ceremony (AC-258) pin | 16/16 | 16/16 | = |
| git-stash pin / hgo-patch-preflight pin | 88 / 14 | 88/88, 14/14 | = |
| guard-apply-patch.test | 28 ok | 28 ok, exit 0 | = |
| antigravity-native-read-credential-roots.test | 8 | 8/8 | = |
| commit-message-policy-administrative-refusal / onboarding-init-machine-plane-reason / approve-push-chat-catalogue-repair | 1 / 1 / 1 | 1/1, 1/1, 1/1 | = |
| codex-isolated-critic-protected-preimage.test | 4 checks | RED before repin (6 digests), 4/4 ok after | = |
| check-consumer-safe-paths.test | 9 | 9/9 | = |
| session-authority-repair.test | none stated | 11/11 | - |
| lib/native-goldfish-host-state.test | none stated | 39 tests, 37 pass, 2 FAIL: NGHS09, NGHS13 (892 s) | FLAG (below) |

## Findings to flag
- Registration (PO/operator decision, protected edit `harness/verify-suites.json`): 7 test files have no registration entry: `lib/commit-message-policy-administrative-refusal.test.mjs` (K98), `lib/dispatch-scope-overlap.test.mjs` (K104), `scripts/onboarding-init-machine-plane-reason.test.mjs` (K98), `scripts/pipeline-state-approve-push-chat-catalogue-repair.test.mjs` (K103) are NEW with the bundle; `scripts/clone-hook-readiness.refresh.test.mjs`, `scripts/commit-pipeline-owned.test.mjs`, `scripts/security-adapters/gitleaks-scratch-clones-exclusion.test.mjs` are already unregistered on MAIN HEAD (checker exit 2, 3 findings, measured). The bundle needs one more protected commit (register the 7, then rebaseline the inventory if a surface line is required). Not built here (outside the briefing).
- native-goldfish-host-state.test NGHS09 and NGHS13: `--test-name-pattern` run of exactly these two on the MAIN checkout (no bundle) also fails (0/2), so they are not caused by the bundle. Cause not investigated.
- C27 "case-completion exits 0" is true again; K91's finding is gone.

## Ratchet table (`k108-ratchet-delta.diff`, one unprotected diff, `git apply --check` clean on main; accepted value = measured line count, no headroom; 16 files, all grown only by bundle rows: main HEAD has 0 over-bound)
| file | accepted -> measured | grown by | announced in its row? |
|---|---|---|---|
| harness/scripts/verify.mjs | 1202 -> 1206 | C15 (+4) | no |
| hooks/antigravity-pretool-guard.mjs | 1099 -> 1106 | K96 UN (+7) | no (K96: not measured) |
| hooks/antigravity-pretool-guard.test.mjs | 1492 -> 1551 | C22 +36, K92 UN +22, K96 UN +1 | no (K92: "not measured") |
| hooks/guard-dispatch.mjs | 1037 -> 1063 | C19 s3 +6, K104 PRO +20 | yes (s5 notes +6, K104 notes 1063) |
| hooks/guard-dispatch.test.mjs | 1032 -> 1055 | C19 s3 +23 | yes (s5 notes) |
| hooks/guard-lifecycle-ready.test.mjs | 12425 -> 12433 | C17 (+8) | no |
| lib/guard-maintenance-window.mjs | 2086 -> 2087 | C25 PRO (+1) | yes (k81 notes) |
| lib/guard/shell-grammar.mjs | 1568 -> 1586 | K96 PRO +16, K97 PRO +2 | partly (K97 "+25 lines in two files, report only"); K96 no |
| lib/native-goldfish-host-state.mjs | 1604 -> 1611 | C19 s1 (+7) | no |
| lib/native-goldfish-host-state.test.mjs | 1047 -> 1077 | C19 s2 UN (+30) | no |
| lib/onboarding-continuity.mjs | 12295 -> 12365 | C18 +1, C26 PRO +71 | C26 yes (12364, +71), C18 +1 no |
| lib/protected-test-paths.mjs | 1108 -> 1149 | C23 PRO (+41) | no |
| lib/slice-queue.mjs | 1007 -> 1042 | C19 s1 (+35) | no |
| scripts/onboarding-init.mjs | 1798 -> 1800 | K98 PRO (+7 from base 1793) | no ("no violation observed") |
| scripts/pipeline-state.mjs | 13819 -> 13845 | C20 +14, K103 PRO +12 | C20 yes (13833), K103 only "may touch" |
| scripts/session-cleanup-binding.test.mjs | 3138 -> 3226 | C26 UN (+91 from base 3135) | yes (k80 notes +91) |
Step 34 must run AFTER all content steps (values are measured at the final state); policy file is unprotected. Raising is the PO call the checker text argues against ("split rather than raise").

## C28
Six digests re-measured in the clone (`k108-repin.mjs`): identical to the held `k82-critic-preimage-repin.patch` (12 digest lines compared equal), so the held patch is still valid on main; `k108-critic-preimage-repin.diff` equals it. Test RED before (6 mismatches), 4/4 after. Re-measure at the sitting if any Critic-contract file changed meanwhile (`node scratch/k108-repin.mjs` in a checkout).

## What the human must know
- Order is fixed: 03 after 02; 06 before 07; 08 before 09 (s2 imports the S4 libs) before/independent of 10; 17 before 18; 19..33 each protected before its unprotected partner; K96 before K97 (shell-grammar); 34 after everything; 35 LAST.
- Steps 24 and 29 use rebased diffs (above); the held patches fail plain `git apply --check` there.
- Dispatch trailer: the rehearsal used `Dispatch: stage-0 (elephant)` as briefed. Operating-model fast path is at most 2 files / ~25 lines, so the authorship verifier may report larger steps UNVERIFIABLE; no `dispatch-record-K*.json` exists for the notes' original trailers (K91 finding unchanged). The binding is a sitting decision.
- Step 33 message file describes the actual content (test only; the hook-refresh part of K103 is already on main as 57c12ecc0); the clone commit 839758530 has a differently worded subject, content identical.
- Runbook `k108-runbook.md`: per step the exact check/apply/add/commit lines; messages `k108-msgs/NN-key.txt`.

## Unverified
Independent Critic read; Windows host; full Verify gate; `check-verify-case-completion.test`; the 7-file registration step (not built); NGHS09/NGHS13 root cause; whether the sitting's operator environment shows the same hook behaviour as the clone; antigravity timeout under load (not seen: green first run).
