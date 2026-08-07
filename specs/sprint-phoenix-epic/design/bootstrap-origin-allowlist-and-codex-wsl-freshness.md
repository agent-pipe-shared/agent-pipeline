# Bootstrap origin-allowlist and Codex-under-WSL freshness boundary — design

Owner: Pipeline maintainers. Status: DESIGN ONLY — no `.mjs`/`.json`/`.yaml` file was
changed to produce this document; every claim below was checked against the real files on
this branch (commit `cbf3050` and descendants), not inferred from the backlog items alone.
Companion backlog items:
`backlog/items/2026-08-07-self-application-integrity-check-absent.md` (Part A) and
`backlog/items/2026-08-07-ruleset-freshness-wsl-subsystem-absent.md` (Part B). Both record
binding 2026-08-07 PO decisions that this design does not re-litigate; see each item's
Triage section for the exact wording.

This design covers two related, independently shippable repairs. Part A changes the
bootstrap readiness gate's `status` semantics (blast radius: every session, every project,
on the next plugin refresh). Part B repairs a Codex+WSL-only advisory freshness path (blast
radius: Codex-under-WSL sessions only, and only in the direction "was `unknown`, may now
resolve"). They share one document because they were investigated together and because
Part B's pre-merge implementation imported from Part A's pre-merge implementation, but they
are two separate implementation dispatches and two separate Critic reviews.

**A verification note up front, because the lesson from this same session's WP5 review was
about unverified primitive claims:** the backlog items and PO decisions state that
`public-core-observation.mjs`/`ruleset-source.mjs` are "already proven safe in production
use" via `private-overlay-activation.mjs:230,573` and
`private-overlay-bootstrap-status.mjs:49`. Checked directly (`grep -rn
"normalizeRulesetSource\|compareLoadedRulesetIdentity" --include="*.mjs" plugins/`): that
claim is accurate for `observeCodexPublicCoreIdentity`/`observePublicCoreIdentity`, which
those three call sites do invoke — but **`normalizeRulesetSource` and
`compareLoadedRulesetIdentity` have zero production callers on main today.** Their only
caller anywhere in the tree is their own test file, `ruleset-source.test.mjs`. This does not
block following the PO decision (the decision names `normalizeRulesetSource` as an existing,
unchanged, reusable primitive, which is true), but Part A below is the **first production
call site** for it, not a revalidation of an already-proven one. This is stated explicitly
rather than silently smoothed over — see §1.3.

---

## Part A — self-application / public-marketplace-origin allowlist

### A.1 What guarantee is being restored

Concretely: **the plugin code a session is about to trust at bootstrap is byte-identical to
a clean checkout of one of the two reviewed Public-Core origins** —
`https://github.com/agent-pipe-shared/agent-pipeline.git` or
`git@github-public:agent-pipe-shared/agent-pipeline.git` — or, for local development, to the
verified self-application layout. Without this check, `observePipelineStartPreflight`
currently only compares version *strings* (`version` read from the loaded manifest vs.
`installedVersion` read from the host's plugin list, `pipeline-start-preflight.mjs:211-215`)
— it has no opinion on where those bytes actually came from, whether the working tree is
dirty, or whether the manifest was hand-edited without touching the version string. A forked
or locally altered marketplace clone with a matching version string currently passes
readiness undetected.

Verified byte-identical constant for the allowlist (pre-merge
`plugins/pipeline-core/lib/codex-host-plugin-list.mjs:21-24` at commit `998a609`):

```
PUBLIC_MARKETPLACE_URL = "https://github.com/agent-pipe-shared/agent-pipeline.git"
PUBLIC_SELF_APPLICATION_ORIGINS = { PUBLIC_MARKETPLACE_URL, "git@github-public:agent-pipe-shared/agent-pipeline.git" }
```

### A.2 Exact integration point

`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`, function
`observePipelineStartPreflight()` (current main, lines 172–255). Concrete anchors, verified
by reading the current file, not the pre-merge one:

- `pluginRoot` is resolved at line 180 (`resolve(dirname(fileURLToPath(scriptUrl)), "..")`)
  — this is exactly `<clone>/plugins/pipeline-core`, matching the directory-layout
  requirement `resolveSourceLayout()` enforces in `public-core-observation.mjs:87-97`
  (`basename(source.path) === "pipeline-core"`, `basename(pluginsRoot) === "plugins"`).
- `runner` is resolved at line 190 (`env.CLAUDECODE === "1" ? "claude" : "codex"`) —
  computed *before* the identity read, exactly as the comment on lines 181-189 already
  requires for every runner-dependent read in this function.
- `version` (loaded manifest version) is resolved at lines 192-200.
- `status` is currently decided at lines 211-215 from `version`/`installedIdentity`/
  `installedVersion` only.

The new step belongs **between** the `version`/`installedIdentity` reads (line ~203) and the
`status` decision (line 211): observe the origin/content identity of `pluginRoot`, then let
a negative result widen the existing `status` ternary (see §A.5) rather than replacing it.

### A.3 What is reused vs. new

**Reused, unchanged, calling-convention-matched:**

- `observeCodexPublicCoreIdentity` / `observePublicCoreIdentity` from
  `plugins/pipeline-core/lib/public-core-observation.mjs` (378 lines, read in full; no
  change needed to this file).
- `normalizeRulesetSource` from `plugins/pipeline-core/lib/ruleset-source.mjs` (154 lines,
  read in full; no change needed to this file).
- The exact runner-branch calling pattern already established in
  `plugins/pipeline-core/scripts/private-overlay-activation.mjs`: `main()` defaults to
  `observe: deps.observe ?? observePublicCoreIdentity` (line 230); `mainCodexHost()`
  overrides with `observeCodexPublicCoreIdentity` (lines 569-578). Part A's design mirrors
  this exactly: `runner === "codex"` → `observeCodexPublicCoreIdentity`; `runner ===
  "claude"` → `observePublicCoreIdentity`. No third branch, no new runner concept.
- Call shape: `observe({ sourcePluginRoot: pluginRoot, installedPluginRoot: pluginRoot },
  {})` — self-referential (loaded root IS the root being attested), which `observe()`
  already special-cases at `public-core-observation.mjs:334-336` (`installed = ... ===
  layout.sourcePluginRoot ? source : snapshotPluginRoot(...)`, avoiding a second directory
  walk).

**New, and why it cannot be avoided by reuse alone:**

1. **The origin-allowlist constant + comparison itself.** Neither
   `public-core-observation.mjs` nor `ruleset-source.mjs` hard-codes the two specific
   Public-Core URLs anywhere — `public-core-observation.mjs`'s `validRepository()` (lines
   132-150) accepts *any* syntactically well-formed credential-free `https`/`git@` origin,
   not just the two reviewed ones. The literal 2-entry allowlist Set and the ~5-line
   comparison of `observation.candidate.repository` against it must be declared fresh (in
   `pipeline-start-preflight.mjs`, or a small new shared constant module) using the same two
   literal values verified in §A.1 — reusing the *values*, not the retired *module*.
2. **The shaping code that builds a `pipeline.ruleset-source.v1` object and calls
   `normalizeRulesetSource` on it.** No existing helper does this today; pre-merge, this
   shaping lived entirely inside the now-retired `observeCodexRulesetSource`
   (`codex-host-plugin-list.mjs:204-271` at `998a609`). Because `sourcePluginRoot ===
   installedPluginRoot` by construction in this self-referential call, `loadedIdentity` and
   `installedIdentity` fed into `normalizeRulesetSource` are necessarily equal — see the
   open question in §A.4.

**Explicitly not revived:** the ~270-line plugin-list-parsing/`sourceClass`-computation
machinery from pre-merge `codex-host-plugin-list.mjs` (`selectedPluginRecord`,
`observedPluginRecord`, `classifyGitMarketplaceSource`, `safeMarketplaceSource`,
`observeCodexRulesetSource`, `PUBLIC_SELF_APPLICATION_ORIGINS`) — all of it is superseded by
reusing `observeCodexPublicCoreIdentity`, which already performs an equivalent (and
independently tested) host-list re-read via `observeSelectedCodexPipelinePlugin` (the
*current*, non-retired export of `codex-host-plugin-list.mjs`, confirmed present at 151
lines) plus its own internal `SNT-A2-CODEX-HOST-MISMATCH` check
(`public-core-observation.mjs:327-329`).

### A.4 Open question flagged for the PO (Part A's most important one)

Because `observeCodexPublicCoreIdentity`/`observePublicCoreIdentity` already enforce
`sourcePluginRoot === installedPluginRoot` bit-identity by construction when called
self-referentially, feeding their output through `normalizeRulesetSource`'s
loaded-vs-installed comparison is **tautological in this exact calling pattern** — it can
only ever report `"ready"` or reject on schema/shape grounds, never a genuine
loaded-vs-installed *mismatch*, because there is only one observed root, not two
independently sourced ones. `normalizeRulesetSource` therefore functions here as a
schema-closure/validation pass, not a second independent identity source.

**Question for the PO:** is that acceptable (the real guarantee comes entirely from
`observeCodexPublicCoreIdentity`'s host-path attestation + clean-git-state + content-hash
match, and `normalizeRulesetSource` is exercised only for its schema closure and to
establish it as a genuine production caller — see the verification note up front), or does
the PO want a *second*, independently sourced installed-identity observation (e.g. calling
`observeSelectedCodexPipelinePlugin` directly for its own path/version, independent of what
`observeCodexPublicCoreIdentity` re-derives internally) so `normalizeRulesetSource`'s
comparison carries real information? The second option is more expensive (an extra host
round-trip) for a guarantee that is largely redundant with `SNT-A2-CODEX-HOST-MISMATCH`. This
design recommends the first (simpler) option but does not treat the choice as its own to
make silently.

### A.5 Failure mode

1. **Negative attestation result** (origin not in the allowlist, dirty git tree,
   `SNT-A2-*` rejection of any kind, or `normalizeRulesetSource` returning any non-`"ready"`
   status): fold into the **existing** `"plugin-refresh-required"` branch of `status`
   (`pipeline-start-preflight.mjs:213-214`) — do **not** invent a new hard-fail status. This
   exactly matches pre-merge precedent: `!sourceVersionBound` folded into the identical
   branch at pre-merge `pipeline-start-preflight.mjs:154` (`998a609`).
   `pipelineStartPreflightExitCode` (current main, lines 257-259) already treats
   `"plugin-refresh-required"` as exit `0` — this failure class is soft/advisory on day one.
2. **The check cannot run at all** (missing `git` binary, non-git flat-copy install, an
   unhandled exception inside the observer): both `observeCodexPublicCoreIdentity` and
   `observePublicCoreIdentity` already fail closed *internally* — every code path returns
   `{status: "rejected", reasonCodes: [...]}` inside a top-level `try`/`catch`
   (`public-core-observation.mjs:323-357`, `:368-377`); neither function is documented or
   observed to throw for an expected failure. A "rejected" observation is therefore just
   case 1 again, not a separate branch.
3. **Explicit non-goal for this design:** the check must not, on first ship, newly produce a
   *hard* block (`"plugin-identity-unavailable"`, exit `2`) — see the migration note (§A.6)
   for why.

### A.6 Migration/rollout note

**Today, before this ships:** `status` is decided from `version`/`installedIdentity`/
`installedVersion` only (lines 211-215) — no origin/content attestation exists in the
ordinary bootstrap path at all. Every session that currently reports `"ready"` continues to.

**The first session that bootstraps after this ships:** the origin/content attestation runs
in production, ordinary-bootstrap context, for the first time (previously it only ran on the
private-overlay path, which is opt-in and much less traveled). The specific unverified
assumption this design inherits, not independently re-checks: that a real marketplace-git
install (not just local-development) preserves a `.git` directory at exactly
`<clone>/plugins/pipeline-core` with the expected layout — this is *assumed* to hold because
`observePublicCoreIdentity`/`observeCodexPublicCoreIdentity` are the same primitives already
running in the private-overlay path in production, not because this design re-verified it
against a real marketplace install topology.

Given that unverified assumption and §A.5's choice (fold into the existing, already-soft
`"plugin-refresh-required"` branch rather than a new hard status), the worst realistic
day-one outcome is a previously-silent "please refresh your plugin" advisory newly appearing
on some sessions — never a new bootstrap failure, and never a new exit-code-2 case. This
mirrors the *shape* of WP5's rollout choice (`specs/sprint-phoenix-epic/design/phx-2-additive-ledger-authority.md`
§5: soft-launch before hard enforcement) even though the mechanism differs — WP5 used an
opt-in `pipeline.user.yaml` key because its blast radius was zero-populated-ledgers-on-day-one;
Part A instead reuses an already-existing soft status branch, because DoD constrains this
design to reused primitives and minimal new surface, and because every session everywhere
hits this path immediately (a config-gated rollout would need its own new config key, which
this design deliberately avoids adding).

