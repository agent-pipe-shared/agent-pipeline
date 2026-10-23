# K133-REHEARSAL-3 results (clone scratch/clones/k133, base 375055799, final HEAD 12149c72c, 48 commits, clean tree)

Implementation complete in clone; independent Critic read, operator commit of the protected parts and PO acceptance pending.

## Per-step apply results (every `git apply --check` and `git apply` exit 0 on the first try; wall time = whole step including both hook probes; PRO/UN as in the runbook)
Probe columns: the main checkout's generated hooks run against the staged state / message file without gating the commit (clone has no hooks). "refused" = a real commit would need `--no-verify` (see K133-runbook-corrections.md R5).

| step | result | clone commit | s | pre-commit probe | commit-msg probe |
|---|---|---|---|---|---|
| 01 PRO | OK | d4f132121 | 6.3 | refused (TP-3) | pass |
| 02 PRO | OK | e936c8347 | 6.4 | refused (TP-13) | pass |
| 03 PRO | OK | 66b3708e7 | 5.5 | pass | pass |
| 04-10 | OK | 59b6c90b4 1b380a485 f294710c0 fcbf62063 680a2a543 f3772b9d1 0bdf38e6f | 5.3-5.7 each | pass | pass |
| 11 PRO | OK | fa60a3e89 | 5.9 | refused (PB-SANCTIONED-WRITER) | pass |
| 12, 13 | OK | 23ab48c02 dc072f06e | 5.5, 5.3 | pass | pass |
| 14 PRO | OK | 353c05368 | 5.9 | refused (PB-GUARD-HOOKS) | pass |
| 15-24 | OK | 415226563 bf80ca0e7 867c5c351 b35e7d738 8c51a533e 8640c90bf ce6d63948 581f1b017 1c4ac68a7 8b10973e8 | 5.2-5.8 | pass | pass |
| 25 PRO | OK | 0424313dd | 6.3 | refused (PB-GUARD-HOOKS) | pass |
| 26 PRO | OK | 13c294c68 | 5.8 | refused (PB-GUARD-HOOKS) | pass |
| 27, 28 | OK | 4a4b857a2 d893cb009 | 5.4, 5.3 | pass | pass |
| 29 PRO | OK (rebased diff, plain apply) | 340883df0 | 5.8 | refused (PB-GUARD-HOOKS) | pass |
| 30, 31 | OK | 5ac840d75 2c31fe80f | 5.3, 5.8 | pass | pass |
| 32 PRO | OK | f1071375f | 6.0 | refused (PB-SANCTIONED-WRITER) | pass |
| 33, 34 | OK | ce6f75bc0 6b3d48e2d | 5.4, 5.4 | pass | pass |
| 35 | SKIPPED (PO decision) | - | - | - | - |
| 36 PRO | OK; checker exit 2 with the 7 UNCATEGORIZED lines, as expected | 2b991d025 | 6.7 | refused (TP-13) | pass |
| 37 PRO | OK; inventory PASS; registration 1092 registered, 0 unregistered | fae5b0eb1 | 6.2 | pass | pass |
| 38 PRO | OK; registration then exit 2 (MISSING-FILE + UNCATEGORIZED) | af24abc57 | 6.4 | refused (TP-13) | pass |
| 39 UN | OK; registration exit 2 (UNCATEGORIZED only) | d0dc6cb81 | 5.4 | pass | pass |
| 39b NEW | OK; inventory PASS; 1093 registered, 0 unregistered | 3b8b9ea08 | 6.4 | pass | pass |
| 40 PRO | OK; inventory PASS | 188e6652c | 6.0 | pass | pass |
| 41 UN | OK | 80b44c7d7 | 5.5 | pass | pass |
| 42, 43 | OK | ee946b34c cb98425db | 5.2, 5.6 | pass | pass |
| 44 PRO | OK | 60709c7cd | 5.9 | refused (PB-SANCTIONED-WRITER) | pass |
| 45 UN | OK with concrete paths | c0586b94e | 5.9 | pass | pass |
| 46 PRO | OK (git apply of `.claude/pipeline.json` via execFileSync, no shell refusal) | ef07571b2 | 6.6 | refused (GS-11) | pass |
| 46b NEW | OK | 0160baba8 | 5.6 | pass | pass |
| 47 PRO | OK with the corrected block (sync generates, `--check` PASS) | 12149c72c | 5.7 | pass | pass |

Total step time about 4.7 minutes (about 5.7 s per step, dominated by the two hook probes; the commits themselves are sub-second). Diff application and git work are not the cost; the end-state suites are (see below).

## End-state checks (clone at 12149c72c, each run alone, private TMPDIR outside every repository; logs `K133-chk-*.log`)
| check | expected | measured |
|---|---|---|
| check-verify-suite-registration.mjs | complete | exit 0, 1093 registered, 0 declared exclusions, 0 unregistered |
| check-verify-case-completion.mjs | exit 0 | exit 0, 361 entries, 347 conservatively classified suites |
| check-product-capability-inventory.mjs | PASS | exit 0, PASS |
| check-observation-governance.mjs | valid | exit 0, 252 documents classified |
| sync-reader-inputs.mjs --check | PASS | exit 0, PASS |
| check-backlog-state.mjs | only known-accepted DRIFT | exit 0, 22 DRIFT lines, all tagged known accepted (21 historical ledger evidence.commit events 2026-07-19..22 and the abbreviated OID of ledger event 403) |
| check-doc-contracts.test.mjs | 76 | 76/76 pass (46 s) |
| check-consumer-safe-paths.test.mjs | 9 | 9/9 pass |
| pin project-calibration-retains-new-project-placeholder | n/a | 43/43 pass |
| pin role-route-preflight-with-self-dispatch-fallback | 31 | 31/31 pass |
| pin governed-check-child-ignores-inherited-node-test-context (NGHS, step 39) | n/a | 2/2 pass |
| guard-dispatch.test.mjs | 67 | 67/67 pass (56 s) |
| guard-dispatch-fanout.test.mjs | 34 | 34/34 pass (17 s) |
| guard-lifecycle-ready.test.mjs | 392/389/3 skipped | 392 tests, 389 pass, 0 fail, 3 skipped (448 s) |
| architecture-boundary-check.mjs --root . (informational) | 0 over-line-bound | 0 over-line-bound after 46b, 21 unowned-path (identical on main today), exit 1 because of those |

No check was red; no bisect was needed. Not run: the whole NGHS file (15 minutes), Full Verify, Windows host.
