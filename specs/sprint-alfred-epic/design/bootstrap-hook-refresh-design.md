# Design note: the bootstrap refreshes outdated git hooks itself (HOOKREFRESH-D)

Status: design note, read-only investigation, no code changed. Interim at the 80 % budget checkpoint:
everything below is established from code read in this dispatch unless marked **not verified**.
Paths are repository-relative to the plugin (`plugins/pipeline-core/...`); `<plugin-root>` is the loaded plugin
copy, `<repo>` the repository being bootstrapped. No host paths are recorded here.

Requirement (stripped backlog item, PO statement 2026-10-05): when the plugin updated, the **agent** refreshes the
installed hooks during bootstrap; the PO is not the installer. There is also no agent-operable install route overall.

## 0. Headline findings

1. **Only pre-push can report "outdated" today.** `pre-push-hook-install.mjs` computes `current` / `updateRequired`
   (lines 656-673). `pre-commit-hook-install.mjs` and `commit-msg-hook-install.mjs` have **no** currentness notion:
   their `planInstall` returns a bare `ready-to-upgrade` when the hook is intact (pre-commit 873-883; commit-msg 400-401).
2. **The bootstrap's "current" for pre-commit / commit-msg means "intact", not "up to date".**
   `check-clone-provisioning.mjs:60-64` maps `ready-to-upgrade` to `current` unless `plan.current === false`, and only
   pre-push ever sets that field. A plugin update therefore leaves both mandatory hooks "current" forever.
3. **A refresh route half exists for pre-push only.** The preflight already classifies `installed-but-stale` and carries the
   exact structured `installCommand` (`pipeline-start-preflight.mjs:669-676`), but only nested under `prePushHook`; the
   top-level `nextAction` never points at it (chain at 1569-1604).
4. **`clone-hook-readiness.mjs --apply` cannot refresh anything and can wedge a repo** (section 3.4).
5. **Nothing orders plugin versions, so an agent-run install can downgrade** (section 4).

## 1. How each installer reports "outdated" today (Q1)

All three share the verbs `--plan-install | --install | --plan-remove | --remove | --decline`; the `--plan-*` verbs
are the read-only status routes (documented "Read-only" in pre-push 634-637, pre-commit 860-864).

| Installer | Read-only command (cwd = repo) | Outdated signal | Evidence |
|---|---|---|---|
| `pre-push-hook-install.mjs` | `--plan-install` | `{status:"ready-to-upgrade", current:false, updateRequired:true}` | CLI 793-794; planInstall 638-681; `current` is true when the marker's recorded lib dir equals the source lib dir, or when the recorded `runtime-<sha256>/lib` digest equals `inspectGitHookSourceSnapshot({pluginLibDir}).manifestSha256` (656-666) |
| `pre-commit-hook-install.mjs` | `--plan-install` | **none**: `ready-to-upgrade` carries only paths (883) | CLI 1004-1005; planInstall 865-890 |
| `commit-msg-hook-install.mjs` | `--plan-install` | **none**: `ready-to-upgrade` carries only paths (401); intact means hook+impl hashes match the marker (366-388) | CLI 504-505; planInstall 391-404 |

Other planInstall states a refresh design must handle: `ready` (absent), `declined` (decline marker, only when no hook is on
disk), `foreign-hook-present`, `repository-unresolved`; commit-msg adds `modified-or-unreadable-managed-install`,
`orphan-managed-file`, `unreadable-managed-state` (366-376). The three `--plan-install` commands were **not run**
in this dispatch (the aggregate readback below already ran all three planInstalls read-only).

Aggregated read-only evidence that was produced by the Step-0 bootstrap preflight in this repository (Claude, native Windows,
own repository): `cloneProvisioning.checks` = pre-push `install` (hook absent), pre-commit `current`, commit-msg `current`;
`prePushHook.state = "absent"` with an `installCommand`; top-level `nextAction` = the onboarding `inspect` command. Exit code of that
preflight run was not captured by the tool output (**not verified**).

**What binds an installed hook to a plugin version** (needed for any currentness check):
- The shim is `/bin/sh` + `exec node "<abs impl.mjs>"` (pre-push 189-197); the impl imports lib files from a **runtime snapshot**
  `<git-common-dir>/agent-pipeline/<hook>/runtime-<manifestSha256>/` (snapshot 32-37; pre-push marker `pluginLibDir`, 143-157).
