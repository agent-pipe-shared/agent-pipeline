# PROBE: are the "env-fresh-clone" Verify failures fixture or production defects?

Candidate: 36237bf73. Disposable WSL clone of that commit; all runs in the clone, none in the real checkout.
Status: checkpoint hand-back at tool use 44 of 55 (budget rule). Families B and C are diagnosed; family A was NOT reached (leads at the end).
Probe scripts (git-ignored, under `scratch/PROBE/`): `probe-b.mjs`, `probe-c.mjs`. They are lost unless moved to a tracked path.

## Verdicts

| family | verdict | one-line reason |
|---|---|---|
| A bootstrap binding | not reached | no probe run; leads below |
| B PROFILE-AUTHORITY-INVALID | fixture (plus one misleading production error code) | the fixture root is a bare temp dir with no `git init`; the profile check reads the intake checkpoint, which needs the root's git common dir. It is NOT a host PO-profile-receipt read, so the triage wording is wrong |
| C hook-provisioning-required | fixture | the fixture is a fresh `git init` repo with no hooks; preflight observes that repo's hooks, and the tests never inject the existing `checkCloneProvisioningFn` seam |

## Family B

Read site (the refusal): `plugins/pipeline-core/scripts/pipeline-state.mjs`, `inspectSelectedPlanProfile` (3806-3863).
Line 3819 calls `readOnboardingIntakeCheckpoint({ rootDir: dir })` inside a `try`; the `catch` at 3823-3824 returns
`{ ok: false, code: "PROFILE-AUTHORITY-INVALID" }`. The submit-plan caller prints the refusal at 10346-10348.

What actually throws, in call order:
`readOnboardingIntakeCheckpoint` (`lib/onboarding-continuity.mjs` 6159)
-> `resolveIntakeCheckpointPaths` (6134, call at 6135)
-> `resolveOnboardingIntakeScope` (`lib/codex-onboarding-runtime.mjs` 920, call at 925)
-> `resolveOnboardingPrivateState` (264)
-> `readGitCommonDirectory` (219-224): runs `git rev-parse --path-format=absolute --git-common-dir` with cwd set to the root it was given, and throws "physical Git common directory is unavailable" on a non-zero status.

Path expression read: the git common dir of the root passed in, then `agent-pipeline/onboarding/scopes/<scopeKey>`. It does not use the process cwd, the home directory or the installed plugin. Git's own upward discovery from the fixture root is the only ambient input.

Fixture side: `plugins/pipeline-core/scripts/pipeline-state-approve-announce.test.mjs` `freshDir()` (30-32) is a bare `mkdtempSync(tmpdir())`. `check-state-phase-consistency.test.mjs` and `pipeline-state-late-verify.test.mjs` contain no `"init"` call either.

Reproduction (probe-b, run in the clone, exit 0):
```
$ node scratch/PROBE/probe-b.mjs
BARE-TMPDIR(no git) THROW code=undefined msg=physical Git common directory is unavailable
GIT-INITED-TMPDIR OK status=absent
```
Controlled experiment (clone-local copy of the approve-announce test with ONLY `git init -q` added to `freshDir`):
original test = `ℹ fail 1` and "submit-plan refused (PROFILE-AUTHORITY-INVALID)"; copy = `ℹ pass 1`, `ℹ fail 0`.

Why it was green before: not measured. In the clone, neither the temp dir nor the home directory sits inside a git repo.
With `GIT_DIR` exported (as inside a git hook) the submit-plan step passes, so the fixtures were relying on ambient git
discovery; the run then fails at a later stage (approve-plan wants a bootstrap receipt), which I did not chase.
History: the intake read entered this check in 9d667529c (2026-08-28); the git-common-dir requirement in
`readOnboardingIntakeCheckpoint` came with 26fef9e7d (2026-09-29, intake scope v2). The fixtures predate it.

Not individually confirmed (do not assume): check-state-phase-consistency reproduces the same refusal (confirmed). late-verify
fails differently (exit 2, "baseline-only project could not enter implementation"). po-gate-authority.test.mjs has two
`"init"` references yet still shows the refusal, so at least one of its fixtures lacks it. observer-conformance did not
show the profile refusal in my run (its failure is the separate PRD-digest-stale one). `harness/scripts/pipeline-state.test.mjs` was not run.

