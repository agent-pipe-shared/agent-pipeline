# guard-lifecycle-ready.test.mjs red classification, 2026-10-19

Source: dispatch ALF-B2-AC197 (Goldfish, read-only run; no file changed). WSL Linux, candidate
51d7637e6 plus unrelated uncommitted test work. The runner summary was tests 391, pass 362, fail 26,
skipped 3. Line numbers are the test start lines. "Verified" means the dispatch read the causing
source; "suspected" means it inferred the cause from the failure signature only.

| Group | Cases (start line) | Class | Cause |
|---|---|---|---|
| A | 267, 289, 353 | stale fixture, verified | `deny()` defaults the readiness status to `partial`; `readSessionReadinessWithBoundedReread` (lib/guard/lifecycle-gate.mjs, ALF-C-PARWORK-M3) re-reads once after 500 ms, so the injected readiness function is called twice (`calls 2 !== 1`). Fix: pass a non-partial status in these cases. |
| B | 5125, 10808 | stale fixture, suspected (same cause as A) | `36 !== 18` with about 18 x 500 ms of wait; `2 !== 1`. |
| C | 3910, 3952 | stale fixture coverage, verified | NVA-CODEXARGV-1: the newly declared mutating subcommand `materialize-existing-trust-anchor` is missing from the test's subcommand list and argument table. Once it is covered, the guard's real admission of that argv is unmeasured. |
| D | 5357, 5600, 5947, 5964, 6184, 7820 (+5653 undiagnosed) | test seam removed by the product, verified | `hgoArmByChat` injects `isattyFn`/`readLineFn`, but `lib/human-guard-override.mjs` now calls `runRegisteredAttendedChatGateConfirmation`, which observes the real fd 0 (`lib/chat-gate-ceremony.mjs`). The result is `CHAT-GATE-NOT-ATTENDED`. A setup change cannot make these green: they need a pty-backed fixture or a test seam in a protected library. The sibling `guard-testpath-override.test.mjs` line 197 uses the same injection and was not measured. |
| E | 740, 2026, 7104, 7318, 7351 | behaviour change, suspected | Git read forms with an outside-root operand (`git -C <outside> status`, `git log <outside file> | head`) are now refused; the cat/head/rg forms of the same case still pass. |
| F | 1090 | behaviour change | `git fetch origin refs/heads/main:refs/remotes/origin/main` is no longer in the non-ready read-only lane; agent-obligations §1a also lists the lane without it. |
| G | 2447 | text follows PO decision D24 | The guard now recommends `git commit -F <msgfile> -- <paths>` for a parenthesised Dispatch role, while the test still expects the `--trailer` spelling. |
| H | 3293 | stale derivation, undiagnosed | GUARDDERIVE-1: the guard's admitted `plan*` set contains `plan-existing-trust-anchor`, but the CLI-table derivation does not. This is the same new subcommand family as C. |
| I | 7981, 11373, 11442, 11649 | verdict mismatch, undiagnosed | DEVPLANSHELL-1 expects `node scratch/probe.mjs` refused and the guard admits it; QP4-1/3/7 are read-grammar predicates where the guard says true and the test expects false. |

Totals: 7 fixture cases (A, B, C) and 19 cases that need a decision on intent before any assertion
changes (D to I). This WSL run cannot distinguish platform differences from native Windows.