- The manifest digest is the sha256 of the JSON inventory (path + sha256) of every public file under `lib, hooks, scripts, config,
  schemas` plus `protected-baseline.json`, excluding tests/fixtures (snapshot 8-13, 24). Because `scripts/` is in the set, a
  **renderer change in any installer also changes the digest**, so "digest differs" is a sound staleness test for all three hooks.
- The marker records `hookSha256`, `implSha256`, `pluginLibDir`, `installedAt`, `installerVersion` (constant `"1"`), **no plugin
  version** (pre-push 147-156; pre-commit 940-951; commit-msg 455-464).

## 2. What an agent may run without a PO ceremony today (Q2)

- Lifecycle-guard catalogue (`lib/guard/command-catalogue.mjs`, `sanctionedLifecycleScriptArgs`, 122-): exactly one installer is
  admitted: `PRE_PUSH_HOOK_INSTALL_SCRIPT` with `args[0] === "--install" && args.length === 1` (146). The constant is the guard's own
  plugin copy, derived from `import.meta.url` (`lib/guard/constants.mjs:151`). The preflight itself is admitted with zero args (145).
- A search of `command-catalogue.mjs` for `hook-install|clone-hook-readiness|pre-push-hook` matched only the import (10) and 146.
  So `pre-commit-hook-install.mjs`, `commit-msg-hook-install.mjs`, `clone-hook-readiness.mjs` (with or without `--apply`) and every
  `--plan-*` verb of pre-push are **not in the sanctioned catalogue**. `sanctioned-args-scripts.mjs` has no installer entry (read in full).
- **Not verified:** the refusal code a non-sanctioned `node <installer>` call receives, and whether a *ready* session's wider
  guard union (guard-devplan, guard-git, guard-push) admits it by another lane. The briefing names `GUARD-DEVPLAN-SHELL` /
  `DAA-DWP2-PHYSICAL-OR-GIT` only as transient refusals. The catalogue above is the lane for a session whose lifecycle is not
  ready; a directory-wide grep of `lib/guard/` was itself refused by the read guard (`GUARD-READ-TARGET`, not a finding about installers).