**Flagged for the PO (secondary to §A.4):** is "soft/advisory on day one, hard block only as
a later follow-up once observed clean across real installs" an acceptable reading of "fail
closed, consistent with established convention" for this specific gate — or does the PO want
day-one hard enforcement, accepting the regression risk against the untested assumption
above?

### A.7 Explicitly out of scope (Part A)

- Reviving `codex-host-plugin-list.mjs`'s retired API surface
  (`observeCodexRulesetSource`, `PUBLIC_SELF_APPLICATION_ORIGINS`) — explicitly forbidden by
  the PO decision; superseded per §A.3.
- A Claude-Code-side equivalent of `observeSelectedCodexPipelinePlugin`'s host-path
  attestation. Main's Claude path (`installedPipelineIdentityClaude`,
  `pipeline-start-preflight.mjs:131-150`) has no analogous "the host itself independently
  confirms this exact path is currently selected" guarantee — `observePublicCoreIdentity`
  alone doesn't provide it either. A Claude-side session's origin-allowlist check is
  therefore inherently weaker on the host-attestation dimension than Codex's. Closing that
  specific gap, if wanted, is a separate design.
- Promoting the failure mode from soft (`"plugin-refresh-required"`) to a new hard status —
  left as an explicit, PO-gated follow-up per §A.6.
