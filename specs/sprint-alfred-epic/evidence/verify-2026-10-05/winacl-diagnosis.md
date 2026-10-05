# WINACL: why onboarding fixtures on native Windows fail `private-state-object-unsafe`

Dispatch WINACL, ruleset `0.7.0+claude.20261005202045.7170ed20`, candidate `612e6c5ff`. Diagnosis only: no source or test edit,
no ACL change outside the probes' own temp directories. Independent review: pending.

## Verdict

**Production defect (a private-state writer that does not harden), exposed by the fixtures. Not an assurance bug, not environment.**
The assurance is doing what its policy says: on native Windows the private directory may carry an ACE for the concrete current
principal only. A directory that `mkdirSync(..., { mode: 0o700 })` creates under a user profile or temp folder inherits SYSTEM,
Administrators (and on this host two Codex-sandbox ACEs), so it is "insecure" by design. The fixture reaches that state because the
production pre-push-hook installer, which onboarding runs during `apply-portable-seed`, creates `.git/agent-pipeline` with a plain
recursive `mkdirSync` and never calls `hardenWindowsPrivateDirectory`. The later `intake-capture-apply` then *assesses* that
pre-existing directory (`created=false` branch) instead of hardening it, and refuses it. The real repository passes because its
`.git/agent-pipeline` carries a hardened DACL (protected, current user only; measured). Which writer hardened it was not traced
(inference: a hardening writer such as `po-gate-profile-publisher.mjs` created it first).

## What the assurance inspects (file:line)

- Throw site: `plugins/pipeline-core/lib/codex-onboarding-runtime.mjs:92-104` (`windowsAssurance`). Status `"insecure"` maps to
  `private-state-object-unsafe` (line 99); `"unavailable"` would have been `private-state-assurance-unavailable`. The observed code is
  the former, so PowerShell availability, `windowsHide` and the 7 s timeout are ruled out: the native read succeeded.
- Call that fails: `assurePrivateDirectory(cursor, false, fs)` for an existing directory, `codex-onboarding-runtime.mjs:270-275`
  (call at 274). A directory created inside the same transaction is hardened instead (`ensurePrivateDirectory`, lines 204-216).
- Mechanism: `plugins/pipeline-core/lib/windows-private-state.mjs:119-131` runs the fixed system `powershell.exe` (lines 14-17)
  with `OBSERVE_SCRIPT` (58-66: `Get-Acl` owner, DACL principals, reparse flag).
- Policy: `windows-private-state.mjs:44-56`; any principal other than the current user fails (lines 52-54).
- Hardening counterpart: `windows-private-state.mjs:68-78, 230-234` (`SetAccessRuleProtection($true,$false)`, owner and a single
  FullControl rule for the current user).
- The missing hardening: `plugins/pipeline-core/scripts/pre-push-hook-install.mjs:716` in `applyInstall`
  (`mkdirSync(snapshotState, { recursive: true, mode: 0o700 })`, `snapshotState = <common>/agent-pipeline/pre-push-hook`). Same
  statement shape at lines 702 and 728. Reached from `applyProjectOnboardingV3` (`plugins/pipeline-core/lib/project-onboarding-v3.mjs`,
  about 6128-6142). Writers that do it right, for comparison: `po-gate-profile-publisher.mjs:118`, `verify-journal.mjs:134`,
  `release-version-plan.mjs:231` (`existed ? assess : harden`).

## Probe output (redacted, 8 lines)

```
fresh mkdtemp dir      : status=insecure owner=CURRENT protected=False ACEs=[CodexSandboxUsers, unresolved-SID, SYSTEM, Administrators, CURRENT] all inherited
.git/agent-pipeline    : created by mkdirSync(0o700) -> status=insecure (non-owner principal in DACL)
same dir, hardenWindowsPrivateDirectory -> secure, principals=[CURRENT]
real .git/agent-pipeline            : status=secure principals=[CURRENT] (read-only metadata observation)
real .git/agent-pipeline/onboarding : status=secure principals=[CURRENT]
fixture replay (seed, init, commit, inspect): .git/agent-pipeline status=insecure after every step
fixture replay intake-capture-apply : exit=2 private-state-object-unsafe: private-state directory Windows assurance is unavailable or unsafe
mkdir trace during apply-portable-seed: applyInstall -> mkdirSync(<common>/agent-pipeline/pre-push-hook, recursive, mode 0o700), no harden
```

Supporting facts: `os.tmpdir()` equals `%LOCALAPPDATA%\Temp`; that folder carries two explicit (non-inherited) Codex-sandbox ACEs which
every temp child inherits, but the parent profile folders already hand SYSTEM and Administrators FullControl by inheritance, so the
failure does not depend on Codex being installed. Raw outputs: `scratch/WINACL/probe-output.txt`, `probe2-output.txt` (git-ignored, not durable).

## Fix proposal (4 sentences)

In `pre-push-hook-install.mjs` `applyInstall` (and the same-shaped statements at 702/728), on `win32` create the missing
`agent-pipeline` and `pre-push-hook` directories one level at a time and call `hardenWindowsPrivateDirectory` on each one this call
created (assess when it already existed), failing closed unless the result is `secure`, exactly as `po-gate-profile-publisher.mjs:118`
does. Check `pre-commit-hook-install.mjs` and `commit-msg-hook-install.mjs` for the same recursive-mkdir pattern and fix them in one
pass. Add a Windows-gated test that runs the installer in a fresh temp repo and asserts `assessWindowsPrivatePath(<common>/agent-pipeline)`
is `secure`. A fixture-only workaround (harden `.git/agent-pipeline` after seeding, as `critic-packet-preflight.test.mjs:80` and
`po-gate-authority.test.mjs:88` already do) would turn the 28/37 and ~40 tests green but hide the production gap, so it is not recommended.

## Protected-path status of the files the fix would touch

None of `pre-push-hook-install.mjs`, its sibling installers, or their tests match `TP-1`..`TP-13`, so they are ordinarily editable. They
are guard-surface code (hook installers), so the fix is guardrail-class work: route it to a `goldfish-deep` dispatch with an independent
Critic review (the applicable trigger row was not computed here).

## Matrix

Windows-specific by construction (`codex-onboarding-runtime.mjs:107-113`). Linux/macOS take the POSIX branch (`mode & 0o777 === 0o700`),
where `mkdirSync(..., { mode: 0o700 })` already satisfies the check, so the defect cannot show there. Runner identity (Claude/Codex/agy)
is irrelevant to the root cause; own-repo versus user-repo is irrelevant as long as the installer runs before any hardening writer.

## Caveats and open items

- Reproduced the exact error by replaying `createReadyLifecycleFixture` steps 210-258 of `codex-pretool-guard.test.mjs` in a probe, not by
  running the 37-case suite; the ~40 `project-onboarding-v3.test.mjs` failures are inferred to share the cause (same `intake-capture-apply`
  path), not individually confirmed.
- Not verified: whether the fix alone makes the later steps of the fixture pass (no source edit was allowed); whether other writers under
  `<common>/agent-pipeline` also create plain directories that a later `created=false` assessment would reject.
- The traced stack frames read `pre-push-hook-install.mjs:668/669`, while the working-tree statement is at 716/717 (same statement shape,
  same call chain); the 48-line offset is unexplained and was not chased. Line numbers above are the working-tree ones.
- The real repository's `.git/agent-pipeline` ACL was read as metadata only (Get-Acl); nothing was written there.