- Spelling trap: `cloneProvisioning.checks[].repairAction` is the **repo-relative** `node plugins/pipeline-core/scripts/<installer> --install`
  (`check-clone-provisioning.mjs:58`). That is only the right path inside the Pipeline's own repo, and even there the loaded plugin
  copy can be a different directory (here the preflight's `pluginRoot` is a separate marketplace copy). The guard compares against the
  **absolute loaded-plugin path** (`constants.mjs:151`), so the structured argv from the preflight (`PRE_PUSH_HOOK_INSTALLER_SCRIPT_PATH`,
  preflight 594-609) is the only spelling that is sanctioned for a consumer repository.

## 3. Where the preflight builds `nextAction`, and the smallest additive change (Q3)

### 3.1 Current construction

`observePipelineStartPreflight` (`pipeline-start-preflight.mjs`):
- 1547-1549: `checkCloneProvisioning` -> `assessMandatoryHookReadiness` (only pre-commit + commit-msg are mandatory,
  `check-clone-provisioning.mjs:23`) -> `applyMandatoryHookGate` (only downgrades a `ready` status, 39-44).
- 1569-1604: a single ternary chain. Priority: `hook-provisioning-required` -> `clone-hook-readiness.mjs --root <repo> --apply`
  (`mutation:true, requiresConfirmation:true`); `hook-provisioning-blocked` -> `null`; antigravity topology refresh;
  plugin attestation; `ready` -> onboarding `inspect`/driver action.
- 1288 and 1655: `prePushHook` is a separate advisory observation (never gates status, by design: see 641-645);
  `installCommand` is `{kind:"command", executable:"node", argv:[<abs installer>, "--install"], cwd:<repo>, mutation:true,
  requiresConfirmation:false}` (600-609), so it is already byte-identical to the one spelling the guard admits.

### 3.2 Smallest additive change (recommended, three small steps)

1. **Detection for the two other hooks, one shared helper.** Add `current` / `updateRequired` to `planInstall` of pre-commit and
   commit-msg using the same test pre-push uses (compare the digest embedded in the recorded `runtime-<sha>/lib` against
   `inspectGitHookSourceSnapshot({pluginLibDir}).manifestSha256`). Put that test in one new lib helper so the three installers
   cannot drift. Cost note: that inspection is two full reads of the plugin tree (snapshot 28-31); the three hooks share one
   source tree, so compute the digest **once per preflight** and pass it in, instead of 3x.
2. **A new projection status that does not gate readiness.** In `projectHookProvisioning` map `updateRequired === true` to a new status
   `"refresh"` (keeping `repairAction`), distinct from `"install"`. Do **not** reuse `"install"`: `assessMandatoryHookReadiness`
   (20-37) treats "not all current and not all install" as `blocked / HOOK-READINESS-STATE-UNSUPPORTED`, which would turn every
   consumer bootstrap into `hook-provisioning-blocked` the moment the plugin updates. `refresh` must keep status `ready` and add an
   additive `refreshAvailable` list.
3. **One action per call.** Add an additive top-level field (e.g. `hookRefresh: {pending:[...ids]}`) and one new branch in the
   chain, placed after the hard-gate branches and before the `ready` onboarding branch, returning the single next refresh command in
   the existing sanctioned spelling: pre-push -> `node <plugin-root>/scripts/pre-push-hook-install.mjs --install`; pre-commit and
   commit-msg -> the same shape for their installer. After running one, the agent re-runs the preflight ("rerun preflight after the
   documented recovery", `skills/pipeline-start/SKILL.md:50`) and receives the next one, then finally the onboarding action. Never
   offer the action for `declined` or `foreign-hook-present` states (consent / ownership boundary; see 4).
   Whether such a command is runnable by the agent depends on guard admission (section 2): pre-commit / commit-msg need an
   admission entry before the preflight may point at them (slice S3).

### 3.3 What happens when an install is refused

- `foreign-hook-present` / hook, impl or marker modified since install: `applyInstall` returns `refused-foreign-hook` and writes
  nothing (pre-push 713; pre-commit 922; commit-msg 444); pre-push and commit-msg exit 1; pre-commit exits 1 (999: only `installed` is 0).
  A refresh must therefore never be offered for that state (`projectHookProvisioning` already sets `repairAction: null`, 69-74).
- Thrown refusals (e.g. `PB-WINDOWS-ASSURANCE` from `ensureHardenedPrivateDirectory`; documented win32-only at
  `lib/hardened-private-directory.mjs:30`; only that one line was read, so its exact trigger is **not verified**):
  - **pre-push** CLI catches, prints `{"status":"refused","code":<code>}`, exit 1; but only codes matching `^GHS-[A-Z-]+$`
    are kept, **everything else (including `PB-WINDOWS-ASSURANCE`) is collapsed to `PREPUSH-INSTALL-UNAVAILABLE`** (783-788). The
    actionable code is lost.
  - **pre-commit / commit-msg** CLI have no try/catch (994-999; 498-516), so the error propagates as an uncaught exception
    (stack trace, non-zero exit).
  - **clone-hook-readiness `--apply`**: `main`'s handler prints `<error.code ?? "HOOK-READINESS-ERROR">: <message>`, exit 2 (61-64);
    whether the thrown error carries `.code === "PB-WINDOWS-ASSURANCE"` is **not verified**.
- Refresh design consequence: the agent must treat any non-zero exit as "stop and report the code", never retry with a different route;
  slice S2 should also keep the real code in pre-push's catch (small, additive).

### 3.4 Existing defect that the refresh feature must not inherit (wedge)

`applyMandatoryHookReadiness` installs pre-commit, then commit-msg, with no try/catch between them (`clone-hook-readiness.mjs:33-38`)
and only runs when **both** are `install` (28-31). If commit-msg throws after pre-commit succeeded, the repo is left with one
`current` and one `install` hook; the next readiness read is `blocked / HOOK-READINESS-STATE-UNSUPPORTED` (ccp 33-36), the preflight
status becomes `hook-provisioning-blocked`, and `nextAction` is `null` (preflight 1579-1580). No route out is offered. This is a
backlog candidate on its own and a precondition for any auto-refresh in the mandatory-hook path.

## 4. Security consequences for the push-gate layer (Q4)

The pre-push hook is the git-level backstop for `guard-push` (`pre-push-hook-install.mjs:4-12`).

- **Can an agent-run refresh downgrade it? Yes mechanically, by construction.**
  - `applyInstall` (pre-push 710-737) never consults `plan.current`; it always publishes the snapshot of **its own** plugin copy
    (`PLUGIN_ROOT` from `import.meta.url`, 71-72; the CLI calls `applyInstall({rootDir, onProgress})` without a lib dir, 778) and overwrites
    shim, impl and marker. An install run from an older plugin copy installs an older template and older lib tree.
  - There is no ordering information to compare: the marker has no plugin version, and `runtime-<sha256>` is a content hash, not an
    ordered value. A downgrade is undetectable from the marker alone. No version/downgrade check exists in plan or apply (all of 638-737 read).
  - **Mitigation that does exist:** the guard admits only the loaded plugin's own absolute installer path (`constants.mjs:151`) and the
    preflight builds its action from the same loaded copy (594), so a sanctioned refresh can only move the hook to the *currently loaded*
    plugin version. A downgrade needs an older plugin to be the loaded one (for example another session or machine with an older cached
    plugin, or two sessions with different plugin versions sharing one git-common-dir: **hooks and the snapshot state live in the common dir,
    so they are shared across worktrees** by `git rev-parse --git-common-dir`, pre-push 85-101).
- **No clobbering of human work:** `installedArtifactsMatch` (166-185) requires marker schema, `installerVersion`, exact raw marker text and
  both content hashes; any hand edit yields `foreign-hook-present` and a refused install (646-655). Legitimate renderer upgrades are
  deliberately **not** misclassified as foreign because the check compares against the marker, not the current renderer (160-165).
  Caution: bumping `INSTALLER_VERSION` or changing marker shape would classify every existing install as foreign (168).
- **Consent boundary:** `applyInstall` also proceeds from state `declined` (691-694; commit-msg 441-442), so "install" overrides a human's
  decline. An automatic refresh must be restricted to *installed-but-stale* states and must never fire from `declined` or `ready`
  (absent) without the existing consent route. In the mandatory-hook path a decline is a hard `blocked` (ccp 27-29).
- **Integrity of the new binding is strong:** the snapshot is content-addressed, read twice with full hashing (`GHS-SOURCE-DRIFT`,
  snapshot 20-23, 68), verified before the impl is rendered (pre-push 52) and the installed impl embeds
  `PIPELINE_SNAPSHOT_ROOT` / `PIPELINE_SNAPSHOT_MANIFEST_SHA256` and re-verifies at run time
  (`lib/git-hook-snapshot-admission.mjs:5-9`; the rest of that run-time check was not read, **not verified**).
  Modes are asserted 0700/0600 off Windows (snapshot 55). So a refresh binds to the loaded plugin's exact bytes; the open risk is only
  *which* plugin is loaded, not tampering.
- **Idempotence:** `--install` on an up-to-date hook still rewrites shim, impl and marker (`installedAt` changes) while the snapshot is
  reused (snapshot 36). Offer the action only when stale, to avoid churn.
- **Fail-safe:** a stale but intact hook still enforces its older rules; refresh only matters for newer rules. Not refreshing is therefore
  a weaker-than-current gate, not an open gate.

## 5. Slice plan and open PO questions (Q5)

Disjoint file sets; protected-path column is measured against the 13 test-path patterns TP-1..TP-13 in `templates/prompts/agent-obligations.md`
section 2. No slice touches a TP path. All slices touch push-gate or guard code (security / guardrail class: deep tier, Critic review required).
Test file names below follow the repository convention and are **not verified to exist**; the implementer must locate them.

| Slice | Files | Protected-path status | Tests |
|---|---|---|---|
| S1 detection | `scripts/pre-commit-hook-install.mjs`, `scripts/commit-msg-hook-install.mjs`, new lib helper for the shared digest test, `scripts/check-clone-provisioning.mjs` (projection `refresh`) | none (not a TP path) | per-installer plan tests for stale vs current vs foreign; projection table test; **mixed state must not become `blocked`** |
| S2 surface | `scripts/pipeline-start-preflight.mjs` (+ keep real code in pre-push catch, `pre-push-hook-install.mjs:783-788`) | none | preflight tests: stale -> single action; declined/foreign -> no action; mandatory hook gate unchanged; digest computed once |
| S3 admission | `lib/guard/constants.mjs`, `lib/guard/command-catalogue.mjs` (the `--install`-only shape of line 146, for the two extra installers) | none, but guard union code | guard tests: exact argv admitted, `--remove` / `--decline` / extra args refused |
| S4 instruction | `skills/pipeline-start/SKILL.md` (+ docs): execute the one returned refresh action, rerun preflight | none | doc/consistency tests only |
| S5 wedge fix (independent) | `scripts/clone-hook-readiness.mjs` | none | partial-apply test: second install throws, mixed state recovers |

Order: S1 -> S3 -> S2 -> S4 (the preflight must never point at a command the guard refuses). S5 is independent.

### Matrix: runner x platform x repository

What is established: the bootstrap preflight is the shared entry for all runners (`skills/pipeline-start/SKILL.md:20`), it knows the
runner (`runner` in the result; Antigravity gets its own `antigravity-topology-refresh-required` action at host boundary, preflight 1581-1582),
and the installers are runner-neutral Node scripts. Cells are **design-covered** only where the refresh logic is runner-neutral; observed
live in this dispatch: Claude x native Windows x own repo, read side only. Everything else is **not verified**.

| Runner | native Windows | WSL | macOS |
|---|---|---|---|
| Claude | own: read side observed; consumer: not verified | not verified | not verified |
| Codex | not verified (reaches the same preflight per SKILL.md; guard admission lane for Codex not read) | not verified | not verified |
| Antigravity | not verified (own topology-refresh action exists, 1581-1582) | not verified | not verified |

Each cell has two sub-cases, own repository (plugin sources in-repo, `repairAction` string happens to match) and consumer repository
(plugin from the cache; only the structured absolute-path argv is correct, section 2). Platform-specific facts that matter: Windows runs the
`/bin/sh` shim under Git's own shell and needs `PB-WINDOWS-ASSURANCE`-class private-directory hardening; non-Windows asserts 0700/0600 modes
(snapshot 55). A checkout shared between Windows and WSL has one git-common-dir but the baked impl path is absolute and OS-specific
(pre-push 194), so a refresh by one OS can leave the other OS's hook pointing at an unreachable path: **not verified**, and listed as a PO question.

### Open PO questions

1. **Advisory or gating?** Recommended: advisory (stale hooks still enforce older rules) with a typed `nextAction`, never `hook-provisioning-blocked`.
2. **Confirmation:** `requiresConfirmation:false` (like the pre-push `installCommand`) or `true` (like `clone-hook-readiness --apply`) for the refresh action?
3. **Downgrade policy:** accept the "loaded plugin = truth" model (current mitigation), or add ordering (needs a plugin version in the marker, with a
   marker-compat plan because the exact-marker check in 166-185 treats shape changes as foreign)?
4. **Declined hooks:** confirm that a decline is never auto-overridden by a refresh (recommended).
5. **Pre-commit / commit-msg guard admission (S3):** may the catalogue admit them exactly like pre-push `--install`, i.e. does a push-gate-adjacent
   hook refresh by an agent need the PO's explicit blessing in the decision register?
6. **Shared checkout across OSs (Windows + WSL):** which OS refreshes, and is a cross-OS stale detection (absolute path, not digest) in scope?
7. **Wedge S5:** fix first, or accept until S1-S4 land?

## 6. Not verified (explicit list)

- Refusal code for a non-sanctioned `node <installer>` call, and the ready-session lane for installer scripts.
- Exact trigger and `.code` propagation of `PB-WINDOWS-ASSURANCE`; run-time admission beyond `git-hook-snapshot-admission.mjs:1-40`.
- All runner x platform cells other than the read side on Claude x Windows x own repo; the Codex and Antigravity bootstrap bodies.
- Existence and names of the installers' test files; exit code of the Step-0 preflight run; the three `--plan-install` commands (not run).