- Any change to `.claude/settings.json`, `.codex-plugin/plugin.json`, or any other
  guardrail/config surface.

---

## Part B — Codex-under-WSL freshness boundary

### B.1 What guarantee is being restored

On a Codex session running **inside WSL specifically** — where an ordinary sandboxed `git
ls-remote`/`fetch` against the public marketplace is known to fail on a DNS-limited network
path — the plugin-update-availability check
(`inspectPipelineUpdateAvailability` in `ruleset-freshness.mjs`) can complete a genuine,
App-Server-attested read of the public marketplace instead of unconditionally degrading to
`status: "unknown"` on every single Codex+WSL session, as it does today (confirmed: main's
`inspectPipelineUpdateAvailability` has no host-boundary delegation of any kind — it always
calls `spawnSync` directly, per `run()` at lines 38-46, unless a caller overrides
`options.spawn`, which nothing on main currently does). The read stays attested through the
Codex App-Server's own control-channel identity (`observeCodexAppServer`/
`hostControlBinding`) and executed via a literal, sterile `/usr/bin/git` invocation from `/`
with a closed environment — consistent with the threat model's existing "ambient PATH/config
retargets the reviewed public read" mitigation
(`docs/phoenix-governance-threat-model.md:33`).

### B.2 Exact integration point

