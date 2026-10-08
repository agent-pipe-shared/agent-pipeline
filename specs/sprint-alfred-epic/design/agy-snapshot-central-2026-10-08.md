# Central per-user agy snapshot (PO decision AM, topology A) - contract and test list

Status: design note, 2026-10-08, slice SLICE-AM. Facts [D] carry `file:line`; choices [C] carry a recommendation. Research is partial (tool-budget checkpoint): seams not yet read are listed in section 2 and must be read at slice start.

## 1. Source and what topology A means

- [D] AM: "One central per-user snapshot, attested and refreshed by the update verb; repositories do not pin their own snapshot." `specs/sprint-alfred-epic/plans/po-decisions-2026-10-07.md:45`. AH put the item in scope: `:40`.
- [D] N4: the item author labelled topology B (workspace-local only) recommended; the PO chose A. `specs/sprint-alfred-epic/plans/po-open-questions-2026-10-07-night.md:20`. The triage text recorded "Already decided? No" before AM: `plans/triage-6-po-options-2026-10-07.md:132-147` (superseded by AM).
- [D] The item's option A = agy-managed install: `agy plugin install <approved source dir>`, one global managed copy, no `plugins.json` entry, "global by construction". `backlog/items/2026-09-28-agy-imported-plugin-snapshot-shadows-registered-plugin.md:166-170`. Rule for both options: exactly one agy-visible source per effective scope (`:156-158`).
- [D] Item constraints: use agy's own lifecycle, never raw deletion or hand edits of agy state (`:229-237`); never mutate from inside an agy session or hook (`:238-247`, GL-09); spike S1-S6 is mandatory before the wiring is fixed (`:120-152`); loading and governing are separate, the start hint avoids locks in ungoverned directories (`:67-72`).
- [C] Reading of A, concretely (recommended): two layers. (1) A Pipeline-owned, digest-keyed snapshot per user: this is the "approved source dir". (2) The agy-managed copy, created only by `agy plugin install <snapshot root>` through the existing refresh host. Who writes: the host-boundary update/installer verb, never a hook or session. How a project finds it: it does not; agy loads the one managed copy in every workspace, and a project never registers its own copy (workspace Pipeline entries are retired). Several projects: one snapshot, one managed copy, per-project governance state stays per project (section 3). Several versions: digest-keyed directories, one `current` pointer, the managed copy follows the pointer.
- N4 consequence to confirm: B's argument ("`~/src` and other folders see no Pipeline", item `:160-165`) is knowingly given up; ungoverned directories load the plugin and must stay inert (test 17).

## 2. Seams [D]

- Observer: `lib/antigravity-plugin-topology.mjs:84-105` (schema `pipeline.antigravity-plugin-topology.v1` `:8`; managed scan of `<configRoot>/config/plugins` `:89`; import manifest `:93`; registries `:99`; hook wiring `:100`). Plan: `:108-131`; global scope already plans `plugin uninstall`, `plugin validate <root>`, `plugin install <root>` (`:124-125`) and holds with `AT-SCOPE`, `AT-CLI-CAPABILITY-UNOBSERVED`, `AT-UNVERIFIABLE-SURFACE`, `AT-MANAGED-IMPORT-AMBIGUOUS`, `AT-OTHER-SCOPE-PIPELINE-CONFLICT`, `AT-GLOBAL-CHANGE-REQUIRES-EXPLICIT-SCOPE` (`:111-121`). Loaded check: `observeAntigravityLoadedTopology` `:136-150` (kind direct/managed-copy/unknown; status current/refresh-required; source vs loaded content sha256).
- Host: `lib/antigravity-topology-refresh-host.mjs:84-90` `createAntigravityRefreshHost({configRoot, workspaceRoot, approvedSourceRoot, scope, globalChangeApproved, cliPath, runCli, writeInstalledReceipt})`; the real CLI runs only when `configRoot === join(homedir(),'.gemini')` (`:89`), so fixtures inject `runCli`; atomic JSON write (temp `wx` 0600, fsync, preimage check, rename, readback) `:14-22`; workspace entry retirement `:76-83`; CLI lookup `:62`.
- Installer: `install-agy.mjs:202-213` `refreshAntigravityInstallation`; `:216-232` `verifyAntigravityInstallerSource` already supports a gitless approved root attested against a clean Git source (`attestationSourceRoot !== approvedSourceRoot`, `:204-207`, `:277-280`); source choice today is only plugin dir or local marketplace (`:240-250`); scope 1 workspace / 2 global (`:255-256`); config root `join(homedir(),'.gemini')` (`:275`).
- Per-user anchor: `lib/machine-plane.mjs:49-64` `machinePlaneFilePath` -> `<realpath(home)>/.agent-pipeline/machine.json`, null when home is absent/relative/unresolvable, home injectable via `dependencies.homedirFn` (`:50`); it is the sole owner of this derivation (`:6-9`). The plane key set is exact (`:33-35`), so no snapshot key fits without a schema change. No hardcoded home path is needed: derive `dirname(machinePlaneFilePath(deps))`.
- Precedent: `lib/git-hook-runtime-snapshot.mjs:32-38` publish: destination `join(state,'runtime-'+manifestSha256)` (`:33`), temp dir `runtime-tmp-<hex>` mode 0700 + owner file, copy, `snapshot.json` manifest, verify, fsync dirs, second full source read (`GHS-SOURCE-DRIFT`, `:23`), `renameSync`, idempotent when the digest directory exists (`:36`); verify `:49-53`. Its copy set is a fixed public subset (`PUBLIC_DIRS` `:8`, `publicPath` `:13`: lib/hooks/scripts/config/schemas, no tests): not a whole agy plugin (the host reads `hooks.json`, `refresh-host:30`; managed components are skills, agents, hooks, item `:19-23`).
- Update verb: `scripts/pipeline-update-channel.mjs` (`:32` channels, `:402` per-repo channel read, `:509` plan, `:730` apply) is per project and has no agy or machine-plane reference (grep, no matches).
- Not yet read, verify at slice start: `scripts/pipeline-start-preflight.mjs` use of the loaded topology and the existing reason codes proposed at item `:207-212`; refresh host `apply()` and receipt writing (`refresh-host:100+`); `lib/git-hook-footprint.mjs` and `lib/windows-private-state.mjs` signatures; the repo's Windows-tolerant directory fsync (commit 42a8d765e).

