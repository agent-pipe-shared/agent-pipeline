# WINVERIFY2 baseline vs candidate: verify-journal.test.mjs (native Windows, single file)

Method: HEAD exported with `git archive` into `scratch/WINVERIFY2/head`, run with `node --test <file>` (the guard refused
`--test-reporter*` flags, so output was captured from the background task output file). Candidate = working tree file.
The tests resolve the plugin tree relative to their own location, so the HEAD copy ran against HEAD code.

## Baseline (HEAD): 84 tests, 80 pass, 3 fail, 1 skipped, 887 s

| # | Failing test | Cause at HEAD | Candidate |
|---|---|---|---|
| 2 | private journal writes bounded JSON progress and keeps complete logs off the channel | assertion at test line 141: `54 !== 0` | also fails (same name, in the same output position) |
| 12 | permissive or symlinked prior run parents are ignored, never traversed | `EPERM` on `symlinkSync` (Windows without symlink privilege), environmental | also fails (same name) |
| 18 | SIGINT interruption terminates only its child group, seals distinct immutable evidence, and releases its exact automatic owner | assertion at test line 546: `false !== true`, Windows signal semantics | also fails (same name) |

Classification: all three are PRE-EXISTING (fail identically at HEAD). No NEW failure identified. The WINVERIFY change does
not explain them: #12 is a symlink privilege limit, #18 a Windows signal limit (cf. the skipped real-SIGINT test), #2 is a
nonzero count assertion present unchanged at HEAD.

## Candidate status

Candidate final: 92 tests, 88 pass, 3 fail, 1 skipped. The 3 failures are the same three tests as at HEAD (positions 2, 12,
18). The 8 extra tests vs HEAD (92 vs 84) are the new WINVERIFY tests, all passing.
