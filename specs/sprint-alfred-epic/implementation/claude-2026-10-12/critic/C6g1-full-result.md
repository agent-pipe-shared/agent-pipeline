# Critic C6g1 FULL — result (partial review)

- Briefing: [C6g1-full.md](C6g1-full.md)
- Review object: e02c40247, 6b4d89ea1, 8679cc3d9, dc0f02ec0, 90e83204d, 6a091c345, 411b83a86, 8d4b3613e, 1f1991be3, bab86d46d, b2cfbf21a
- Requested route: claude-sonnet-5-5 at high; effective identity claude-sonnet-5-5 (direct same-dispatch runtime prompt); effort not observable
- Assurance: functional-equivalent-read-only; OS isolation not asserted
- Outcome: **pass/fail withheld — partial review** (80 % checkpoint at call 40 of 50). Three major findings stand regardless of the unreached material.
- Trajectory: inconsistent for e02c40247 (claimed host skips are constant empty skips) and 411b83a86 (claimed typed refusal is swallowed); otherwise not verifiable.
- Briefing violations: none.

## Findings (as reported)

| ID | Severity | Commit | Gap | Evidence |
|---|---|---|---|---|
| F1 | major | 90e83204d | `isForbiddenCrossRepositoryMutation` judges only a derived destination: it misses `-t` inside a short-option cluster (`cp -rt DIR src`), long-option abbreviations (`--target DIR`), and treats `mv` sources and `install -d` operands as reads. Previously forbidden outside-repository mutations are now allowed at this layer. | lib/guard/po-commands.mjs:191-207; evaluate.mjs:358-365; no test in the commit |
| F2 | major | bab86d46d | The persistent native-assembly cache in `%LOCALAPPDATA%\agent-pipeline-native-cache` is authenticated only by a self-hash in its file name plus a current-user ACL, then `Assembly.Load`ed into the owned-authority and process-observer helpers; the bytes are not bound to the measured helper source. A planted valid-hash assembly lacking the type causes a persistent `PIPELINE-NATIVE-TYPE-MISSING` denial. | Import-PipelineVerifiedAssembly / Test-PipelinePrivateAcl in both .ps1; windows-native-type-cache.test.mjs:131-154 |
| F3 | major | e02c40247 | AC-240 closed grammar is unmet for the git read lane: the denylist is exact-spelling (abbreviated long options pass), and `git diff <path> <path>` with an outside path behaves as `--no-index` without the flag. | shell-grammar.mjs:1169-1201; pin :81-95, :228-237; evaluate.mjs:366-370 |
| F4 | minor | e02c40247 | The two symlink/mode-bit cases are constant-skip empty bodies on every host; the new `git -C` symlink rejection has no test. | pin :34, :239-240; shell-grammar.mjs:1175-1179 |
| F5 | minor | 411b83a86 | `PO-SIGN-GIT-UNAVAILABLE` and the repair hint are swallowed by `currentGitCandidate` / `designSigningGit`; `trustedToolRepairHint` has no consumer. | po-human-approval.mjs ~258-262; trusted-tool-resolution.mjs:77-83 |
| F6 | minor | bab86d46d | The cited anchor AC-220 (onboarding matrix serial and slow) does not cover the PowerShell helper cache; the PO exception is not evidenced in admissible input. | spec §23 AC-220 row; backlog item text |

## Not reached (as reported)

Pins and items behind 6b4d89ea1, 8679cc3d9, dc0f02ec0 (threat-model doc), 90e83204d (other cp/mv/install assertions), 6a091c345, 411b83a86, 8d4b3613e/1f1991be3 (AC-128), bab86d46d outside the loader block, b2cfbf21a test hunk.

## Coordinator disposition

- F6: the PO exception exists (PO decisions 2026-10-16 night, PERF-01: "attached for admission to AC-220 ... needs a security-relevant Critic look, since the cache sits on a code-loading trust boundary"). It is recorded in `scratch/alfred-claude-20261012/po-decisions-2026-10-16-night.md`, which is not admissible Critic input. Disposition: anchor accepted by PO exception; F2 is exactly the security look the PO asked for and is treated as a functional hold.
- F1, F3, F4: correction Goldfish ALF-C-C6G1-CORR-A (guard grammar; protected paths → signature-bound patch for Route B, proven on a scratch mirror).
- F2: correction Goldfish ALF-C-C6G1-CORR-B (bind the cached assembly to the measured helper source; fall back instead of failing on a type-missing cache entry).
- F5: included in ALF-C-C6G1-CORR-B (non-protected script).
- The candidate is not Critic-cleared for this batch until the corrections and one DIFF review land.
