# NVA-B-LANEEVICT-2: per-signal verdicts for the eight caller-scoping-eligible suites

Companion to `backlog/evidence/2026-09-06-nva-b-verifylane-2-module-scoping-audit.md`
(source of the eligible list) and `backlog/evidence/2026-09-06-nva-b-laneevict-1-signal-verdicts.md`
(method, including the spawned-subprocess trap this dispatch re-applies). Closes
all three of `verify-journal.mjs`'s own sweep signals (~line 594) for the eight
suites named in this dispatch's briefing.

**Budget note up front:** three of the eight (`session-cleanup-binding-tests`,
`guard-maintenance-window-tests`, `worktree-lifecycle-tests`) were fully
assessed against all three signals. The remaining five
(`codex-sandbox-runtime-tests`, `session-cleanup-power-tests`,
`session-power-cli-tests`, `session-cleanup-owner-nonce-tests`,
`lifecycle-ready-enforcement-tests`) were **not** assessed for signals (a)/(b)
— tool budget exhausted. Signal (c) was checked for all eight in one pass (see
below) and does not hold for any of them. The five stay in the lane, reported
as unassessed rather than guessed.

## Signal (c) — `.listen(` or a hardcoded-port `listen({ port: … })` shape

**Does not hold for any of the eight.** `grep -n "\.listen("` across all eight
resolved test files
(`plugins/pipeline-core/scripts/session-cleanup-binding.test.mjs`,
`plugins/pipeline-core/lib/guard-maintenance-window.test.mjs`,
`plugins/pipeline-core/lib/worktree-lifecycle.test.mjs`,
`plugins/pipeline-core/scripts/codex-sandbox-runtime.test.mjs`,
`plugins/pipeline-core/scripts/session-cleanup-power.test.mjs`,
`plugins/pipeline-core/scripts/session-power.test.mjs`,
`plugins/pipeline-core/scripts/session-cleanup-owner-nonce.test.mjs`,
`plugins/pipeline-core/scripts/lifecycle-ready-enforcement.test.mjs`) returns
zero matches.

## 1. `session-cleanup-binding-tests` (26.9s) — CLEARS, evicted

File: `plugins/pipeline-core/scripts/session-cleanup-binding.test.mjs`.

- **(a)** Both direct `spawnSync("git", …)` call sites (`:55` in `fixture()`,
  `:680` in `gitRun()`) use `cwd: root`; `root` is always
  `mkdtempSync(join(tmpdir(), …))`-derived via `fixture()`/`neutralFixture()`
  (`:52-53`, `:75-76`, confirmed at every one of the ~40 call sites grepped).
  One `spawnSync(process.execPath, ["-e", …])` at `:1850` writes a
  fixture-path lock file directly via an inline eval script — no production
  module CLI invoked, so it carries no cwd/env hazard at all.
