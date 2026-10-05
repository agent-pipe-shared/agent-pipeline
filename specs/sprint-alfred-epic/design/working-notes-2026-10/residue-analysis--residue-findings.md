# Residue findings, ALFRED-RESIDUE-ANALYSIS-20261004 (read-only analysis)

Labels: `confirmed` = read directly in the cited code line; `hypothesis` = inference not observable read-only.
STATUS: EARLY DRAFT (sections 1 and 3 mostly done; 2 and 4 being extended).

## 1. Producers (what writes blocking residue into `<git-common-dir>/agent-pipeline/`)

### 1.1 Session descriptors (the incident artifact)
- confirmed: `plugins/pipeline-core/lib/worktree-lifecycle.mjs:616-641` `startSessionDescriptor` writes `session-descriptors/active/<id>.json` (path built at :582-585). Default id is `session-<24 hex>` (:618) when the caller passes no `sessionId`.
- confirmed: `ownerRuntime` comes from `localProcessOwnerRuntime()` (:631) which returns `null` unless `process.platform === "linux"` (:556-557, :565-572). On native Windows EVERY descriptor is therefore V2 with `ownerRuntime: null`, and `inspectSessionOwnerRuntime` reports `unavailable` (:686). This is not specific to foreign descriptors; the current session's own descriptor is also permanently `unavailable`.
- confirmed: `discoverRepository` (:254-279) resolves the repo via `git rev-parse --git-common-dir` from the start path and requires basename `.git`. A start path with no `.git` of its own that sits inside the real repo resolves to the real repo and the real private state.
- confirmed: `gitEnvironment` (:109-125) is an ALLOW-LIST (PATH, SystemRoot, SYSTEMROOT, WINDIR, TMP, TEMP, TMPDIR, LANG, LC_ALL, LC_CTYPE) plus fixed config. `GIT_CEILING_DIRECTORIES` and `GIT_DIR` are NOT forwarded to any lifecycle git spawn (`runGit` :127-148 always uses `gitEnvironment(options.env)`). Consequence: a test cannot bound discovery by environment for anything that goes through the lifecycle library; only a real `git init` in the fixture (or a start path outside any repo) isolates it.

Production callers of `startSessionDescriptor` (confirmed by `rg -n startSessionDescriptor plugins harness`):
| Caller | File:line | Id | Notes |
| --- | --- | --- | --- |
| session-cleanup `start` | `scripts/session-cleanup.mjs:617` (after `requireReady` :563) | default unless `--session` | sanctioned entry; ALSO binds the descriptor into State via `bindCleanup` (:620) |
| verify-evidence-producer | `scripts/verify-evidence-producer.mjs:373` `startSessionDescriptor(root)` | default | verify run session |
| verify-journal | `scripts/verify-journal.mjs:229` `startSessionDescriptor(repoRoot, {})` | default | verify run session |
| codex onboarding capability probe | `lib/codex-onboarding-capabilities.mjs:326` | explicit | registers and retires inside one call |
- confirmed: the comment at `scripts/pipeline-start-preflight.mjs:1662-1669` ("exactly one caller") is stale; there are at least four.
- confirmed: tests that call `startSessionDescriptor` directly (all with explicit `sessionId` except where noted): `lib/agy-final-return.test.mjs:267`, `lib/agy-session-dispatch.test.mjs:43`, `lib/codex-onboarding-capabilities.test.mjs:850`, `lib/project-authority.test.mjs:54,250,260`, `lib/project-onboarding-v3.test.mjs:1348,1579,1632,6878`, `lib/session-cleanup-recovery.test.mjs:263..449`, `lib/worktree-lifecycle.test.mjs:385..1063`, `scripts/agy-session-consent.test.mjs:20,53`, `scripts/codex-sandbox-runtime.test.mjs:286`, `scripts/goldfish-antigravity-live-host.test.mjs:110`, `scripts/pipeline-start-preflight.test.mjs:1822..1910`, `scripts/project-authority-migration.test.mjs:24`, `scripts/session-cleanup-binding.test.mjs` (about 40 sites), `scripts/session-cleanup-power.test.mjs:35`, `scripts/session-power.test.mjs:39`, `scripts/verify-journal.test.mjs:404,416,510,561` (DEFAULT id, no sessionId).
- confirmed: none of the four incident-named suites (`lib/signed-quality-package.test.mjs`, `lib/architecture-design.test.mjs`, `lib/trusted-tool-resolution.test.mjs`, `scripts/runner-design-readiness-bootstrap.test.mjs`) nor `hooks/guard-lifecycle-ready.test.mjs` contains a direct `startSessionDescriptor` call (absent from the repo-wide rg result).
- hypothesis (strong): the incident id `session-2c812acd610021b7e849da5f` has the DEFAULT id shape (`session-` + 24 hex). Nearly all direct test calls pass a readable explicit id, so the creator was a default-id caller: session-cleanup `start` without `--session`, verify-evidence-producer, verify-journal, or `verify-journal.test.mjs`. A readable-id test (e.g. `session-hawkeye-01`) is ruled out by shape.