## 3. Contract [C]

- New module `lib/agy-central-snapshot.mjs` (sibling; do not edit `git-hook-runtime-snapshot.mjs`: reuse its `git-hook-footprint` primitives and its publish shape, with the path policy injected instead of `PUBLIC_DIRS`). Functions:
  - `agySnapshotRoot(deps)` -> `join(dirname(machinePlaneFilePath(deps)),'agy-snapshot')` or `null` (never a second home derivation).
  - `publishAgySnapshot({sourcePluginRoot, attestationSourceRoot, deps, timeBudgetMs})` -> `{root, snapshotSha256, version}`.
  - `verifyAgySnapshot({root, snapshotSha256})`; `readCurrentAgySnapshot(deps)`; `setCurrentAgySnapshot({snapshotSha256}, deps)`; `classifyAgySnapshot({observation, deps})` -> `{status: current|missing|stale|foreign|unverifiable, code}`.
- Path rule: `<anchor dir>/agy-snapshot/plugin-<snapshotSha256>/` (tree + `snapshot.json`) and `<anchor dir>/agy-snapshot/current.json` (`{schema:'pipeline.agy-snapshot-current.v1', snapshotSha256, version, publishedAt}`). `<anchor dir>` is the directory holding `machine.json`.
- Version keying: by content digest of the manifest (as the precedent), never by version string alone (a stamp can lie, item `:195-196`); `version` is recorded for display and the downgrade check. Copy set: whole plugin tree minus tests, fixtures, `.git`, symlinks (refused).
- Atomic publish: temp dir + owner file + verify + fsync + second source pass + rename (precedent `:33-37`); pointer by temp + fsync + preimage check + rename + readback (host `:14-22`); a crash leaves no visible `plugin-<sha>`; stale temps swept by owner check on the next publish. Windows: private-directory hardening as the precedent.
- Refresh wiring: `approvedSourceRoot = snapshot root`, `attestationSourceRoot = clean Git source`, `scope = 'global'`, `globalChangeApproved = true` through `refreshAntigravityInstallation` (existing pattern); a new source kind `central-snapshot` next to plugin dir / marketplace in the installer; the update verb calls publish then refresh at the host boundary (skipped when no agy CLI is found, `refresh-host:62`).
- Typed codes (prefix `AGS-`): `AGS-ANCHOR-UNRESOLVED`, `AGS-SNAPSHOT-MISSING` (no pointer, or pointer without directory), `AGS-SNAPSHOT-STALE` (pointer digest differs from the attested source, or the managed copy digest differs from the pointer), `AGS-SNAPSHOT-FOREIGN` (changed/extra file, symlink, wrong schema or owner; or a managed copy matching no snapshot digest, like the 0.6.2 incident), `AGS-SOURCE-DRIFT`, `AGS-POINTER-DRIFT`, `AGS-DOWNGRADE-REFUSED`. Host-side `AT-*`/`ATR-*` codes are reused unchanged. Preflight maps missing/stale/foreign to the existing `plugin-refresh-required` status (item `:207-212`; confirm at slice start).
- Stays per project: `project/pipeline.json` calibration, `pipeline.user.yaml`, `.git/agent-pipeline` state, locks and receipts, and the governance decision itself. Retired per project: any Pipeline entry in `.agents/plugins.json` and Pipeline-owned workspace hook wiring (via `removeAntigravityWorkspaceRegistration`, `refresh-host:76`).

