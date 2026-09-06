# NVA-B-VERIFYLANE-2: per-module scoping audit of the four modules dominating `SERIAL_LANE_SUITES`

Static audit only. No gate run, no code change. Scope: for each of the four
named modules, does every piece of state it reads or writes get scoped by the
caller-supplied repository root (its `--repo` argument, its `rootDir`/`root`
parameter, or an equivalent explicitly-passed path), or does any path resolve
against a process-global source instead (`process.cwd()`, `homedir()`, a
module-level constant, an environment variable, a fixed temp path, or a
hardcoded port)?

**Discriminator used throughout:** a citation counts as disqualifying
("process-global") only when it is the location where the module itself
*reads or writes state* — not every appearance of a process-global API. A
process-global value used purely as a validation/comparison bound against an
already caller-/explicitly-supplied path, with no I/O performed at that
value's own location, does not by itself disqualify a module.

Method: direct reads of each module's own source; `rg` scans for
`process.cwd()` / `homedir()` / `tmpdir()` / `.listen(` / `process.env.` /
module-level path constants; one level of delegate-call verification (does
the audited module's own call site pass its root explicitly, or omit it and
let the delegate's own default fire) per stop condition 2. Suite-to-module
membership was derived by grepping test files for ES `import ... from`
specifiers naming each module's file, plus a supplementary string-literal
grep for spawn-based (non-import) references; this is bounded evidence, not
a full call-graph or dynamic-import trace.

---

## 1. `plugins/pipeline-core/scripts/pipeline-state.mjs`

**Verdict: `process-global`**

Most load-bearing citation, stated first:

- `plugins/pipeline-core/scripts/pipeline-state.mjs:723-726`
  ```js
  export function projectDir() {
    return process.env.CLAUDE_PROJECT_DIR || process.cwd();
  }
  ```
  Resolution source: environment variable `CLAUDE_PROJECT_DIR`, falling back
  to `process.cwd()`. Neither is a `--repo` argument or `rootDir`/`root`
  parameter.

- `plugins/pipeline-core/scripts/pipeline-state.mjs:729`: `export function
  statePath(dir = projectDir())` — every caller that omits `dir` inherits the
  process-global default.
- `plugins/pipeline-core/scripts/pipeline-state.mjs:753`: `export function
  readState(dir = projectDir())` — same pattern on the read path.
- `plugins/pipeline-core/scripts/pipeline-state.mjs:9097-9101` (design
  comment, `materialize-push-threat-model` handler): *"This used to name a
  `--dir` flag. There is no such flag anywhere in this script -- the project
  directory comes from CLAUDE_PROJECT_DIR or the cwd (`projectDir()`)"* — and
  `:9638` repeats the same statement in the file's own usage text. This
  confirms the pattern is not an edge case: **the CLI has no `--repo`/`--dir`
  argument at all**, for any command.
- Doc comment at `:303-306` states the `process.cwd()` fallback is *"the
  normal case for a human/Goldfish running this CLI directly from the repo
  root"* — i.e. this is the intended, documented design, not an oversight.

**Consequence for eviction safety:** a caller that constructs its own `dir`
value and passes it explicitly to `statePath(dir)`/`readState(dir)`/etc. (an
in-process import path) is scoped. The CLI entrypoint offers no equivalent
argument, so a CLI-driven test suite (spawning `node pipeline-state.mjs
<command>`) can only achieve scoping by setting `CLAUDE_PROJECT_DIR` in its
own child process's environment, or by `chdir`-ing that child process before
invocation — **whether the suites currently attributed to this module (below)
actually do so was not audited here**; that is a suite-behavior question,
out of this module-scoping audit's scope, and should not be assumed either
way by a later eviction package.

## 2. `plugins/pipeline-core/lib/human-guard-override.mjs`

**Verdict: `process-global`** (one reachable branch; the module's primary
request/plan/capability storage is otherwise caller-scoped — the two facts
are stated separately below because the briefing's own rule is that even one
disqualifying reference sets the verdict, not that every reference must be
disqualifying)

Most load-bearing citation, stated first:

- `plugins/pipeline-core/lib/human-guard-override.mjs:383-399`
  (`codexMarketplaceRegistry(spawn)`):
  ```js
  result = spawn("codex", ["plugin", "marketplace", "list", "--json"], {
    encoding: "utf8",
    env: { GIT_TERMINAL_PROMPT: "0", LANG: "C", LC_ALL: "C", NO_COLOR: "1",
           PATH: typeof process.env.PATH === "string" ? process.env.PATH : "" },
    maxBuffer: 2 * EXTERNAL_REGISTRY_MAX_BYTES, shell: false,
    stdio: ["ignore", "pipe", "pipe"], timeout: EXTERNAL_REGISTRY_TIMEOUT_MS,
  });
  ```
  No `cwd` option at all. This **reads** external state: the host machine's
  own Codex CLI marketplace registry (a real subprocess call against ambient
  machine/user configuration), not anything under the caller's `rootDir`.
  This is a genuine read of process-global state, not merely a process-global
  value used as a bound — the registry's *contents* (which marketplaces are
  registered, where) are the state being consulted, and it is external to
  every checkout by the code's own design.