- **(b)** Textually present via imports of `worktree-lifecycle.mjs` (`:37-45`,
  including `registerTemporaryIntent`), `session-cleanup.mjs`
  (`:46`, `main as sessionCleanupMain`), and `session-cleanup-recovery.mjs`
  (`:27-35`, matches the sweep's `session-cleanup*` pattern). Every call site
  was traced: `sessionCleanupMain` is called only in-process via `invoke()`
  (`:84-91`), whose `argv` always includes `--repo <fixture root>`
  (`session-cleanup.mjs:280` requires `--repo`, no fallback, confirmed in the
  VERIFYLANE-2 audit) — never spawned as a subprocess, so there is no
  cwd/env-inheritance question for this module in this suite at all.
  `registerTemporaryIntent`, `retireSessionDescriptor`, `createDetachedWorktree`,
  `startSessionDescriptor`, `listActiveSessionDescriptors`, `loadSessionDescriptor`
  (worktree-lifecycle.mjs) and `bindScratchDescriptor`, `releaseScratchDescriptor`,
  `planOrphanScratchRetirement`, `retireOrphanScratchDescriptors`,
  `applySessionCleanupRecovery` (session-cleanup-recovery.mjs), plus
  `readOnboardingSessionCleanupBinding`/`planOnboardingKickoff*` (onboarding-continuity.mjs)
  were grepped exhaustively for their call sites: every one supplies
  `root`/`rootDir: root` explicitly, `root` always the `mkdtempSync` fixture.
  `planProjectAuthorityMigration`/`applyProjectAuthorityMigration`
  (`project-authority.mjs`, flagged process-global-by-default in the
  VERIFYLANE-2 audit) are also called only with an explicit `{ rootDir: root }`
  (`:78,80`) — the process-global default never fires from this suite.
- **(c)** Zero `.listen(` matches (see above).
- **Self-race:** run twice concurrently via `capture-evidence.mjs`
  (`evidence/NVA-B-LANEEVICT-2-session-cleanup-binding-selfrace-a.txt`,
  `…-selfrace-b.txt`), both `exitCode: 0`.

**Verdict: evicted.**

## 2. `guard-maintenance-window-tests` (15.2s) — clears all three signals, KEPT (evidence-tooling gap, not a safety finding)

File: `plugins/pipeline-core/lib/guard-maintenance-window.test.mjs`.

- **(a)** Every `execFileSync`/`spawnSync("git", …)` call site uses `cwd: root`,
  `root` from `repoFixture()`/`mkdtempSync` (`:112-113`, `:159`). Two
  fake-spawn wrappers used to simulate a git failure (`:931-936`, `:1256-1260`)
  fall through to the real `spawnSync(command, args, options)` where
  `options.cwd` is inherited from the caller's already-fixture-scoped `root` —
  no independent hazard.
- **(b)** `discoverRepository` (worktree-lifecycle.mjs import, `:36`) is
  called as `discoverRepository(root)` (`:140`), `root` always the fixture.
  `scripts/guard-maintenance-window.mjs` has a `process.cwd()` default in its
  own `parseArgs` (`:123`), but every one of the 5
  `runGuardMaintenanceWindowCli(…)` call sites in the test (`:965, 981, 1098,
  1114, 1120`) explicitly passes `--repo-root root` — the default is never
  reached. `scripts/guard-maintenance-window.mjs:191`'s
  `attributionStoreRoot()` writes under `join(homedir(), ".pipeline", …)` —
  genuinely process-global — but is only reachable via `appendWindowAttribution`,
  gated behind an `--attribution-key-file` CLI flag this suite's own text was
  grepped for (`attribution-key-file`/`attributionKeyFile`) with zero matches:
  a dead path for this suite. The portable ledger-emission call sites
  (`appendWindowDecision` → `appendHumanGovernanceDecision`, `:394-438, :507`)
  all pass `repositoryRoot: repo.primaryRoot`, `repo` derived from
  `repositoryFingerprintFor(rootDir)` where `rootDir` is the fixture — not
  homedir/env/a constant. `pluginTreeSha256(livePluginRoot)` (`:882, :1222` in
  the lib file) is a read-only filesystem hash; `livePluginRoots()`
  (`guard-gate-strength.mjs:344-358`) performs only `existsSync` checks, no
  git call, no write. When driven through the CLI (not the in-process lib
  calls, which the test overrides with a fixture `plugin` value) this reads
  the REAL live plugin tree rather than a fixture, but only ever **reads** it
  — noted as a non-disqualifying observation, validated empirically by the
  attempted self-race run below.
- **(c)** Zero `.listen(` matches.
- **Direct solo run** (`node --test`, no wrapper): **62 passed, 0 failed, exit
  0.**
- **Self-race — could not be captured.** Both concurrent instances were
  launched through `capture-evidence.mjs` and **both were refused before any
  file was written**: `capture-evidence: refused to write -- a surviving
  absolute host path (shape: windows-drive-letter) was found in the assembled
  artifact`. This is a false positive, not a real leak: test `GMW45`'s own
  description string is `"repoFingerprint hashes the /mnt/c/... and C:\...
  spellings of one physical repo to the same value, and two genuinely
  different repos still differ"` — a static, deterministic, purely
  descriptive literal (present identically on every machine, testing WSL/
  Windows path-identity folding) that matches
  `capture-evidence.mjs`'s own `windows-drive-letter` regex
  (`plugins/pipeline-core/scripts/capture-evidence.mjs:120`,
  `/(?<![A-Za-z0-9_%])[A-Za-z]:[\\/][^\s"'<>]*/gu`) exactly like a genuine
  absolute host path would. `capture-evidence.mjs` offers no allowlist/escape
  flag (checked its own usage strings — none exists), and it is outside this
  dispatch's editable scope (only `verify-journal.mjs` is in scope here).

**Verdict: all three static signals clear, and the suite passes on a direct
run — but the DoD's per-suite eviction evidence must be produced via
`capture-evidence.mjs`, and that tool refuses to write for this suite for a
reason unrelated to suite safety. Rather than evict without the required
artifact, or fabricate one, this suite is KEPT IN THE LANE this package.**
This is a found tooling gap (worth a follow-up to `capture-evidence.mjs`
recognizing test-description literals vs. genuine leaked paths, or an
allowlist mechanism), not a re-opened safety question — nothing above
suggests reintroducing this suite's members would race the real repo.

## 3. `worktree-lifecycle-tests` (8.1s) — CLEARS, evicted

File: `plugins/pipeline-core/lib/worktree-lifecycle.test.mjs`.

- **(a)** The suite's own `git(cwd, args, …)` helper (`:65-76`) always spawns
  with `cwd: cwd`, a mandatory parameter, sourced from `repoFixture()` →
  `primary = join(fixture, "repo")` (`:78-84`), `fixture` a `mkdtempSync`
  temp dir. Spy-wrapped `spawnSync` fallbacks used to test timeout forwarding
  (`:927, :938, :950`) pass through `options` (which carries `cwd`) from
  `runGit`/`discoverRepository(primary, …)` — fixture-scoped throughout.
- **(b)** `worktree-lifecycle.mjs` is the module under test itself
  (`:23-47`, including `registerTemporaryIntent`) — every exported function
  used here (`startSessionDescriptor`, `cleanupSession`,
  `createDetachedWorktree`, `registerTemporaryIntent`, etc.) is called with
  `primary` (the fixture) as its mandatory first argument, consistent with
  the VERIFYLANE-2 audit's own caller-scoped verdict for this module, and
  `worktreeCreateMain` (in-process import from `worktree-create.mjs`) is
  always invoked with `--repo primary` (`:654, 662, 673, 682`).
  `session-cleanup.mjs` is spawned as a real CLI subprocess via `nodeCli()`
  (`:102-112`, used at `:639, 644, 645, 771, 776, 777, 790, 807, 809, 832,
  834`) and via two raw `spawnSync(process.execPath, [cleanupScript,
  "cleanup", …common])` calls (`:815, 836`) — **neither `cwd` nor
  `env.CLAUDE_PROJECT_DIR` is set on these two raw calls**, exactly the
  subprocess-scoping trap this briefing calls out. It is immaterial here:
  `common` always includes `"--repo", primary` as an explicit CLI argument
  (`:637, 770, 806, 831`), and `session-cleanup.mjs:280`
  (`required(flags, "repo")`) has no `process.cwd()` fallback at all — a
  missing `--repo` throws rather than silently defaulting to the real
  repository (confirmed directly and independently in the VERIFYLANE-2
  audit). Since `--repo` is always present and mandatory-no-fallback, the
  absent `cwd`/`env` override cannot leak into the real repository.
- **(c)** Zero `.listen(` matches.
- **Not one of the two largest** — no self-race required per the briefing;
  static verdict decides. Solo run captured (see evidence below).

**Verdict: evicted.**

## Suites NOT assessed (budget) — stay in the lane

`codex-sandbox-runtime-tests`, `session-cleanup-power-tests`,
`session-power-cli-tests`, `session-cleanup-owner-nonce-tests`,
`lifecycle-ready-enforcement-tests`. Only signal (c) was checked (zero
matches, see above); signals (a) and (b) were not evaluated for these five —
this dispatch ran out of tool budget before reaching them. They remain in
`SERIAL_LANE_SUITES` unchanged. A follow-up package should assess them the
same way this one assessed the other three.

## Eviction

Two suites removed from `SERIAL_LANE_SUITES` in
`plugins/pipeline-core/scripts/verify-journal.mjs`:
`session-cleanup-binding-tests` and `worktree-lifecycle-tests`. Diffstat: 1
file changed, 2 deletions(-), 0 insertions(+) (net two fewer entries in the
same frozen `Set` literal; nothing else in the set, and no other part of the
file, touched). `guard-maintenance-window-tests` was assessed and clears
every signal, but is **not** evicted this package for the tooling-gap reason
stated above.

## Expected wall-clock effect (an expectation, not a measurement — the full
gate was not run per this dispatch's own DoD)

Evicted this package: `session-cleanup-binding-tests` (26.9s) +
`worktree-lifecycle-tests` (8.1s) = **35.0s** removed from the lane. Against
the 482.5s gate figure given in the briefing, that is ≈7.3% of the gate.
Following the same reasoning as LANEEVICT-1: the lane drops from ~475.3s
(after LANEEVICT-1's eviction) to ~440.3s; the two evicted suites move into
the ordinary 8-slot pool, adding 35.0s of pool work, which spread over 8
slots is ~4.4s of wall clock if perfectly packed — far under the lane's new
~440.3s, so the lane remains the binding constraint and the pool absorbing
these two suites should not become the new bottleneck. **Expected gate
wall-clock saving ≈ 35s**, well short of the 56.6s ceiling named in the
briefing because `guard-maintenance-window-tests` (15.2s) was not evicted
this round and five suites (11.9s combined) were not assessed. This assumes
the pool's other slots have enough idle capacity to absorb ~35s of
mostly-idle work without becoming the critical path — unverified, since the
full gate was deliberately not run here (the orchestrator runs it next as the
real proof).

If `guard-maintenance-window-tests` is evicted in a follow-up once the
evidence-capture gap is resolved, and the five unassessed suites all clear,
the ceiling stated in the briefing (56.6s / ~11.7%) remains reachable — none
of what this dispatch found closes off eviction for the other five; it only
did not reach them.
