# W7 preflight slice 1: scanner prerequisite findings (INTERIM, budget-stopped, NO patch)

Candidate b0bd45e2d. Slice: W7-PREFLIGHT-SCANNER-FINDINGS-C1-20261027. Status: tests written in a scratch clone and run RED-baseline; production edit NOT yet made; no patch file exists. Paths are repository-relative.

## Re-verified recon claims (in the clone at the candidate)
- `plugins/pipeline-core/scripts/toolchain-preflight.mjs`: `ENVIRONMENT_FINDING_IDS` line 331 (eight ids), `DEFAULT_FINDING_PROBES` line 487, scanner probes imported 68-70, `runToolchainPreflight` scanner loop 259-268, `GUIDANCE` 79-84 (usable as attended-prerequisite summary text without touching `installCommandFor`).
- No JSON schema file lists the finding ids. Only hits: toolchain-preflight.mjs:331, toolchain-preflight.test.mjs:404 (`R77_FINDING_IDS`), and a subset list in `plugins/pipeline-core/lib/pins/signing-toolchain-readiness.test.mjs:228` (names five ids, not a count; unaffected unless it iterates `ENVIRONMENT_FINDING_IDS` - NOT checked, name for the Critic).
- `pipeline-start-preflight.test.mjs`: no match for `environmentReadiness` or a findings count (only unrelated `findings` rows at lines 240, 355). Start-preflight builds `environmentReadiness` at pipeline-start-preflight.mjs:2354; payload-budget pin not located in the test by `rg`; NOT run.

## Done (in clone only, not delivered as a patch)
Test edits in `plugins/pipeline-core/scripts/toolchain-preflight.test.mjs`:
- `R77_FINDING_IDS` extended with `scanner-gitleaks`, `scanner-osv-scanner`, `scanner-semgrep` (strengthening; justification: the existing matrix case iterates this list and asserts the report carries exactly the closed ids). Three message strings and one case title changed from "eight" to "closed" (the title change alters that case name in failing-name comparisons).
- Five new cases W7-1a..W7-1e (ids ascending after TCP044 = TCP045..TCP049): (a) id list exports the three ids, (b) injected missing scanner (`resolveExecutableFn: () => null`) gives `attended` with scanner named, report not ok, (c) injected present scanners give `ok` with `repair: null`, (d) 8+3 findings in order, (e) incompatible osv-scanner 3.0.0 is attended and no install-command text (`sudo|apt-get|go install|brew install|winget`) appears in the scanner findings.
Baseline (clone2, unchanged candidate): whole `toolchain-preflight.test.mjs` exit 0, 44 tests, 44 pass, 0 fail (log: `scratch/agent-out/w7qq/base.toolchain-preflight.test.mjs.log`).
RED run in clone (tests edited, production unchanged): launched and completed (exit 0 of the driver, which does not carry the test exit); log at `scratch/agent-out/w7qq/red.toolchain-preflight.test.mjs.log` was NOT read before the budget stop, so RED counts are unrecorded here.

## Remaining (next step)
1. Read the RED log, record failing names.
2. Production edit in the clone, `toolchain-preflight.mjs`: append the three ids to `ENVIRONMENT_FINDING_IDS`; add `scannerProbe(tool)` to `DEFAULT_FINDING_PROBES`: cache `runToolchainPreflight({ rootDir, manifestResult: manifest enabling the three scanners, platform, tempDir }, context.deps)` in the context, take the `results` entry for the tool; `ready` -> `{status:"ok", cause:"<tool> <version> is ready", repair:null}`; any other status -> `{status:"attended", cause:"<tool> prerequisite status: <status>", repair: attendedPrerequisite("<tool>-installed", GUIDANCE[platformName(platform)][tool])}`. No `installCommandFor` change (slice 2), no start-preflight edit.
3. Run GREEN, whole file in clone and clone2, compare failing-name sets; also run `pipeline-start-preflight.test.mjs` and `lib/pins/signing-toolchain-readiness.test.mjs` in clone vs clone2 (the R7-7c case compares bootstrap vs direct findings with REAL scanner probes, a risk to check).
4. Driver `patch` and `check` (apply check in clone2), then `cleanup`. Driver: `scratch/agent-out/w7qq/driver.mjs` (modes setup, setup2, run, patch, check, cleanup); clones currently exist and are NOT cleaned up.

## Proposed commit message
feat(preflight): report gitleaks, osv-scanner and semgrep as typed prerequisite findings

## Operator flow (once a patch exists)
apply the diff, `git add -u` with a path limit to the two files, `--no-verify` commit (kernel path), stamp, install. Protected-path classification: the test file matches no TP-1..TP-13 pattern; `toolchain-preflight.mjs` is a plugin kernel path (held patch). An independent Critic review stays a parent-owned batch gate.