## 4. Test list (fixture homes only: `mkdtemp` home with `.agent-pipeline/`, fake `.gemini`, injected `homedirFn`, fake `runCli`; real home and real agy never touched)

Test-only dispatch first (file `lib/agy-central-snapshot.test.mjs`, red against a stub), cases 1-13; then slice F1 module (turns 1-13 green); slice F2 wiring (14-17); slice F3 docs.
1. anchor: fixture home -> root is `<realpath home>/.agent-pipeline/agy-snapshot`; nothing read outside the fixture.
2. anchor unresolved: `homedirFn` empty/relative/throws -> `null`, `AGS-ANCHOR-UNRESOLVED`, nothing created.
3. first publish: fixture plugin (plugin.json, skills, agents, hooks.json, hooks, lib, plus tests/fixtures) -> `plugin-<sha>` + `snapshot.json`, tests/fixtures excluded, modes 0700/0600 on POSIX, no temp left.
4. idempotent: same source twice -> same root and digest, no rewrite (inode/mtime unchanged).
5. new version: second source -> new digest directory, pointer moved, previous kept; third publish prunes to current + 1 previous, never the pointed one.
6. source drift: source mutated between passes (injected hook) -> `AGS-SOURCE-DRIFT`, no destination, temp removed, pointer unchanged.
7. crash: fault after copy, before rename -> no visible digest directory; next publish sweeps the temp; pointer unchanged.
8. pointer atomicity: pointer changed between read and write -> `AGS-POINTER-DRIFT`; readback mismatch -> typed failure, old pointer intact.
9. missing: no directory, and pointer without directory -> `missing`, `AGS-SNAPSHOT-MISSING`.
10. stale: pointer digest differs from the attested source; managed-copy digest (fixture `.gemini/config/plugins/<name>`) differs from the pointer -> `AGS-SNAPSHOT-STALE`.
11. foreign: edited file, extra file, symlink, wrong schema, owner mismatch -> `AGS-SNAPSHOT-FOREIGN`; hand-imported 0.6.2-style managed copy with no matching digest -> foreign.
12. downgrade: publishing an older version over a newer pointer -> `AGS-DOWNGRADE-REFUSED`, no change.
13. static: new module has no `.gemini`, `homedir` or drive-letter literal outside the injected anchor; `harness/scripts/check-consumer-safe-paths.test.mjs` passes.
14. refresh uses the snapshot: fake CLI argv order `plugin uninstall`, `plugin validate <snapshot>`, `plugin install <snapshot>`, attestation bound to the Git source; configRoot is the fixture, so the real CLI is never reached.
15. several projects: workspaces A and B, A holding a `.agents/plugins.json` entry to a source checkout -> plan held `AT-OTHER-SCOPE-PIPELINE-CONFLICT`; after retirement -> prepared; both workspaces observe the same loaded digest.
16. update verb: after apply, publishes then refreshes; no agy CLI -> no snapshot, no error; unverifiable surface -> refused with the host code, nothing mutated.
17. ungoverned directory: loaded topology current, no bootstrap lock written (item `:67-72`).

Protected paths: none of cases 1-17 needs a protected file (agent-obligations section 2, TP-1..TP-13). Flag: if the new suite must be registered in `harness/verify-suites.json` (TP-13), that is a stop condition, not an edit; the guard files, `hooks.json` and `machine-plane.mjs` stay untouched. F2 edits `install-agy.mjs`, `scripts/pipeline-update-channel.mjs` and `scripts/pipeline-start-preflight.mjs` (guard-adjacent: Critic path).

## 5. Open choices for the PO (non-blocking, recommendation first)

1. Layering: snapshot directory as the "approved source dir" feeding `agy plugin install` (recommended) vs snapshot as the managed copy itself (rejected: hand-writes agy state, item `:229-237`).
2. Location: sibling directory of `machine.json` (recommended) vs a new machine-plane key (needs schema change, `machine-plane.mjs:33-35`) vs under `~/.gemini` (agy-owned).
3. Channels: update verb is per project; central snapshot follows newest applied version, never a silent downgrade (recommended) vs stable-only vs per-project (contradicts AM).
4. Retention: current + 1 previous (recommended) vs only current vs all.
5. Installer: make central global the Antigravity default and keep workspace-local as a warned developer opt-out (recommended; resolves item `:172-175`) vs retire workspace-local.
6. Spike S1, S5, S6 (item `:127-149`) in a disposable account before F2 (recommended); F1 and the test-only dispatch do not depend on it.
