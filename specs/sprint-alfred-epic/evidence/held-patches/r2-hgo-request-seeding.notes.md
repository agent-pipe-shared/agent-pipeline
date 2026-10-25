# R2 HGO request seeding / one-shot sweep (AC-160) - held kernel patch

Candidate: b7fbc78b62846851a88689a45e53dc538d03cc66. Patch: `r2-hgo-request-seeding.patch` (git-apply-able, repository paths, p1).

## Preimage SHA-256 at the candidate
- plugins/pipeline-core/lib/human-guard-override.mjs: 1573ad02d37d9086891b9b05445d6ff99a3b4b93229e805d639f74be30e2eba8
- plugins/pipeline-core/scripts/guard-human-override.mjs: 91a40900dea8aa87956a7c1cbf657dc4589816b72e76ea2b5091f05510559009
- plugins/pipeline-core/scripts/guard-human-override.test.mjs: 7cccfd15347bb09a2dd4ab57fd6c2dab06d9809fc5dda4cfbd80fc1e7a6d0a5a

## What it does
- `lib/human-guard-override.mjs`: new export `sweepHumanGuardOverrideRequestsAll` loops the existing audited, CAS-checked single-batch sweep (<= 61 per publication) until remainingEligible 0 or 100 runs; returns {status, runs, removed, retained, remainingEligible}. `HGO_SWEEP_REPAIR` (namespace-full and inventory-bound refusals) now names `sweep-requests --repo <absolute-root> --all`.
- `scripts/guard-human-override.mjs`: `sweep-requests --repo <root> --all` (`--all` trailing boolean only; anything else is a usage error). Without `--all` behaviour is unchanged.
- Seeding layer: NO production change needed. `classifyNonLiftableGuardDenials` (called first in `recordHumanGuardDenial`) already returns `non-liftable-recovery-required` and writes nothing for a real reason of the shape `BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-READ-COMMAND-UNSUPPORTED: ...`. AC-160 case 1 is therefore a regression case, expected and measured GREEN on the original code (capture `case1-on-original.txt`). It also asserts an overridable refusal still seeds exactly one request. Case 1 was rewritten from a bare-code fixture (not the real input shape) to the real reason shape; justification: the earlier fixture did not mirror the hook input (coordinator-settled).
- Tests: 5 AC-160 cases appended to `scripts/guard-human-override.test.mjs` (no existing case changed).

## Safety reasoning
Only requests the existing selection deems eligible (expired, not referenced by an armed capability) are ever removed; live/unexpired/armed requests stay (cases 2, 4). Each batch keeps its own CAS, inventory check and audit entry. Consumption, signature and audit code paths are untouched. The loop is capped at 100 runs (6100 requests).

## Conflicts with other held patches
Possible textual conflict with any other held patch touching the same hunks (end of the sweep function in the lib, the `sweep-requests` branch/usage in the script, end of the test file). None checked against other patches; `git apply --check` against the candidate is below.

## Results
- case1-on-original: capture-exit=reused exitCodeLine=0 tests=1 pass=1 fail=0
- green-scripts-ac160: capture-exit=reused exitCodeLine=0 tests=5 pass=5 fail=0
- green-scripts-whole: capture-exit=reused exitCodeLine=0 tests=33 pass=33 fail=0
- green-lib-human-guard-override: capture-exit=reused exitCodeLine=1 tests=178 pass=175 fail=2
- green-lib-human-guard-override-disjoint: capture-exit=reused exitCodeLine=0 tests=35 pass=35 fail=0
- green-lib-human-guard-override-disjoint-isolation: capture-exit=reused exitCodeLine=0 tests=38 pass=38 fail=0
- green-lib-human-guard-override-capability-scan: capture-exit=reused exitCodeLine=0 tests=3 pass=3 fail=0
- git apply --check specs/sprint-alfred-epic/evidence/held-patches/r2-hgo-request-seeding.patch: exit 0
- host-check-repo-test: capture-exit=reused exitCodeLine=0 tests=28 pass=28 fail=0
- (baseline, unmodified repository) baseline-repo-lib-human-guard-override: capture-exit=1 exitCodeLine=1 tests=178 pass=176 fail=1

Lib suite caveat (not caused by the patch): the lib human-guard-override suite fails 2 in the scratch copy and 1 on the unmodified repository (same file, baseline capture above). The shared failure is "Q9 (D55)" (SDC-AUTHORITY-UNAVAILABLE: domain-ancestor-unsafe, host-environment). The extra scratch-only failure is "F1 (CRITIC-REMEDY-09)", which needs the repository's real .claude-plugin/marketplace.json that the scratch tree does not carry. All other 176 lib cases pass in both. The four lib suites do not exercise the new export; the new behaviour is covered by the scripts-suite AC-160 cases.

Counts before/after (scripts suite, scratch copy): AC-160 cases RED 5 tests / 1 pass / 4 fail (red-scripts-ac160.txt, original kernel) -> GREEN 5/5; whole scripts suite 33/33 (28 original + 5 new).

## Proposed commit
```
fix(pipeline): add a one-shot sweep-requests --all for the override request namespace

sweep-requests --all removes every eligible expired request in one invocation and reports
counts; the namespace-full and inventory-bound refusals name that repair. Read-grammar
refusals already seed no request; add regression coverage (AC-160).
```