Recommended fix (fixture): add a `git init -q` to each affected fixture's temp-dir factory; optionally make the production
`catch` at pipeline-state.mjs 3823 report a distinct "intake state unavailable" code instead of PROFILE-AUTHORITY-INVALID.
Protected paths: `harness/scripts/pipeline-state.test.mjs` is TP-5 protected (`harness/scripts/pipeline-state.test.mjs`); the other four
test files and `pipeline-state.mjs` are not in the TP list.

## Family C

Read site: `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs` line 1525 `checkCloneProvisioningFn(cwd)` (default
`checkCloneProvisioning`, parameter at 1045), then 1526-1527 `assessMandatoryHookReadiness` / `applyMandatoryHookGate`
(`scripts/check-clone-provisioning.mjs` 20-44): when both `pre-commit-hook` and `commit-msg-hook` are `install`, a
`ready` status is downgraded to `hook-provisioning-required`.
`checkCloneProvisioning(rootDir)` (104+) asks git for the common dir of `rootDir`; each hook is projected through the
installer's `planInstall({ rootDir })`, whose hook path comes from `git rev-parse --git-path hooks/<name>`
(`scripts/pre-commit-hook-install.mjs` ~183), which honours a global/host `core.hooksPath`.

Fixture side: `plugins/pipeline-core/hooks/setup-check.test.mjs` `fixtureDir` (49-58) does `git init -q` into a fresh dir (no hooks).
`preflightAt` (326-334) injects `env`, `pluginList`, `read`, `cwd`, `observe`, but not `checkCloneProvisioningFn`. Only
`scripts/pipeline-start-preflight.test.mjs` names that seam; `setup-check.test.mjs` does not.

Reproduction (probe-c, run in the clone, exit 0):
```
DEFAULT-FIXTURE readiness=provisioning-required gate(ready)=hook-provisioning-required
   pre-commit-hook install <fixture>/.git/hooks/pre-commit
WITH-GLOBAL-core.hooksPath ... pre-commit-hook install /nonexistent-probe-hooks/pre-commit
```
(second variant: a process-scoped global git config redirecting the hooks path; the observed location follows git config
outside the fixture root.) Setup-check test run in the clone: exit 1, cases (a)(b)(c) "hook-provisioning-required".

Interpretation: production legitimately observes the hooks of the repository it is pointed at. A fixture can only look
provisioned if the host's git config routes a fresh repo's hooks to a directory that already holds them; I could not read the
host value (guard GG-20 blocks reading that key), so "why green on the host" is a hypothesis, not a measurement.
Not examined: why `pipeline-start-preflight.test.mjs` still fails 8 cases although it uses the seam (some cases may bypass it).

Recommended fix (fixture): inject `checkCloneProvisioningFn` returning a report whose `pre-commit-hook` and `commit-msg-hook`
are `current` into every preflight-invoking fixture (setup-check, attestation, antigravity, pre-push-observation suites),
ideally through one shared helper. None of the named test files is on the TP list.

## Family A (not reached)

Failing assertion: `plugins/pipeline-core/hooks/codex-pretool-guard.test.mjs` line 288 expects
`designStop.nextAction.kind === "architecture-design-required"` right after `intake-generate-apply`.
`plugins/pipeline-core/lib/project-onboarding-v3.mjs` 3480-3499: `observeBootstrapBindAcknowledgement` is wrapped in a
`try`/`catch` (3485) that turns ANY throw into `acknowledgement = null`, which makes `needsAcknowledgement` false.
Lead 1: the same git/private-state read as family B throws inside that call and is silently swallowed. Lead 2: a fresh
environment has no global git identity/config, which `onboarding-init` (`LINE-ENDINGS-GIT-FAILED`) hints at.
Next step: in the clone, call `observeBootstrapBindAcknowledgement` with the fixture root and print the swallowed error.
The function is imported, not defined in `project-onboarding-v3.mjs` (a definition search there found nothing).

## Matrix note

B: git discovery from the root behaves the same on Windows, macOS and consumer repositories (real git repos there), so the
fixture defect is OS-independent; a temp dir inside an enclosing repo or an exported `GIT_DIR` hides it on any OS.
C: `core.hooksPath` (global or per-repo) is honoured on every OS; consumer repos using a managed hooks path get
`install`/`foreign-owner` outcomes by design, so the fixture must not depend on them.