- The result feeds `externalLocalMarketplaceLocation()` (`:429-455`) and
  `externalLocalMarketplaceObservation()` (`:457-528`), which go on to read
  further external, non-repo-scoped state: `manifestPath = join(located,
  ".claude-plugin", "marketplace.json")` (`:483`) and a bounded recursive
  tree walk of the external root (`externalPluginSourceTreeSha256`,
  `:315-331`) — all rooted at the registry-reported `located` path, never at
  `rootDir`.
- This is reached whenever `planned.mode === "global-plugin-install"` — a
  real, reachable branch of the module's own primary entry points, not dead
  code: `:947-949` (`isLocalPluginInstall = planned.mode ===
  "global-plugin-install"`), `:2419/2428/2432` (`recordHumanGuardDenial`),
  and `:2622/2626-2627` (`planHumanGuardOverride`). The gate matches this
  repo's own onboarding shape: this is the exact "Pipeline plugin source in a
  source checkout" / `authorCandidate` branch named in
  `templates/prompts/agent-obligations.md` §2.
- By the code's own design comment (`:333-364`), this is *intentionally*
  external to any checkout ("a SEPARATE marketplace root that lives outside
  every checkout") — a deliberate design choice, not an oversight, which the
  briefing itself names as a legitimate, successful outcome to report.

Caveat/contrast, confirming the module is NOT uniformly process-global:

- The module's primary persisted state (requests/plans/capabilities/audit)
  IS caller-scoped: `storage(common)` (`:695-713`) builds every path from its
  `common` argument; every one of its 12 call sites passes `storage(repo.common)`
  where `repo = topology(rootDir, spawn)` (`:2604/2697/3257/3404/3533/3614`,
  etc.). `topology(root, spawn)` (`:175-184`) derives `physical`/`common`
  entirely from its `root` argument via `physicalRoot(root)` (`:168-173`,
  `realpathSync(resolve(root))`) and `git(root, args, spawn)` (`:155-166`,
  `spawn("git", args, { cwd: root, ... })`) — never `process.cwd()`.
- Every exported function's destructured parameter list (`recordHumanGuardDenial`
  `:2402`, `planHumanGuardOverride` `:2590`, `refreezeHumanGuardOverridePlan`
  `:2689`, `prepareHumanGuardOverrideAuthorization` `:2737`,
  `prepareHumanGuardOverrideForSignature` `:2826`,
  `authorizeHumanGuardOverride` `:2918`, `authorizeHumanGuardOverrideBySignature`
  `:3176`, `consumeHumanGuardOverride` `:3373`) requires `rootDir` with **no
  default value** — an omitted `rootDir` is `undefined`, not a silent
  `process.cwd()` fallback.
- Direct `rg` scans for `process.cwd()`, `homedir()`, `tmpdir()`, `.listen(`
  in this file: zero hits. The only `process.env.` reference (`:393`) forwards
  `PATH` into a spawned child's environment so it can find the `codex`
  binary — not a state-path construction.