### 1.2 Cleanup bindings (turns an orphan descriptor into a lock)
- confirmed: binding writers are `scripts/session-cleanup.mjs:620` (`start`) and the typed recovery `bind-orphan` in `lib/session-cleanup-recovery.mjs:1165-1175`.
- confirmed: `readyRecoveryPlan` returns `status: "ready"` with `requiresConfirmation: false` (:809-854) and the readiness path AUTO-APPLIES any ready plan (`lib/project-onboarding-v3.mjs:1657-1667`). That function runs on every `inspect` for a local repo with valid continuity (:3150-3160, strict) regardless of intent.
- hypothesis (consistent with every incident observation, not directly observable read-only): the chain was (1) any default-id leak into the real repo, (2) the next `inspect` of ANY intent saw exactly one unbound descriptor and auto-applied `bind-orphan`, binding the real State to the foreign session, (3) every later `inspect --intent session` saw binding `bound` with an active closure (`cleanup-required`, no action). The auto-heal decision of 2026-08-18 (`session-cleanup-recovery.mjs:931-942`) converts a benign leaked file into a State binding that nobody can close.

### 1.3 Temporary intents, resources, manifests
- confirmed: `registerTemporaryIntent` / `finalizeTemporaryResource` are called from `scripts/verify-evidence-producer.mjs:71` and `scripts/verify-journal.mjs:18` (imports) after `startSessionDescriptor`; a cleanup manifest makes `inspectSessionRetirement` return `cleanup-required` (`lib/worktree-lifecycle.mjs:720-722`), which is never retirable without the owner.

### 1.4 Registered worktrees
- confirmed: `lib/signed-quality-package.mjs:345-377` `applyQualityPackage` runs `git worktree add --detach <FIXTURE_TMP>/pipeline-quality-package-* <baseCommit>` (:357) and removes it in `finally` (:375-377, best effort). `FIXTURE_TMP` = `<plugin-root>/tmp` (:14), i.e. `plugins/pipeline-core/tmp` in a source checkout (inside the repo tree). Its `runGit` (:91-92) spawns git with the raw `process.env`, no allow-list, no ceiling.
- confirmed: this file never calls `startSessionDescriptor` or `registerTemporaryIntent` (rg on the file). So `signed-quality-package.test.mjs` cannot create a SESSION DESCRIPTOR through this module. It can leave a registered detached worktree in the real `.git/worktrees` if it crashes or is killed between :357 and :376. That residue is observed by the bootstrap worktree sweep (`registeredWorktreeSweep.retainedCount: 1` in the incident preflight), not by `planSessionCleanupRecovery`.

## 2. Leak paths in tests
(being extended)

## 3. Lock mechanism
- confirmed: `lib/project-onboarding-v3.mjs:3150-3160` calls `partialCleanupRecoveryResult(..., strict: true)` for every local repo with valid continuity.
- confirmed: `partialCleanupRecoveryResult` (:1633-1763) calls `planSessionCleanupRecovery`; a `ready` plan is auto-applied (:1657-1667); otherwise a `nextAction` from `cleanup-required | release-ready | orphan-cleanup-required` is returned as `partial` with code `cleanup_recovery_required` (:1692-1718).
- confirmed: `planSessionCleanupRecovery` returns bare `{status:"cleanup-required"}` with NO `nextAction` for binding `bound` and closure `active` (`lib/session-cleanup-recovery.mjs:1180-1188`). (Compare the `closed-bound` case :1050-1072 which carries a `cleanup` command.) That is exactly the incident's `plan-recovery` output, so binding status was `bound`, not `unbound` (an `unbound` single descriptor would have yielded the auto-applied `bind-orphan`).
- confirmed: only for `intent === "session"` and `cleanup-required` is the missing action replaced with `plan-human-recovery` when at most one descriptor exists (:1695-1702). For any other intent a bare `cleanup-required` yields NO partial (nextAction null, falls through :1762). This is the structural cause of preflight `ready` vs guard `partial` (PF-8): the preflight's own next action is `inspect --intent bootstrap`, the guard requires `--intent session` (`lib/project-onboarding-ready-gate.mjs:312-319` requires an exact intent and exactly one `ready`). With MORE than one descriptor the session intent also falls through with null action (:1699 `<= 1`), an inversion: two residues lock less than one.
- confirmed: `planHumanRecovery` (`scripts/session-cleanup.mjs:106-199`) always offers `retain-and-observe` (no mutation) and offers `attended-host-recovery` (= `release-orphan-binding`) only if EVERY descriptor owner is `not-live` (:161, :174). On win32 the owner is always `unavailable` (`worktree-lifecycle.mjs:686`), so `not-live` is unreachable: dead end by construction. With a target binding, any unrelated descriptor also suppresses it (:146-150).
- confirmed: `inspectSessionRetirement` (`worktree-lifecycle.mjs:708-726`) is `retirable` only when owner is neither `live` nor `unavailable` and no cleanup manifest exists; `inspectExternallyArchivedSession` (:769) treats `unavailable` as `owner-active`. Both exclude the win32 case.
- confirmed: the ready gate (`project-onboarding-ready-gate.mjs:312-400`) fails closed on any lifecycle status other than `ready`, so `partial` locks every mutating entrypoint; the guard additionally narrows the shell lane (incident: `git worktree list` refused).
- hypothesis: `release-orphan-binding` is the only typed release and applies to an orphan (discarded-feature) binding, not to an ACTIVE-feature binding, so even a reachable `attended-host-recovery` would not clear this shape; not verified (no execution allowed).

## 4. Root-fix proposal
(being extended)
