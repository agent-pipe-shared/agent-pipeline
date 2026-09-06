# NVA-B-LANEEVICT-1: per-signal verdicts for `project-onboarding-v3-tests`

Companion to `backlog/evidence/2026-09-06-onboarding-suite-lane-false-positive.md`
(which established signal (a) at a static/empirical level and explicitly left
(b) and (c) unchecked). This artifact closes all three signals from
`verify-journal.mjs`'s own doc comment (~line 594) and records the resulting
eviction.

## Signal (c) — `.listen(` or a hardcoded-port `listen({ port: … })` shape

**Does not hold.**

`grep -n "listen(" plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`
returns zero matches. No server socket of any kind is opened anywhere in the
8623-line file.

## Signal (b) — a reference to a real production module/helper that writes
under `.git/agent-pipeline/**`

**Textually present, but does not genuinely hold** (no reachable real-repo
write path). The interpretive move: signal (b), like signal (a), is a
heuristic textual flag ("a suite the sweep flags is never proven unsafe, only
plausibly so" — verify-journal.mjs's own doc comment). A strict textual
reading would block eviction; the substantive question — the one "genuinely
holds" is asking — is whether the suite can actually cause one of these
modules to write under the *real* repository's `.git/agent-pipeline/**`,
mirroring exactly how the prior evidence resolved signal (a) (a suite that
invokes `git` is not automatically unsafe if every invocation is fixture-scoped).

References found (textually present, confirming the sweep's flag was not a
false trigger to begin with):
- `project-onboarding-v3.test.mjs:53` — `import { main as sessionCleanupCli } from "../scripts/session-cleanup.mjs"`
- `project-onboarding-v3.test.mjs:54` — `import { run as pipelineStateRun } from "../scripts/pipeline-state.mjs"`
- `project-onboarding-v3.test.mjs:67` (block starting line 65) — `import { cleanupSession, listActiveSessionDescriptors, retireSessionDescriptor, startSessionDescriptor } from "./worktree-lifecycle.mjs"`
- No import of `human-guard-override.mjs`, `nova-candidate-freeze.mjs`,
  `verify-journal.mjs`, `resolveRunsRoot`, or `registerTemporaryIntent`
  anywhere in the file (grepped; only comment-level mentions of
  `human-guard-override.mjs`'s error-code names exist, e.g. line 3044/3047, not
  an import or call).

Every call site of the three imported modules was traced and every one
supplies an explicit fixture root — never the real repository:
- `sessionCleanupCli`: called only via `invokeCleanup`/direct calls that pass
  `--repo <path>` in `args` (e.g. lines 1138, 1157, 5916, 6196), where `path`
  always originates from `root()` (line 105:
  `mkdtempSync(join(tmpdir(), "project onboarding v3 matrix with spaces-"))`).
- `pipelineStateRun`: every call site supplies `dir: path` in its deps object
  (e.g. lines 1408-1413, 3832, 3878, 3943, 4211, 4292, 4474, 4576, 4704), `path`
  again from `root()`.
- `worktree-lifecycle.mjs` functions (`startSessionDescriptor`,
  `cleanupSession`, `listActiveSessionDescriptors`, `retireSessionDescriptor`):
  all called with `path` (a `root()` fixture) as the mandatory first positional
  argument (lines 824, 834, 1055-1059, 1108, 5903).

Confirmed at the production-module entry points that the override is always
honored, i.e. there is no fallback to the real repository once the caller
opts out of the default:
- `pipeline-state.mjs:8064` — `const dir = deps.dir ?? projectDir();` — `dir`
  is used for every subsequent operation in `run()`; since the test always
  supplies `deps.dir`, `projectDir()` (which resolves to
  `CLAUDE_PROJECT_DIR || process.cwd()`, `pipeline-state.mjs:723-726`) is never
  reached from this suite.
- `session-cleanup.mjs:280` — `const repo = required(flags, "repo");` — no
  fallback at all; a missing `--repo` throws rather than silently defaulting to
  the real repository.
- `worktree-lifecycle.mjs:594,806,831,1370` — `startPath`/`fields` are
  mandatory positional parameters (`startSessionDescriptor(startPath, ...)`,
  `listActiveSessionDescriptors(startPath, ...)`, etc.) with no default value.

**Extended check beyond the entry points above** (this is the gap closed on
advisor review before eviction): a spawned CLI subprocess has no access to
in-process `deps` overrides at all, so the safety argument above does not
automatically extend to the suite's real `spawnSync(process.execPath, [...])`
invocations of `pipeline-state.mjs`, `session-cleanup.mjs`,
`guard-devplan.mjs`, `guard-push.mjs`, `verify-evidence-producer.mjs`,
`security-scan.mjs`, `resume-hint.mjs`, and
`observation-governance-bootstrap.mjs`. All such real-subprocess call sites in
the file were located and read individually:
- Every subprocess invocation of a script whose behaviour is cwd-sensitive
  (`pipeline-state.mjs` via `PIPELINE_STATE_SCRIPT`, `session-cleanup.mjs` via
  `SESSION_CLEANUP_SCRIPT`, `guard-devplan.mjs`, `guard-push.mjs`,
  `verify-evidence-producer.mjs`, `security-scan.mjs`) is called with BOTH
  `cwd: path` AND `env: { ...process.env, CLAUDE_PROJECT_DIR: path }` (e.g.
  lines 4192-4200, 4546-4554, 4557-4558, 4563-4564, 4680-4696, 4955-4957,
  6184-6192, 7684 is the one exception addressed next, 7819-7823), so even the
  `projectDir()` fallback described above resolves to the fixture, belt and
  braces.
- `resume-hint.mjs` (invoked at lines 7684 and 7687 with no explicit `cwd`)
  never reads `process.cwd()` at all — `grep -n "cwd" scripts/resume-hint.mjs`
  returns zero matches; it operates purely off its explicit `--root`/
  `--card-file` arguments, both absolute fixture paths in every call.
- `observation-governance-bootstrap.mjs` (invoked at line 7705 with no
  explicit `cwd`) resolves its own `root` exclusively from its mandatory
  `--root` argument (`observation-governance-bootstrap.mjs:11`,
  `resolve(args[1])`) and only spawns a further child with
  `cwd: root` (`observation-governance-bootstrap.mjs:14`) when its own
  in-process check says one is required — never touches the process's
  inherited cwd.

One more hazard class checked and not found: `fakeDeps.readMachinePlane`
exists in this file specifically because some production code paths read the
machine-global `~/.agent-pipeline/machine.json`. `session-cleanup.mjs`,
`pipeline-state.mjs`, and `worktree-lifecycle.mjs` were grepped for
`homedir`/`machine.json`/`machine-plane` — zero matches in all three. None of
the subcommands this suite drives through these three modules touches that
shared, machine-global file.

**Conclusion:** signal (b)'s textual reference is real, but every reachable
write path from this suite — in-process deps AND real spawned subprocesses —
is fixture-scoped. No genuine risk of writing under the real repository's
`.git/agent-pipeline/**` was found.

## Signal (a) — re-verified per the briefing's explicit instruction

**Does not hold**, consistent with the prior evidence artifact's finding, now
re-verified directly rather than trusted:

- All 9 direct `spawnSync("git", ...)` call sites in the test file pass an
  explicit `cwd`: line 117 (`hostGit`'s own implementation, `cwd: rootDir`),
  5049, 5087, 5271, 5277 (`cwd: fresh` or `cwd: path`, both `root()` fixtures),
  5387, 5389, 5391, 5394 (`cwd: path`, plus `env.GIT_CONFIG_GLOBAL` redirected
  to a fixture file so even a global-config read cannot leak in), 7631
  (`cwd: path`).
- `hostGit()` (line 116, used pervasively as the suite's real-git helper)
  itself only ever runs with `cwd: rootDir`, its own required parameter.
- One unmocked, real `child_process` git call was found in production code
  this suite exercises rather than mocks:
  `pre-push-hook-install.mjs:80` (`resolveGitPaths`,
  `execFileSync("git", args, { cwd: rootDir, ... })` — noted explicitly in
  the test file's own comment at line 5145-5146: "real `.git`, real
  `execFileSync("git", ...)`... never routed through the injected
  `fakeDeps`"). Confirmed: in every test that exercises this path (e.g. line
  5148 onward), `rootDir` is always the `root()` fixture (line 5149/5152-5153),
  never the real repository.

## Eviction

`project-onboarding-v3-tests` removed from `SERIAL_LANE_SUITES` in
`plugins/pipeline-core/scripts/verify-journal.mjs`. Diffstat: 1 file changed,
1 insertion(+), 1 deletion(-) — a single list entry removed, nothing else in
the set touched. The doc comment above the set (still reading "derived
MECHANICALLY... reproduced in this comment so the derivation is auditable")
is deliberately left as-is; this eviction is the first manual exception to
that mechanical derivation, and is documented here rather than by hand-editing
the comment.

## Expected wall-clock effect (an expectation, not a measurement — the full
gate was not run per this dispatch's own DoD)

From the prior evidence artifact's numbers: the serial lane summed to 644.9s
against a 645.7s full gate. Removing `project-onboarding-v3-tests`'s 169.6s
leaves the lane at roughly 475.3s. The suite itself (measured here again:
169.6s solo, 164/164 passing, see
`evidence/NVA-B-LANEEVICT-1-onboarding-v3-suite.txt`) moves into the ordinary
8-slot pool, whose prior sum was 1015.2s; adding 169.6s brings the pool sum to
~1184.8s, which spread over 8 slots is ~148.1s of wall clock if perfectly
packed — comfortably under the lane's new ~475.3s, so the lane, not the pool,
remains the binding constraint and the pool absorbing this suite should not
become the new bottleneck. **Expected gate wall-clock saving ≈ 170s** (the
lane no longer waits on this suite serially; the pool's added share is
smaller than the lane time removed). This assumes the pool's other 8 slots
have enough idle capacity to absorb one more ~170s, mostly-idle (per the prior
evidence, "waits on process starts, does not contend for CPU") suite without
becoming the critical path — a reasonable but unverified assumption, since the
full gate was deliberately not run here per the briefing's own instruction
(the orchestrator runs it next as the real proof).
