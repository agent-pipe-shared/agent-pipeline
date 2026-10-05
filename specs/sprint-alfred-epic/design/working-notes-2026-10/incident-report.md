# Incident 2026-10-04 evening — session readiness "partial" (cleanup_recovery_required)

- `project-onboarding-v3.mjs inspect --intent session --runner claude` → status `partial`, continuity `unavailable`,
  diagnostic `$.authority.sessionCleanup` `cleanup_recovery_required` ("exact retained cleanup residue blocks
  authority completion"); nextAction `session-cleanup.mjs plan-human-recovery`.
- `plan-human-recovery` → `decision-required`, single candidate `retain-and-observe` (no mutation),
  plan 5875cb35…; no candidate that clears the residue.
- `pipeline-start-preflight.mjs` at the same time → `ready`; registered worktree sweep `retainedCount: 1`.
- While partial, the guard refuses almost everything incl. `git worktree list` and the non-canonical spelling of
  the inspect command; only the canonical `--runner claude` inspect spelling ran.
- Concurrent activity: a scratch-only goldfish (W0-7) running staged guard suites; earlier a full
  `harness/scripts/verify.mjs` run aborted at planning; quality-package `apply` runs create and remove a
  detached `git worktree` under the installed plugin's `tmp/`.
- Hypothesis (unconfirmed): a test or package apply left a registered worktree / cleanup descriptor in the
  real repository's private state. Re-inspect after W0-7 ends.
- ROOT CAUSE FOUND: `session-cleanup.mjs status` → one descriptor `session-2c812acd610021b7e849da5f`
  (sha256 230f70c0…), file `.git/agent-pipeline/session-descriptors/active/session-2c812acd610021b7e849da5f.json`,
  schema v2, createdAt 2026-10-04T17:28:20.168Z, `ownerRuntime: null` (owner unobservable on win32).
  Created during the agents' staged test runs; W0-7 had moved test fixtures under `scratch/w0-7/tmp-fixtures`
  (inside the repo), so fixtures without their own `.git` discovered the REAL repository and wrote into its
  private state. `plan-recovery` → `cleanup-required` without an action; `plan-human-recovery` → only
  `retain-and-observe`. Elephant stopped the running suite (task bx24hgtu7). PO asked to archive the descriptor
  by moving it to `scratch/incident-residue-2026-10-04/` (bytes preserved).
- Root-fix requirements: (1) fixtures never inside the repo tree, Git discovery bounded
  (GIT_CEILING_DIRECTORIES or own `git init`) in every test that spawns Pipeline CLIs; (2) a typed,
  signature-free archive route for a descriptor whose owner is unobservable and older than the session;
  (3) a foreign/test descriptor must not lock the whole session (readiness scoping); (4) preflight and guard
  agree on readiness (PF-8).
- Defect class: preflight `ready` vs guard `partial` (Fable PF-8); recovery plan offers no clearing action
  (dead end, Spec §20.1 "no dead end" / PO decision #15).

# Incident 2026-10-05 morning — recurrence after host crash

- The PO's PC crashed during the full Verify run (task br4jloluo, candidate 6c732455e, started 00:13Z); the run
  never finished. The installed (pre-fix) plugin left descriptor `session-4a4b3cc55b3eaefdac609226`
  (sha256 f62b6fbd…), status `unavailable`; readiness `partial`; `plan-human-recovery` again offers only
  `retain-and-observe` (plan 5875cb35…). Working tree clean, HEAD 6c732455e, no data lost.
- Recovery requested from the PO: move the descriptor to `scratch/incident-residue-2026-10-05/` (bytes preserved).
- Confirms the root fix is still only in source: RF-1 (Verify retires its descriptor on exit) cannot cover a host
  crash; the archive-orphan verbs (package #3 guard admission + installed candidate) are the actual remedy.
- Full Verify on 6c732455e is therefore NOT complete; the candidate report must say so unless it is re-run.

# Defect 2026-10-05 ~05:30Z — candidate 1 installed, live Verify still locks writes (root fix incomplete)

- Installed `0.7.0+claude.20261005050809.dd1fb3ea` (preflight ready). Started full Verify (task bqh79fc0r) on 20c035fd9.
- While it runs: descriptor `session-886584b7b8b438f5dfd1cb45` (sha256 5876a494…, status `unavailable`); session inspect
  → `partial`, `cleanup_recovery_required` on `$.authority.sessionCleanup`, nextAction `plan-human-recovery`.
- Effect: read-only Bash (`git status`) is now admitted, but Write/Edit (incl. memory outside the root) are refused with
  GUARD-LIFECYCLE-NOT-READY. The warn-instead-of-lock (abd404bde/0b9af703a) therefore does NOT cover a LIVE Verify's own
  descriptor on win32 (owner unobservable → treated as residue, not as a running sibling). Same lock class as before,
  narrower blast radius. Needs: a live, own-machine Verify descriptor must never be readiness-blocking (liveness via
  PID/start-time or a Verify-held lock file, not `ownerRuntime`), plus a regression test on win32.
- Consequence for candidate 1: no commits or file writes during the full Verify run; report afterwards.

## Finding 2026-10-05 — native-Windows Verify slowness and v3 DACL failures share one suspected root cause

- PO (chat): full Verify took ~15 min on WSL, target 5–10 min; the >1.5 h native-Windows run is unacceptable → stopped
  (task bqh79fc0r). Its descriptor `session-886584b7b8b438f5dfd1cb45` is refused by `plan-archive-orphan` with
  `WT-ORPHAN-ARCHIVE-AUTHORITY` (it carries resources) → PO move requested again (second dead end of the same class).
- Measurement `scratch/v3run/wt/child-c0-s0.log` (2026-10-04, concurrency 3): almost every v3 case takes 85–95 s
  whether it passes or fails; a few take <1 s. 216 cases, 96 min wall. Failures mostly "private-state directory Windows
  assurance is unavailable or unsafe".
- Code: `plugins/pipeline-core/lib/windows-private-state.mjs` `invoke()` spawns a fresh fixed `powershell.exe`
  (`-NoProfile`, `timeout: 7_000`) for EVERY single-path DACL observation. Hypothesis (to be measured): many such spawns per
  case (~seconds each under load) → ~90 s per case; spawns exceeding 7 s under load → `unavailable` → the 125 failures.
  Probably the same cost in production hooks/guards (slow signing pre-prompt, slow guard calls on Windows).
- Fix directions (measure first): per-process memo of observations keyed by path+identity with invalidation on harden;
  route callers through the existing batch reader (one spawn per call site); a test seam so non-DACL tests do not spawn
  PowerShell; a long-lived PowerShell helper only if the above is not enough. Target: v3 suite and full Verify within the
  PO budget (WSL 5–10 min; Windows target set after measurement).

## Defect 2026-10-05 — guard-dispatch blocks every built-in `Explore`/`Plan` agent (APB-DISPATCH-INVALID)

- Live: two read-only `Explore` dispatches refused with `APB-DISPATCH-INVALID: the Advisor prohibition cannot be assigned to
  one exact child before launch`, with and without the prohibition sentence in the prompt.
- Cause: `plugins/pipeline-core/lib/advisor-prohibition-binding.mjs:23` `normalizedRole()` accepts only
  `^[a-z][a-z0-9-]*$`; Claude Code built-in types `Explore`/`Plan` are capitalised → `null` → line 54 returns `rejected`
  BEFORE the prompt is checked for a prohibition at all.
- Fix: (1) reject an unbindable role only when the prompt actually carries the prohibition (else `not-applicable`);
  (2) accept the host's built-in type names (case-preserving identity, not a lowercase grammar). Regression test with the
  exact live tool_input shapes (`subagent_type: "Explore"`, with and without the prohibition token). Check whether the
  hook file is in the protected baseline (PB-GUARD-HOOKS) → package if so.

## Finding 2026-10-05 — `--test-name-pattern` does not isolate a v3 case

- `project-onboarding-v3.test.mjs` runs its own shard controller (6 children); a name pattern still ran all 216 cases
  (task bos0oe03m, stopped). Cases now take ~110–125 s each; first cases <250 ms. PowerShell hypothesis refuted by
  measurement (single DACL observation ~250 ms, batch of 10 ~280 ms).

## ROOT CAUSE MEASURED 2026-10-05 — v3 per-case ~85 s on native Windows

- `node --cpu-prof scratch/perf/one-case.mjs "a runner without a native runtime readback..."` (one case, in-process, no
  shard load): caseMs 85440. Profile (`scratch/perf/analyze-prof.mjs`): lstat 36.8 s, spawnSync 32.4 s, read/open/fsync
  ~10 s. Every heavy chain: `applyProjectOnboardingV3` → `{commit-msg,pre-commit,pre-push}-hook-install.mjs applyInstall`
  → `git-hook-runtime-snapshot.mjs publishGitHookRuntimeSnapshot/verifyGitHookRuntimeSnapshot` (lines 22/29) →
  `windows-private-state.mjs assessWindowsPrivatePaths` (batch of 64 paths ≈ 5 s per PowerShell spawn).
- Mechanism: each hook install copies the WHOLE plugin tree (894 files, cf. "hook snapshot copy 894/894") into its own
  runtime snapshot and then verifies every file, on win32 including a per-file DACL observation; three hooks per
  onboarding, several onboardings per case. Production impact: slow hook installs/upgrades and any path that verifies a
  snapshot.
- Fix candidates: (1) snapshot only the hook's dependency closure instead of the whole plugin; (2) one content-addressed
  snapshot shared by all three hooks; (3) on win32 harden the snapshot ROOT with a protected, inheriting DACL and verify
  the root (+ reparse-point/ownership walk via lstat) instead of a per-file PowerShell DACL read; (4) single lstat walk.
  Acceptance: one v3 case well under 5 s on native Windows; full v3 suite and full Verify within the PO budget.
  Protected-baseline check needed for git-hook-runtime-snapshot / hook installers.

## Process defects observed 2026-10-05 (to file as backlog items)

- Critic budget mismatch: `templates/prompts/critic-review.md` states a default base cap of ≤24 (+5) under
  `maxTurns: 30`, but guard-dispatch-budget enforces a working cap of 15 (min(24, 30−5−10)); the perf Critic
  (e60a54183/d4dd2a361) went partial because of it. Template and guard must state one number.
- Guard read false positives: `GUARD-READ-SCOPE-OUTSIDE-ROOT` refuses `rg`/`tail` reads whose targets are inside the
  project root (relative and absolute spellings, Elephant and Critic alike); `GUARD-READ-TARGET` refuses Glob/Grep with
  directory targets and Read of a not-yet-existing file.
- Dispatch-record progress log: three goldfish dispatches in a row left `log` empty despite the briefing's mandatory
  per-phase entries.
- Goldfish commit producer failures count against the hard cap (unsorted `--path` → GF-COMMAND-PATH-ORDER), twice
  forcing a hand-composed commit at the cap.

- SERIOUS: the Critic cannot complete a security review under the guard: guard-dispatch-budget enforces base 12
  (min(base, maxTurns 30 − 5 − 10)); guard false-positive refusals consume that budget (5 of 13 attempts in round 2);
  the guard's closing lane admits only dispatch-record writes / git add / git commit, so the Critic's CR-06-D notes write
  is refused → durability duty unfulfillable. Fix: raise the Critic's maxTurns or the safety margin, admit the
  `scratch/dispatch/<own>/critic-notes.md` write in the closing lane, fix the read-scope false positives.
- agent-obligations.md §1 says "No `&&`", but guard-lifecycle-ready admits up to 6 `&&` segments (doc drift).
- Budget-counter lock collision on parallel calls is reported as "repair through the trusted host path" although a
  plain retry works (misleading message).
- My own dispatch defect: the first re-review named base d4dd2a361 instead of the real parent 5b45e9c90 → the Critic
  correctly stopped (ambiguous object). Rule: always derive the base with `git rev-parse <commit>^`.

## Critic round 2 (0d5ed7bef, partial): F1 resolved (9643/9635 ms); F2 resolved in production code (content always
re-hashed; memo skips only the win32 DACL read); F3 partial — new minor finding: the read-count test runs right after
publish while every entry is still "racy", so it does not discriminate a regression to stat-trust for aged entries →
add a ≥300 ms wait before the memo-hit read-count assertion. Coverage-completion Critic dispatched.

## Critic result 2026-10-05 on the snapshot perf fix (partial, pass/fail withheld)

F1 major: AC-1 not met at d4dd2a361 (15279 ms > 12000). F2 minor: in-process memo trusts NTFS-forgeable stat
fingerprints (content and DACL skipped on a memo hit). F3 minor: racy re-hash untested. Rework planned: two full source
passes instead of four (AC-5 kept), memo hit always re-hashes content (removes the racy special case), perf ≤ 12 s,
then a bounded Critic re-check with a budget the guard admits (≤15).

## Classification 2026-10-05 of the two UNPROVEN rows (scratch/perf/classify-{head2,base2}.json, 30 min timeout)

- commit-msg-hook-install: base 3 fail (CMI002, CMI018, CMI021), 724 s; HEAD 2 fail (CMI002, CMI018), 188 s.
- pre-push-hook-install: base 12 fail, 699 s; HEAD 10 fail (subset of base), 160 s.
- Verdict: no regression from e60a54183/d4dd2a361; three base failures turned green; ~4x faster. Remaining failures are
  pre-existing win32 failures (CMI002 mkdtemp with shell-metachar path; "installed hook" cases) for the candidate report.

## Readiness root fix 5b45e9c90 (ALFRED-RDY-20261005) — partial, follow-up RDY2 needed

- Committed: own/foreign descriptor split (`classifyActiveSessionDescriptors`), foreign-only residue → warning on a ready
  result, new `lib/verify-run-record.mjs`, Verify (journal + evidence producer) without descriptor/binding.
- Not verified: fixture-level readiness test (untracked `plugins/pipeline-core/lib/project-onboarding-foreign-residue.test.mjs`,
  host fixture throws private-state-object-unsafe), journal-level test, existing test files of touched modules,
  superseded assertion in project-onboarding-v3.test.mjs ~L1330–1344, dead code in verify-journal.mjs.
- `verify-journal.test.mjs` on 5b45e9c90 (scratch/rdy/verify-journal-test.log): 65 tests, 56 pass, 8 fail (known win32
  baseline was 3). Failing: bounded JSON progress; permissive/symlinked prior run parents; session-less checkout with an
  active descriptor falls back to refusal; failed receipt cannot release new owner; SIGINT releases exact automatic
  owner; suite-created foreign descriptor blocks owner teardown; extra owner resource blocks retention; ALFRED-RF1.
  → RDY2: classify vs parent 2d992c477 (sequential), adapt only assertions that encode the superseded rule (cite the PO
  decision), fix real regressions, run the remaining touched test files, remove dead code, finish or drop the
  untracked fixture test. Then Critic (security/authority row, opus at max, budget ≤15).

## Matrix gap 2026-10-05 in the readiness root fix (PO ground rule: Claude/Codex/agy × Windows/WSL/macOS × own/user repos)

- `PIPELINE_SESSION_OWNER_NONCE` is set by NO runner automatically (only read in project-onboarding-v3.mjs,
  worktree-lifecycle.mjs, session-cleanup.mjs, worktree-create.mjs as a manual option). With 5b45e9c90, "no nonce ⇒
  nothing is own" ⇒ for every runner every descriptor is foreign ⇒ warning only. Descriptor producers in normal
  operation: `lib/codex-onboarding-capabilities.mjs` (Codex), `lib/worktree-lifecycle.mjs` / `scripts/worktree-create.mjs`
  (dispatch worktrees). RDY2 must establish per runner (Claude, Codex, agy) how the requesting session is identified and
  test own vs foreign per runner; POSIX cells via WSL against <mnt>/d (tmp fixtures only); macOS = untested, no host.
  Consumer repos: verify-journal / verify-evidence-producer / readiness ship in the plugin → consumer fixture test.
- Same matrix duty for the snapshot fix: POSIX run of the touched test files from WSL; the win32 DACL batch is win32-only,
  the memo/pass changes are shared code.

## Snapshot fix matrix 2026-10-05 (HEAD 0d5ed7bef)

- AC-1 met on native Windows: one onboarding case 9643 / 9635 ms (baseline 85440).
- Unix via WSL against this checkout (scratch/perf/classify-wsl-snap3.json): fast-verify 12/12, install-snapshot-progress
  4/4, commit-msg-hook-install 22/22, pre-push-hook-install 36/36 — all green.
- Native Windows: fast-verify 16/16; ISP001, CMI002, CMI018 and the 10 "installed hook:" pre-push cases red, all identical
  at parent 20c035fd9 → win32-only pre-existing (R4 platform parity). macOS: untested, no host evidence.
- Runner cells: the snapshot is runner-neutral (git hooks), exercised through the Claude/Codex/agy-neutral installers;
  consumer repos covered by the installer tests' consumer fixtures (no separate runner variance).

## PO decision 2026-10-05 (chat, verbatim "Ja okay mache das so") — root fix for the readiness lock

Approved proposal (precision of the 2026-10-04 "foreign residue only warns" decision):
1. Session readiness evaluates ONLY the own session's descriptor. Foreign descriptors (any producer, live or dead, any
   platform) can never make the session `partial`; they go to a cleanup list that warns and offers archive, never locks.
2. Verify (and other tool runs) no longer create a session descriptor at all; they get their own run record outside
   session management, keeping their own cleanup duty but no influence on session readiness.
Kept: a live second Elephant session in the same repo (EL-18) stays a visible warning via the existing concurrent-session
check, not a lock.
Order: after the current full Verify. RED-first win32 regression (live Verify + foreign residue must not lock), then fix,
Critic review; any protected guard change ships as one signed quality package. Persist this decision into the tracked PO
queue together with the 2026-10-04 evening decisions.