Two concrete anchors, both verified against the current file, not assumed:

**(a) The scoping bug, independent of the import-chain break.**
`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`, lines 208-210:

```
const wsl = [env.WSL_DISTRO_NAME, env.WSL_INTEROP]
  .some((value) => typeof value === "string" && value.trim() !== "");
const executionBoundary = wsl ? "host-authorized-wsl" : "default";
```

This computes `executionBoundary` from WSL presence **alone**, not from `runner` (computed
two lines above, at line 190, but never referenced here). Verified against pre-merge
(`998a609`, lines 149-151): the same, equally runner-blind computation existed
pre-merge too — this is not a merge regression, it is a pre-existing bug this design also
repairs while it's in scope. Fix: `const executionBoundary = wsl && runner === "codex" ?
"host-authorized-wsl" : "default";`.

**(b) The freshness read itself.**
`plugins/pipeline-core/scripts/ruleset-freshness.mjs`, `inspectPipelineUpdateAvailability`
(lines 281-379). Its network-touching calls already flow through an injectable seam —
verified by reading `run()` (lines 38-46: `(options.spawn ?? spawnSync)(command, args,
{...})`) and confirming every call site passes `options` through: `selectedChannelTarget`
line 185, the bare-repo `init` at line 315, the `fetch` at line 333, `readMarketplaceVersion`'s
`show` at line 244. **`options.spawn` is an existing, already-present extension point on
main — no new parameter needs to be added to `inspectPipelineUpdateAvailability` itself.**
The repair's integration point is supplying a WSL-host-attested `spawn` implementation as
`options.spawn` from the CLI entrypoint (`runPipelineUpdateAvailabilityCli`, lines 428-437)
precisely when the corrected condition in (a) holds.

### B.3 What is reused vs. new

**Reused, untouched:** `PIPELINE_UPDATE_AVAILABILITY_SCHEMA`/`inspectPipelineUpdateAvailability`'s
entire orchestration model — channel resolution, tag selection, disposable-bare-repo fetch,
policy disposition. The deprecated alias `inspectRulesetFreshness` (line 382) is untouched
and nothing in this design defines a second symbol under that name — confirmed no collision.
`options.spawn` (lines 38-46) is the reused seam, not a new one.

**Reused from the Codex App-Server health path (confirmed still resolvable on main by direct
`node -e "import(...)"`):** `observeCodexAppServer`/`CODEX_APP_SERVER_HEALTH_SCHEMA` from
`codex-app-server-health.mjs` — this import in `ruleset-freshness-host.mjs:32` is **not**
part of the broken chain (see §B.evidence below). The host-control-attestation pattern
(`hostControlBinding`, `canonicalDaemonIdentity`, the sterile `/usr/bin/git` +
`WSL_SYSTEM_GIT_ENV` invocation, `ruleset-freshness-host.mjs:44-156`) transplants cleanly
because none of it depends on the retired single-fixed-action model.

**Not reused, by explicit technical necessity, not just PO preference:**
`ruleset-freshness-host.mjs`'s current `executeRulesetFreshnessHostAction`/
`createFreshnessHostAction` model hard-codes exactly **one** fixed action — literally `git
ls-remote <PUBLIC_MARKETPLACE_URL> HEAD` (`ruleset-freshness-host.mjs:110,138`, pre-merge
`ruleset-freshness.mjs:91-104`). Main's `inspectPipelineUpdateAvailability` needs a
**materially richer** set of reads: `git ls-remote <url> refs/heads/main` (alpha channel —
this repo's own configured channel, per `harness/session-bootstrap.md`'s "Channel
authority" bullet), `git ls-remote <url> refs/tags/*` (stable/beta), and a `git fetch
<sha>:refs/pipeline/marketplace` into a disposable bare repo followed by `git show
refs/pipeline/marketplace:<manifest path>` (needed specifically for alpha, where
`selected.version` is `null` and the version must be read from the fetched commit). A literal
revival of the old single-action model cannot express this — it would, at best, cover only
an approximation of the alpha-channel `HEAD` read (and `HEAD` is not guaranteed identical to
`refs/heads/main`) and leave stable/beta channel reads unrepaired.

**New, and flagged as real remaining design surface (not a trivial rewire):** a small
**closed family** of typed, individually schema/hash-validated host actions, generalizing
`createFreshnessHostAction`'s existing one-action pattern to cover the operations
`inspectPipelineUpdateAvailability` actually performs: `ls-remote-refs-heads-main`,
`ls-remote-refs-tags`, `init-bare`, `fetch-commit(sha)` (with `sha` validated against
`^[0-9a-f]{40}$` before it can enter an argv), `show-marketplace-manifest`. Each action must
still reject any deviation from its own exact expected shape before a process is spawned —
preserving the "boundary ID + request hash, no argv drift" property the threat model's asset
table already requires (`docs/phoenix-governance-threat-model.md`, "Host network capability"
row). This is genuinely new design work, not present in either pre-merge or main today; see
§B.5 for the alternative this design rejects and why.

### B.4 Runner/host scoping condition

**`runner === "codex" && wsl`**, using two mechanisms that already exist in this codebase —
neither invented for this design:

- **`runner`:** `env.CLAUDECODE === "1" ? "claude" : "codex"` — verified identical at
  `pipeline-start-preflight.mjs:190`, and, via repo-wide grep, the same pattern (checking
  `CLAUDECODE`) appears as the sole runner-identity mechanism in five other non-test files:
  `session-cleanup.mjs`, `pipeline-state.mjs`, `worktree-create.mjs`,
  `guard-apply-patch.mjs`, `codex-pretool-guard.mjs`. It is also consistent with the
  established `RUNNERS_WITHOUT_APP_SERVER`/`RUNNERS_WITHOUT_NATIVE_READBACK = new
  Set(["claude"])` convention (`codex-onboarding-app-server.mjs:25`,
  `v3-bootstrap-authority.mjs:44`) — "codex" is consistently the fallback identity whenever
  `CLAUDECODE` is not `"1"`, everywhere in this codebase, not just here.
- **`wsl`:** `[env.WSL_DISTRO_NAME, env.WSL_INTEROP].some((v) => typeof v === "string" &&
  v.trim() !== "")` — verified present, byte-identical, in both pre-merge
  (`998a609:plugins/pipeline-core/scripts/pipeline-start-preflight.mjs:149-150`) and current
  main (`pipeline-start-preflight.mjs:208-209`). Confirmed by repo-wide grep to be the
  **sole** WSL-detection mechanism anywhere in the tree — no other file references either
  env var.

**Confirmation for every other combination** (required by DoD item 4): Claude Code on any
host (`runner === "claude"`, `wsl` true or false) → `executionBoundary` stays `"default"`.
Codex on a non-WSL host (`runner === "codex"`, `wsl` false) → `executionBoundary` stays
`"default"`. In both cases `inspectPipelineUpdateAvailability` runs with the plain
`spawnSync` default — main's current, entirely unmodified direct-read path — and neither
`ruleset-freshness-host.mjs` nor the new host-attested `spawn` substitute is ever
constructed or invoked. Only `runner === "codex" && wsl` routes through the repaired
boundary. This directly closes the concrete bug found in §B.2(a): today, a Claude Code
session running inside a WSL shell (a real, unremarkable setup — Claude Code is an ordinary
CLI, nothing stops it running under WSL) already computes `executionBoundary:
"host-authorized-wsl"` even though Claude Code has no App-Server-attested control-channel
mechanism at all (`hostControlBinding`/`observeCodexAppServer` are Codex-specific). That
value is currently inert (nothing consumes it), so it causes no live incident today — but it
is exactly the kind of latent scoping error this backlog item's investigation was launched
to find, and it must be corrected as part of restoring `executionBoundary` to a load-bearing
value in Part B.

### B.5 Failure mode

- **Boundary condition holds (Codex+WSL) but host attestation itself fails** — App-Server
  not `CAS-READY`, daemon identity mismatch, git spawn error/timeout, or a returned OID that
  doesn't match `^[0-9a-f]{40,64}$`: the host-attested `spawn` substitute returns a
  failed/non-zero-equivalent result for that specific `run()` call. This is **already**
  handled by `inspectPipelineUpdateAvailability`'s existing logic — it becomes `status:
  "unknown"` with the matching `reason` (`"remote-unavailable"`, `"timeout"`,
  `"comparison-init-failed"`, etc.; lines 190-199, 295-310, 350-361). Nothing new needs to be
  built for this branch: it is the exact, already-fail-open-safe behavior
  `harness/session-bootstrap.md:162` documents today ("Offline/unavailable output is
  `unknown`, fail-open, and never a freshness claim").
- **The scoping condition itself is ambiguous** (missing/malformed `env`): both `runner` and
  `wsl` are already total, side-effect-free computations that default safely — `runner`
  defaults to `"codex"` when `CLAUDECODE` is absent (the historical default, unchanged by
  this design); `wsl` defaults to `false`/`"default"` boundary when neither WSL variable is a
  non-empty string. No new ambiguous state is introduced.
- **This never becomes a hard bootstrap failure.** Per the repo's established convention
  (`harness/session-bootstrap.md:154,162,167`; threat-model asset table row "Public ruleset
  freshness"), an unavailable/ambiguous freshness read is advisory metadata only — it never
  blocks bootstrap or write authority by itself (only the separate `repositoryFreshness`
  mechanism gates writes). Part B's repair only *widens* when a genuine successful read can
  occur; it never introduces a new way for freshness to fail *harder* than `unknown` already
  does today.

### B.6 Doc updates required

**`harness/session-bootstrap.md:159` — go.** Current sentence: *"On Codex, use the
host-authorized network-open/read-only command boundary directly instead of first producing
a known sandbox DNS failure."* This is exactly the sentence that reads as a universal
Codex requirement rather than a Codex+WSL-specific one, and it is what created the ambiguity
this backlog item's own investigation flagged. Proposed replacement text (substance required,
exact phrasing is the implementation dispatch's to finalize against house style):

> "On Codex running under WSL (detected the same way `pipeline-start-preflight.mjs` computes
> `executionBoundary`: `WSL_DISTRO_NAME`/`WSL_INTEROP` present, AND the runner is Codex, not
> Claude Code), use the host-authorized network-open/read-only command boundary directly
> instead of first producing a known sandbox DNS failure. On every other runner/host
> combination — Claude Code on any host, or Codex on a non-WSL host — the direct read above
> already succeeds without any boundary delegation; do not route those sessions through the
> WSL boundary."

**`docs/phoenix-governance-threat-model.md:61-70` (host receipt package rollback section) —
go, but narrower.** Current text names the rollback unit as `ruleset-freshness-host.mjs`, its
binding in `ruleset-freshness.mjs`, and matching tests/spec inventory. That framing stays
**structurally accurate** after Part B ships (the same three-artifact rollback unit still
exists), but the phrase "its binding in `ruleset-freshness.mjs`" currently points at exports
(`createFreshnessHostAction`, the `FRESHNESS_HOST_*_SCHEMA` family, `inspectCliRulesetFreshness`,
`PUBLIC_MARKETPLACE_URL`, `WSL_FRESHNESS_BOUNDARY_ID`) that will no longer exist under those
names once the new closed action-family (§B.3) replaces the single-action model. **This
design does not propose exact replacement wording**, because the final export names aren't
fixed until the implementation dispatch resolves §B.3's open action-family shape — but it
flags, explicitly, that a follow-up edit to this section is required at implementation time.
Not flagging this now would repeat the exact kind of doc/code drift this session's
investigation already found once (`harness/session-bootstrap.md:159` itself was one such
drift) — see the open item this leaves for the PO/Critic in §B.8.

### B.7 Migration/rollout note

Lower risk than Part A, and no opt-in flag is proposed. Today, **every** Codex+WSL session
already gets `unknown`/fail-open freshness output, because the boundary is broken — that is
the current status quo, and it is already advisory-only (§B.5). After Part B ships, the
first Codex+WSL session to run it attempts the real host-attested read for the first time:
if it succeeds, the session sees a genuine freshness comparison where it previously always
saw `unknown` — a strict improvement, nothing existing is removed. If any part of the
attestation fails, the code path degrades to the **exact same** `unknown`/fail-open output
sessions already receive today. There is therefore no plausible path from "working" to
"broken" for Codex+WSL sessions, and **zero** behavioral change for every other runner/host
combination (§B.4). No `pipeline.user.yaml` gate key is needed for Part B, unlike Part A —
the failure mode is symmetric with the pre-repair baseline, which is exactly the condition
under which WP5's own design (§5 there) treats an opt-in flag as unnecessary.

### B.8 Explicitly out of scope (Part B)

- **Making the WSL boundary path universal/default for any other runner or host** —
  explicitly forbidden by the PO decision and by this dispatch's prohibitions.
- **Reviving PHX-0B's full identity-comparison model** (`compareLoadedRulesetIdentity`/
  `normalizeRulesetSource`-driven self-application-vs-marketplace source classing *inside the
  freshness path itself*, as pre-merge `inspectRulesetFreshness` did at
  `ruleset-freshness.mjs:306-334`, `998a609`) — main's channel/tag-based
  `inspectPipelineUpdateAvailability` stays the **one** freshness orchestration model, per
  this dispatch's explicit "must not disturb" instruction (§B.3).
- **A Claude-Code-under-WSL host boundary.** Claude Code has no App-Server-attested
  control-channel identity mechanism analogous to `observeCodexAppServer` — building an
  equivalent, if ever wanted, is an entirely separate design, not a re-scoping of this one.
- **Finalizing the exact closed action-family schema/names** for the new host-action family
  (§B.3). This is real remaining design surface, flagged rather than resolved here given its
  security sensitivity (it widens the boundary's action surface from one fixed action to a
  family); recommended as a fast-follow granular sub-design with its own Critic pass before
  implementation, not folded into this document's scope.
- Any change to `.claude/settings.json`, `.codex-plugin/plugin.json`, or any other
  guardrail/config surface.

---

## Verification log (commands actually run this session)

- `git rev-parse --short HEAD` → `cbf3050`; `git merge-base --is-ancestor cbf3050 HEAD` →
  confirmed ancestor (HEAD equals the ruleset SHA exactly).
- `node -e "import('./plugins/pipeline-core/scripts/ruleset-freshness-host.mjs')"` →
  `SyntaxError: The requested module './ruleset-freshness.mjs' does not provide an export
  named 'FRESHNESS_HOST_CONTROL_SCHEMA'` — confirms the broken import chain directly, not
  just by reading the backlog item's claim.
- Counted exactly which of `ruleset-freshness-host.mjs`'s 10 non-`codex-app-server-health.mjs`
  imports are missing on main: all 8 named imports from `./ruleset-freshness.mjs`
  (`createFreshnessHostAction`, `FRESHNESS_HOST_RESULT_SCHEMA`, `FRESHNESS_HOST_CONTROL_SCHEMA`,
  `FRESHNESS_HOST_RECEIPT_SCHEMA`, `FRESHNESS_HOST_TRANSPORT_SCHEMA`,
  `inspectCliRulesetFreshness`, `PUBLIC_MARKETPLACE_URL`, `WSL_FRESHNESS_BOUNDARY_ID`), plus
  `freshnessHostActionForPreflight` from `./pipeline-start-preflight.mjs`, plus
  `observeCodexRulesetSource` from `../lib/codex-host-plugin-list.mjs` — matches the backlog
  item's "8 named exports" claim exactly, with the two additional missing imports named
  explicitly here for completeness.
- `node -e "import('./plugins/pipeline-core/scripts/codex-app-server-health.mjs').then(m =>
  console.log(Object.keys(m)))"` → confirmed `CODEX_APP_SERVER_HEALTH_SCHEMA` and
  `observeCodexAppServer` both resolve on main — this specific import in
  `ruleset-freshness-host.mjs:32` is **not** part of the broken chain, and both symbols are
  reusable as-is for Part B.
- `grep -rn "normalizeRulesetSource\|compareLoadedRulesetIdentity" --include="*.mjs"
  plugins/` → confirmed zero production callers outside the primitives' own test file (see
  the verification note at the top of this document).
- `diff -q` between pre-merge (`998a609`) and current `ruleset-freshness-host.mjs` → no
  output (byte-identical) — confirms the backlog item's "merged cleanly, never a conflict"
  claim.
- `grep -rln "CLAUDECODE"` / `"WSL_DISTRO_NAME\|WSL_INTEROP"` across `plugins/` (excluding
  test files) → grounds §B.4's scoping-condition citations in real, existing call sites
  rather than an invented mechanism.
