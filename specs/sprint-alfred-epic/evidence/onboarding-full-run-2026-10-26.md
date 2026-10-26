# Full onboarding orchestrator run, WSL PC, 2026-10-26

`node scripts/run-onboarding-full.mjs` (`plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`, private TMPDIR,
serial chunks) on HEAD `1e646910c` plus the staged recon memo, run from inside a live Elephant session. Full log:
`scratch/onboarding-full.log` (untracked).

Result: **exit 1. 216 cases across 2 sequential chunks of 6 shards; chunk 0 shards 0 to 4 failed (17 or 18 passed,
1 failed each), shard 5 passed.** The run completed with consistent counts and did not hang or time out.

Four distinct failing cases:

1. `NVA-R40-PROJDRIFT`: `set-phase implementation` refused with `CVCT-CALIBRATION` (calibration commit preflight).
2. "the seeded push gate refuses an unapproved push and admits it after the shipped commands": the approved push was
   blocked by `guard-push` ("Push-Gate check failed (1 finding)").
3. "the seeded security gate refuses a push with missing security evidence and admits it after the shipped scan command
   runs (SECGATE-1)": same `guard-push` block after the scan command.
4. "the public onboarding handover is executable for every runner with baseline-only and configured verify": fails
   for `codex` and `antigravity` at "configure verify".

Reading: cases 2 and 3 depend on the scan command and a scanner (`osv-scanner`, `gitleaks`) that are absent on this PC
(D164 prerequisite row), and case 1 depends on the surrounding checkout's calibration commit state. These are suspected
environment effects, not measured as such: the same four cases were not run on a clean host. The rows
`onboarding-test-runner-reports-async-pass-before-settlement` (needs a complete 216-case run with exit 0),
`nongit-retirement-reader-calls-inaccessible-controller-helper` and `retirement-reader-masks-typed-unsafe-layout-inspection`
therefore do not move: the counts are consistent, but exit 0 is not reached.

Next: install the scanners and a stable node on the PC through the D164 route (attended, not by the agent), re-run, and
compare. If the four cases stay red on a host with the scanners, they are defects.
