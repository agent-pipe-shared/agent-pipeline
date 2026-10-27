# W7 preflight slice 1: scanner prerequisite findings (complete held patch)

Slice W7-PREFLIGHT-SCANNER-FINDINGS-C2-C1-20261027. Patch: `w7-preflight-scanner-findings-c2.patch` (git diff --binary of a scratch clone made at b0bd45e2d; apply check passes at candidate 610bae6773a1b20a59f908061feb43e89bb62485). Supersedes the interim `w7-preflight-scanner-findings.notes.md`. Targeted delivery: green. Critic review, Full Verify and PO acceptance stay pending (parent-owned batch gates).

## Cause
`ENVIRONMENT_FINDING_IDS` listed eight findings; gitleaks, osv-scanner and semgrep were only visible through `runToolchainPreflight`, never as typed findings of the environment readiness report, so a missing scanner could not show up there as an attended prerequisite.

## Changed lines (patch, 2 files)
`plugins/pipeline-core/scripts/toolchain-preflight.mjs` (+~18):
- `ENVIRONMENT_FINDING_IDS` appended `scanner-gitleaks`, `scanner-osv-scanner`, `scanner-semgrep`.
- New `scannerProbe(tool)`: caches one `runToolchainPreflight` run per report in `context.scanners` (manifest enabling the three scanners, same deps, so injected resolver/probes/platform apply), takes the tool entry; `ready` gives `ok` (`repair: null`), any other status gives `attended` with cause `<tool> prerequisite status: <status>` and `attendedPrerequisite("<tool>-installed", GUIDANCE[platform][tool])`.
- Three entries in `DEFAULT_FINDING_PROBES`. `installCommandFor` untouched (no install-command text in these findings).
`plugins/pipeline-core/scripts/toolchain-preflight.test.mjs`: `R77_FINDING_IDS` extended with the three ids (strengthening; TCP035 iterates it), three messages and one case title changed from "eight" to "closed" (name of that case may differ in failing-name comparisons; here no failures), new cases TCP045..TCP049 (W7-1a..W7-1e).

## RED (clone, tests edited, production unchanged)
49 tests, 43 pass, 6 fail: TCP035 R7-7a, TCP045, TCP046, TCP047, TCP048, TCP049.
## GREEN (clone, patched)
toolchain-preflight.test.mjs: tests 49, pass 49, fail 0. pipeline-start-preflight.test.mjs: tests 98, pass 98, fail 0. lib/pins/signing-toolchain-readiness.test.mjs: tests 14, pass 14, fail 0.
## Baseline (clone2, unchanged candidate)
toolchain-preflight.test.mjs 44/44 pass; pipeline-start-preflight 98/98; signing-toolchain-readiness 14/14. Failing-name sets: baseline empty, patched empty (identical; no pre-existing failure).
signing-toolchain-readiness.test.mjs: it names a subset of ids; I did not trace whether it iterates `ENVIRONMENT_FINDING_IDS`; it passes unchanged. pipeline-start-preflight pins unaffected (passes unchanged); the payload-budget pin was not located by name.

## NOT done
No `installCommandFor` change, no pipeline-start-preflight edit, no Full Verify, no Critic, no native run. A real host with missing scanners will now report `report.ok === false` and these attended findings; consumers that assume `ok` on a bare host were not surveyed beyond the suites above.

## Commit message
feat(preflight): report gitleaks, osv-scanner and semgrep as typed prerequisite findings

## Operator flow
Apply the diff (`git apply`), `git add -u -- plugins/pipeline-core/scripts/toolchain-preflight.mjs plugins/pipeline-core/scripts/toolchain-preflight.test.mjs`, `--no-verify` commit (kernel path), stamp, install.

## Protected-path classification
The test file matches no TP-1..TP-13 pattern; `toolchain-preflight.mjs` is a plugin kernel path (held patch, not edited in the repository). Independent Critic review stays a parent-owned batch gate.