**Consequence for eviction safety:** the disqualifying reference is a READ,
gated behind one specific mode (`global-plugin-install`), not present in
every code path. An eviction package acting on this finding should check
whether the suites attributed to this module (below) actually exercise that
branch (with real or injected `spawn`) before assuming the risk is live in
each of them — that check was not performed here (would require reading each
suite file, out of this audit's budget).

## 3. `plugins/pipeline-core/lib/worktree-lifecycle.mjs`

**Verdict: `caller-scoped`**

- Every exported function that touches repository state takes `startPath`
  (or `repo`/`primaryRoot`/`repository`, derived from one) as an explicit
  first argument — confirmed across the full exported-function list
  (`:96-1529`): `discoverRepository(startPath, options)` `:251`,
  `createBranchWorktree(startPath, ...)` `:495`,
  `startSessionDescriptor(startPath, ...)` `:594`,
  `loadSessionDescriptor(startPath, sessionId, ...)` `:622`,
  `registerTemporaryIntent(startPath, fields, ...)` `:1074`,
  `finalizeTemporaryResource(startPath, ...)` `:1161`,
  `cleanupSession(startPath, ...)` `:1370`,
  `checkSessionHygiene(startPath, ...)` `:1494`, and 13 more of the same
  shape. None defaults to `process.cwd()`.
- `discoverRepository(startPath, options)` (`:251-269`) derives
  `commonDir`/`primaryRoot` entirely from `startPath`, via `gitText(start,
  [...], options)` (`:147-149`) → `runGit(cwd, args, options)` (`:126-145`),
  which spawns with `{ cwd, ... }` set to the passed-in value explicitly —
  never `process.cwd()`. All session-descriptor/manifest/lock state is then
  addressed under `repo.commonDir` (e.g. `storage`-equivalent paths reached
  from `localRoot(commonDir)` `:397`); write locations were not traced past
  `repo.commonDir` itself but every step from `startPath` to `commonDir` is
  explicit-argument-only.
- One process-global reference found and reviewed, judged non-disqualifying:
  `allowedRootFor()` (`:1043-1060`), `const physicalTmp =
  realpathSync(tmpdir())` at `:1044`. Per the discriminator above: this is a
  **comparison bound**, not a write location — no I/O is performed at
  `physicalTmp` itself. It validates that a caller-declared "scratch-file"/
  "scratch-directory" resource's own path (`fields.path`, threaded from
  `registerTemporaryIntent`'s CLI `--path` argument — an explicitly-passed
  path per the briefing's own definition of caller-scoped) falls inside the
  OS-wide temp root, alongside two sibling boundaries for "verify-run-directory"
  (`repo.commonDir`-derived) and "disposable-worktree" (`repo.primaryRoot`-derived).
  The module never derives a write target from `tmpdir()` on its own
  initiative. `allowedRootFor`'s return value (the chosen boundary) was not
  traced past `:1060` into the actual mkdir/unlink call sites; this is a
  disclosed, bounded gap, not a claim of full transitive proof.
- No module-level path constants found (`rg` for `^const [A-Z_]+ =` /
  `join(` / `resolve(` at file scope: only regexes, `Set`s of category
  names, and `FIXED_GIT_CONFIG` — no filesystem paths).

## 4. `plugins/pipeline-core/scripts/session-cleanup.mjs`

**Verdict: `caller-scoped`**

- `main(argv, env, dependencies)` (`:278`) requires `--repo` via
  `required(flags, "repo")` (`:280`) and threads the resulting `repo` value
  explicitly into every delegate call in the file — no bare/implicit call
  found. Representative sites: `resolveProjectAuthorityPaths({ rootDir: repo })`
  `:542`, `readOnboardingSessionCleanupBinding({ rootDir: repo })` `:478,
  :549`, `planSessionCleanupRecovery({ rootDir: repo })` `:318`,
  `applySessionCleanupRecovery({ rootDir: repo, ... })` `:326`,
  `cleanupSession(repo, {...})` `:562`, `registerTemporaryIntent(repo,
  {...})` `:509`, `finalizeTemporaryResource(repo, {...})` `:521`,
  `sealTemporaryResource(repo, {...})` `:529`, `listActiveSessionDescriptors(repo)`
  `:293/:395/:429`, `loadSessionDescriptor(repo, ...)` `:272/:419`.
- Direct `rg` scan of this file for `process.cwd()`, `homedir()`,
  `tmpdir()`, `.listen(`: zero hits.
- Reviewed module-level path constant, non-disqualifying:
  `plugins/pipeline-core/scripts/session-cleanup.mjs:80-81`, `const HERE =
  dirname(fileURLToPath(import.meta.url)); const SESSION_POWER_SCRIPT =
  join(HERE, "session-power.mjs");`. This locates the module's OWN sibling
  script on disk (a program path, fixed at the file's own install location,
  identical for every invocation) so it can be spawned — it is not a
  location of shared/mutable state, and the spawned child is itself given
  `cwd: repo` (`:146`, inside `sessionPowerCommand`). Flagging it because a
  bare `rg` for module-level `join(` would surface it, and it deserves an
  explicit "reviewed, not a state path" disposition rather than silence.
- One delegate checked per stop condition 2:
  `plugins/pipeline-core/lib/project-authority.mjs` (reached via
  `resolveProjectAuthorityPaths`) declares `rootDir = process.cwd()` as its
  own default parameter on essentially every exported function (`:175,
  :386, :639, :645, :683, :711, :871, :1011, :1095, :1172, :1182, :1294,
  :1347`) — a real process-global pattern in that library. It does not
  disqualify session-cleanup.mjs itself because session-cleanup.mjs's own
  call site always supplies `{ rootDir: repo }` explicitly (`:542`), so the
  default never fires via this module's call graph. Recorded as a caveat:
  if `project-authority.mjs` is ever audited on its own, this is its own
  citation to start from.
- Second delegate touched (bounded, not followed further):
  `plugins/pipeline-core/lib/session-cleanup-recovery.mjs:2091`,
  `resolveRunningWorktreePath(deps)`: `const cwdFn = deps.cwdFn ?? (() =>
  process.cwd());`. Read-only (feeds a "never retire the worktree the sweep
  is currently running from" safety check, per the function's own doc
  comment at `:2078-2089`), and dependency-injectable via `deps.cwdFn`. Not
  traced whether `planSessionCleanupRecovery`/`applySessionCleanupRecovery`
  (the two session-cleanup-recovery.mjs exports session-cleanup.mjs actually
  calls) reach this function at all — going further opens into the sweep
  mechanism's own dependency tree, which is a wider read than this stop
  condition's "one more module" allowance covers. Disclosed rather than
  followed.

---

## Closing section: `SERIAL_LANE_SUITES` membership per module

`SERIAL_LANE_SUITES` (60 members) was parsed directly out of
`plugins/pipeline-core/scripts/verify-journal.mjs:609-629` (the frozen
`Set`), not hand-transcribed. Each suite's file was resolved from its
registration in `harness/scripts/verify.mjs`. Membership per audited module
below was determined by grepping every lane-member test file for an ES
`import ... from` specifier naming the module, plus a supplementary
string-literal/spawn-path grep; this is bounded evidence (one import/spawn
scan), not a full call-graph trace — a suite reaching a module through a
deeper indirection would not be caught.

**39 of the 60 `SERIAL_LANE_SUITES` members touch at least one of the four
audited modules** — confirming the briefing's framing that these four
modules dominate lane membership.

### `pipeline-state.mjs` (process-global) — 20 members, none eligible

`publication-state-authority-tests`, `pipeline-state-tests`,
`po-gate-authority-fixture-tests`, `critical-human-proof-gate-tests`,
`continuity-result-close-tests`, `pipeline-state-inspect-tests`,
`pipeline-state-reopen-design-tests`, `push-prepare-tests`,
`pipeline-state-revocation-tests`, `scripts-pipeline-state-tests`,
`pipeline-state-discard-feature-tests`, `project-onboarding-v3-tests`,
`pipeline-state-approve-push-argv-closure-tests`,
`continuity-result-bootstrap-tests`, `continuity-result-rebind-tests`,
`continuity-result-case-migration-tests`, `pipeline-state-rebind-runner-tests`,
`pipeline-state-inspection-contract-tests`,
`push-release-flow-docs-contract-tests`, `pipeline-state-approve-announce-tests`.

Process-global verdict means none of these become eviction candidates on
this module's account (though several also touch other audited modules).

### `human-guard-override.mjs` (process-global) — 7 members, none eligible

`guard-lifecycle-ready-tests`, `gate-strength-guard-tests`,
`guard-testpath-override-tests`, `repair-map-tests`,
`po-human-approval-tests`, `guard-human-override-tests`,
`human-guard-override-tests`.

**Note for whoever briefs the eviction package:** `human-guard-override-tests`
(44.3s) and `gate-strength-guard-tests` (51.6s) were the two top-5-by-time
lane members VERIFYLANE-1 left unexamined, hoping they might be evictable.
They are now classified `process-global`-tainted by this audit — the
wall-clock win VERIFYLANE-1 hoped for is **not** in the eligible set below.
Do not re-brief expecting otherwise.

### `worktree-lifecycle.mjs` (caller-scoped) — 12 members, 10 eligible on this criterion alone

All 12: `codex-sandbox-runtime-tests`, `po-human-approval-tests`,
`session-cleanup-binding-tests`, `worktree-lifecycle-tests`,
`guard-maintenance-window-tests`, `project-authority-tests`,
`project-authority-migration-cli-tests`, `project-onboarding-v3-tests`,
`session-cleanup-power-tests`, `session-cleanup-recovery-tests`,
`session-power-cli-tests`, `nova-verify-journal-tests`.

Excluded (also touch a process-global module, so NOT eligible despite
touching this caller-scoped one): `po-human-approval-tests` (also
`human-guard-override.mjs`), `project-onboarding-v3-tests` (also
`pipeline-state.mjs`).

Eligible on the four-module criterion alone (10): `codex-sandbox-runtime-tests`,
`session-cleanup-binding-tests`, `worktree-lifecycle-tests`,
`guard-maintenance-window-tests`, `project-authority-tests`,
`project-authority-migration-cli-tests`, `session-cleanup-power-tests`,
`session-cleanup-recovery-tests`, `session-power-cli-tests`,
`nova-verify-journal-tests`.

### `session-cleanup.mjs` (caller-scoped) — 6 members, 5 eligible on this criterion alone

All 6: `session-cleanup-recovery-tests`, `project-onboarding-v3-tests`,
`lifecycle-ready-enforcement-tests`, `session-cleanup-owner-nonce-tests`,
`session-cleanup-binding-tests`, `session-cleanup-power-tests`
(`session-cleanup-power.test.mjs:20,40` spawns `session-cleanup.mjs`'s CLI
directly with `--repo root`, confirmed by reading the spawn call — this
suite does not merely import `worktree-lifecycle.mjs`).

Excluded: `project-onboarding-v3-tests` (also `pipeline-state.mjs`).

Eligible on the four-module criterion alone (5): `session-cleanup-recovery-tests`,
`lifecycle-ready-enforcement-tests`, `session-cleanup-owner-nonce-tests`,
`session-cleanup-binding-tests`, `session-cleanup-power-tests`.

### Union: 12 unique suites eligible on the four-module criterion alone

`session-cleanup-recovery-tests`, `lifecycle-ready-enforcement-tests`,
`session-cleanup-owner-nonce-tests`, `session-cleanup-binding-tests`,
`session-cleanup-power-tests`, `codex-sandbox-runtime-tests`,
`worktree-lifecycle-tests`, `guard-maintenance-window-tests`,
`project-authority-tests`, `project-authority-migration-cli-tests`,
`session-power-cli-tests`, `nova-verify-journal-tests`.

**This is NOT a "safe to evict" list.** It is "eligible on the caller-scoping
question for these four modules alone." Concrete reasons the count is not
the eviction ceiling, named rather than left implicit:

1. **`nova-verify-journal-tests`** imports `worktree-lifecycle.mjs`, but its
   own subject is `verify-journal.mjs` itself — which the original sweep's
   own signal (b) list names explicitly as a module that writes under
   `.git/agent-pipeline/**`. Not clean by that signal; not re-audited here
   (out of this task's four-module scope).
2. **`project-authority-tests`** and **`project-authority-migration-cli-tests`**
   test `plugins/pipeline-core/lib/project-authority.mjs` directly — the
   exact module whose `rootDir = process.cwd()` defaults were flagged above
   as a caveat under `session-cleanup.mjs`. A test suite FOR that module is
   the most likely place that default actually fires. Not audited as its own
   module in this dispatch.
3. **`session-cleanup-recovery-tests`** tests
   `plugins/pipeline-core/lib/session-cleanup-recovery.mjs` directly, which
   has its own `process.cwd()` reference (`:2091`, read-only,
   dependency-injectable). Not audited as its own module here.
4. **Signals (a) and (c) from the original mechanical sweep** (an
   unfixtured `git` child-process call; a `.listen(`/hardcoded-port shape)
   were not re-run for any of these 12 suites in this dispatch — this audit
   answered only the module-scoping question the briefing asked for, not
   the full three-signal safety question the eviction package will need.

Any eviction package built from this list must clear points 1-4 (and ideally
audit `project-authority.mjs` and `session-cleanup-recovery.mjs` as their own
modules) before treating any of these 12 as confirmed safe.
