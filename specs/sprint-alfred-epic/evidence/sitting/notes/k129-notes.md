# K129-GLOBAL-ROUTE-DOC notes (clone scratch/clones/k129, base main a56cca4d8)

Status: implementation complete in clone; independent Critic read and PO acceptance pending.
Commit: 3872d6d34 docs(setup): document the Antigravity global-install route (SETUP.md, GEMINI.md). Trailers as briefed.

## Read
SETUP.md Antigravity sections, GEMINI.md, docs/runner-support.md (l.26-39), plugins/pipeline-core/install-agy.mjs,
lib/antigravity-topology-refresh-host.mjs, lib/antigravity-plugin-topology.mjs, lib/agy-central-refresh.mjs,
lib/agy-central-snapshot.mjs (header), hooks/antigravity-start-hint.mjs, pins/pipeline-hooks-act-in-repositories-that-never-opted-in.test.mjs.
`install-agy.mjs --help` (read-only) run once. Installer never run in apply mode.

## Claims and sources (install-agy.mjs = I; host = antigravity-topology-refresh-host.mjs = H; topo = antigravity-plugin-topology.mjs)
- Source choices 1/2/3, default 1, 2 refused without dev marketplace: I selectPluginSource l.34-43; prompt l.510.
- "Where to install" 1 Workspace-Local / 2 Global topology refresh, asked only for source 1/2: I l.546-562.
- Workspace writes <project-root>/.agents/plugins.json, relative path, no absolute Pipeline entry: H registryChange l.73-83; topo l.106-109.
- Workspace refuses source outside project, ATR-WORKSPACE-SOURCE-OUTSIDE + "use the global option" repair: H l.136, l.81; topo l.97.
- Workspace refuses stale managed copy / stale global wiring (ATR-GLOBAL-SCOPE): H l.132, l.135 (globalChangeApproved false for choice 1: I l.573).
- Global installs a generated runner view; plugin validate/install when managed copy absent or stale: I l.258-269, l.573-574; H l.132, l.138.
- Global registry $HOME/.gemini/config/plugins.json ends with exactly one Pipeline entry naming the view: H registryBound l.85-89, l.193-196; topo l.128; I l.556.
- Hook-command rewrite in existing global/workspace hooks.json + external-hooks.json, absent files not created, foreign bytes kept: H wiring l.44-45, l.58, l.139.
- Global removes absolute Pipeline entry from tracked workspace plugins.json, relative stays: I l.548 text; H l.69-70, l.80, l.140.
- Autonomous policy paths (workspace .agents/settings.json, global $HOME/.gemini/antigravity-cli/settings.json): I l.596-598.
- Source 3: publish central snapshot, retire owned workspace entries, global refresh, no autonomous question: I l.519-540; lib/agy-central-refresh.mjs l.29-70.
- agy needed for both choices, >= 1.2.12 strict semver; ATR-CLI vs ATR-CLI-CAPABILITY: H prepare l.124, physicalCli l.91; topo l.12-20.
- Workspace choice refused ATR-OTHER-SCOPE-CONFLICT when global registry holds a different Pipeline root: H l.134, conflicting l.70.
- --refresh is global, prints plan, asks, --yes only with --refresh: I l.21-32, l.394-449, l.624-644.
- Inert outside opted-in repos except destructive git; opt-in hint still fires in undecided repos, decline silences: pin test l.94-109, 163-177, 200-222; antigravity-start-hint l.85-94.

## Findings (report to Elephant/PO)
1. DOC/CODE CONFLICT in the existing workspace procedure: SETUP.md tells the reader to clone the release to a durable directory OUTSIDE
   the project and then choose Workspace-Local. Since D79 (commit 553342999) the code refuses exactly that (ATR-WORKSPACE-SOURCE-OUTSIDE).
   So the documented default route is unreachable as written; the working consumer route today is Global (or a clone inside the project).
   I corrected only the false sentence ("registers that exact physical plugin directory") and documented the refusal; I did NOT change
   the clone location in the procedure (a design decision, stays with PO). GEMINI.md step 1 inherits the same conflict.
2. GEMINI.md said "rather than a global plugin install command": false, the installer offers one. Replaced with a link.
3. Existing "inert ... no injected instructions" is narrower in code: an undecided repo may still receive the optional onboarding hint
   (pin exception (b)). Pinned wording kept; one sentence added after it.
4. Global -> workspace switch: refused by the installer (ATR-OTHER-SCOPE-CONFLICT), no repair shown by code.

## Unverified (named as such in SETUP.md or left out)
- Which workspaces Agy loads a global registration for; how Agy treats .agents/plugins.json in a project never installed.
- Whether a consumer may use --refresh (help calls it a developer entry).
- Repair for global -> workspace. Exact per-user directory of the generated view (not stated: path derives from the machine-plane file).
- Whether a repo-relative workspace entry is claimed by source 3's retirement (observeAntigravityWorkspaceBindings is called without
  trackedRelative; behavior for a relative entry not traced) - not claimed in the docs.

## Checks (after the last commit, each alone, run from the main checkout against the clone's scripts)
- node scratch/clones/k129/harness/scripts/check-doc-contracts.mjs: exit 0, "2567 Markdown file(s), 1977 link(s), 106 anchor check(s)" (also exit 0 before the commit, same counts).
- node --test scratch/clones/k129/harness/scripts/check-doc-contracts.test.mjs: 76 pass, 0 fail.
- node scratch/clones/k129/harness/scripts/check-product-capability-inventory.mjs: PASS (inventory).
- extra: node --test .../pins/pipeline-hooks-act-in-repositories-that-never-opted-in.test.mjs: 14 pass (pins the SETUP inert wording).
Ratchet effect on architecture/boundary-policy.json: none (docs only). No protected paths touched; no protected diff.
