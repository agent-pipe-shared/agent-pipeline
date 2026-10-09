# WIN-AP-D: who creates `<git-common-dir>/agent-pipeline` with an inherited DACL (diagnosis only)

Dispatch WIN-AP-D-20261009, ruleset 0.7.0+claude.20261008194106.da20519d, candidate 4ade16cc1. Diagnosis only: no production or test file was changed.

## 0. Method and limits (read this first)

- Evidence tiers. `[R]` = I read the creating code in this dispatch. `[G]` = the creation line came from a repository search, and the "no Windows hardening" claim is an inference: the file imports none of `windows-private-state.mjs`, `private-boundary.mjs`, `hardened-private-directory.mjs` (import search over lib/, scripts/, hooks/). A file could still harden through some other first-party helper, so `[G]` rows are leads, not proofs.
- Inventory method: search for the double-quoted segment literal `"agent-pipeline"` (lib/ and scripts/) cross-referenced with a search for directory-creation calls (`mkdir`, `mkdirSync`, `mkdirSyncFn`, `ensureDirectoryChain`, `ensurePrivateDirectory`, `secureDirectory`, `ensureHardenedPrivateDirectory`), tests excluded. It misses single-quoted forms, paths assembled in other modules and passed in as parameters, and `hooks/` (out of the briefed scope; for example `hooks/guard-dispatch-budget.mjs` also creates directories under `dispatch-budget` with a recursive mkdir).
- No native run was executed. Reading was conclusive for WHICH code creates the segment first (section 2). It is not independent proof that the created directory is classified insecure by `assessWindowsPrivatePath`; that rests on the WIN-GES-F3 record (its report names the thrown `PB-WINDOWS-ASSURANCE` at the pre-existing-segment branch; stack in `evidence/WIN-GES-F3-20261009/native-gmw-after.txt` lines 569-583, which I took from the record and did not re-read).
- No independent reviewer or advisor was consulted (tool budget). Independent review: pending.
- Stop condition 1 fired: there are far more than 15 creator sites (about 35 rows below, from about 40 distinct files). Per the briefing, all are listed, questions 2 and 4 are answered, and question 3 is marked as needing a design slice (section 3 is a preliminary recommendation, not a design).

## 1. Creator sites (question 1)

Columns: site; function; what it creates; how the `agent-pipeline` segment itself ends up; kernel = listed in `NEVER_LIFTABLE_KERNEL_PATHS` (`lib/guard-maintenance-window.mjs`, list line in brackets, found by searching the list file for the module name). "?" = module name was not part of that search.

### 1a. Read in this dispatch [R]

| # | Site | Function | Creates | Segment outcome | Kernel |
|---|---|---|---|---|---|
| 1 | lib/governance-event-store.mjs:155 | `bindLocalRepositoryFingerprint` (called from `assertPhysicalRoot` :185; public entry `readLocalRepositoryFingerprint` :880) | `<common>/agent-pipeline/governance-events` via `mkdir(directory, { recursive: true, mode: 0o755 })` | win32: inherited DACL, never hardened or assessed. POSIX: mode 0o755 before umask, i.e. group/other readable, unlike every other private sibling | yes [281] |
| 2 | lib/guard/bootstrap-receipt.mjs:63 and :93 | `recordBootstrapObservation`, `recordBootstrapPreflightReceipt` | `<common>/agent-pipeline/bootstrap-receipt` (dir helper :17-19), recursive mkdir 0o700 | win32: inherited DACL. POSIX: 0o700 | yes [695] |
| 3 | scripts/po-human-approval.mjs:337-342 | `writeRepoKeyDirectory` | `<common>/agent-pipeline` itself, recursive mkdir 0o700 then best-effort `chmod` | win32: inherited DACL (`chmod` does not change a DACL). The function is marked legacy / unused by `setup` in its own comment (:327-332) | yes [375] |
| 4 | lib/guard-maintenance-window.mjs:808 | `secureDirectory`, reached from `storagePaths` (:853-856) | `agent-pipeline` AND `guard-maintenance-window` in one recursive mkdir | win32: only the leaf is hardened (`existed ? assess : harden`, :811-813, `existed` is about the leaf). A newly created `agent-pipeline` keeps its inherited DACL; a pre-existing insecure `agent-pipeline` is not looked at, which is why HEAD is green | yes (itself) [126] |

### 1b. Already harden what they create [R], listed so they are not mistaken for creators of the problem

| Site | Behaviour |
|---|---|
| lib/human-guard-override.mjs:655-706 (`secureDirectory`, used by `storage()` :709) | Records every missing component before the recursive mkdir and hardens each created one, `agent-pipeline` included (NVA-PAWINACL-2 comment :660-670). A pre-existing path is only assessed at the final path, so an insecure intermediate is tolerated. kernel yes [192] |
| lib/private-boundary.mjs:79-106 (`ensurePrivateDirectory`) | Non-recursive per-component mkdir; on win32 `assureWindowsPrivateDirectories` hardens created components and assesses raced ones. When nothing is created it assesses the final directory only, so a pre-existing insecure intermediate is tolerated. kernel yes [201] |
| lib/hardened-private-directory.mjs:95-135 (`ensureHardenedPrivateDirectory`) | Walks EVERY segment from an existing anchor; created segments are hardened, pre-existing segments are assessed and refused (`PB-WINDOWS-ASSURANCE`) if not secure. This is the only helper that refuses a poisoned intermediate. Not listed at HEAD (no entry found), although three kernel-listed installers import it |

### 1c. Creation lines found by search, hardening not read [G]

Segment outcome for all rows: on win32 an inherited DACL is the expected result, with the caveat in section 0. POSIX is 0o700 unless noted.

| # | Site | What it creates | Kernel |
|---|---|---|---|
| 5 | lib/guard/denial-telemetry.mjs:112 | `<common>/agent-pipeline/guard-denial-classes` (:29), recursive | yes [699] |
| 6 | scripts/pre-push-hook-install.mjs:319 (dir :318) | `<common>/agent-pipeline/pre-push-hook`, recursive, in a file that elsewhere uses `ensureHardenedPrivateDirectory` (:698, :712, :724) | yes [309] |
| 7 | lib/critic-verify-lifecycle.mjs:199 (root :180) | `<common>/agent-pipeline/critic-verify-lifecycle`, recursive | yes [515] |
| 8 | scripts/check-protected-path-integrity.mjs:273 (path :250) | `<common>/agent-pipeline/protected-path-integrity`, recursive | yes [448] |
| 9 | lib/dispatch-budget-binding.mjs:166 (path :122) | `<common>/agent-pipeline/dispatch-budget/pending`, recursive | yes [479] |
| 10 | lib/advisor-prohibition-binding.mjs:116, :171 (paths :86, :168) | `<common>/agent-pipeline/advisor-prohibition/{pending,audit}`, recursive | no |
| 11 | lib/worktree-count-check.mjs:228 (paths :219, :223) | `<common>/agent-pipeline/worktree-count-checks`, recursive | no |
| 12 | lib/resume-hint.mjs:390 (dir :377) | `<real>/agent-pipeline/resume-hint`, recursive | no |
| 13 | lib/project-onboarding-v3.mjs:560 (archive :557) | `<common>/agent-pipeline/reinstall-quarantine/<sha>`, recursive; no private-state import | yes [204] |
| 14 | lib/project-authority.mjs:511 (archive :509) | `<common>/agent-pipeline/project-authority-adoption/<sha>`, recursive; imports `hardenWindowsPrivateDirectory` (:24) and a comment at :519 suggests a hardening step follows, not read | yes [202] |
| 15 | lib/session-cleanup-recovery.mjs:187, :1800 (targets :242, :316, :390, :1788) | `<common>/agent-pipeline/session-cleanup-recovery/...`, `scratch-descriptors`, recursive; imports private-state primitives (:44), usage not read | yes [244] |
| 16 | lib/onboarding-continuity.mjs:3557 (:3556) | `<common>/agent-pipeline/session-cleanup-recovery/backups`, recursive; imports `assess` only (:60) | ? |
| 17 | lib/signed-quality-package.mjs:208 (path :190) | `<common>/agent-pipeline/signed-quality-packages/commit-authorizations`, recursive, failure swallowed (`return false`) | ? |
| 18 | lib/verify-run-record.mjs:82 (paths :34, :38) | `<common>/agent-pipeline/verify/{run-records,runs}`, default `ensureDirectory` is a recursive mkdir | ? |
| 19 | scripts/dispatch-budget-grant.mjs:104, :129 | `<common>/agent-pipeline/dispatch-budget` and the grant directory, recursive | ? |
| 20 | scripts/session-critic-finalizer.mjs:87-89 | `<common>/agent-pipeline` is the named parent; recursive mkdir of the `critic-packets` control root | ? |
| 21 | scripts/critic-route-activation.mjs:185 (dir :219) | `<common>/agent-pipeline/critic-route-activation/<id>`, recursive; imports `assess` only (:9) | ? |
| 22 | scripts/bootstrap-trust-recovery.mjs:109 (dir :104) | `<common>/agent-pipeline/bootstrap-trust-recovery`, recursive | ? |
| 23 | scripts/agy-session-consent.mjs:50 (dir :24) | `<common>/agent-pipeline/run/agy-session-consent`, recursive (symlink check :25 only) | ? |
| 24 | scripts/pipeline-state.mjs:5043, :5802, :9191 (namespaces :5035, :5786, :8137) | per-segment `mkdirSync(path, { mode: 0o700 })` under `join(root, "agent-pipeline")`; imports `assess` only (:533) | yes [257] |
| 25 | lib/worktree-lifecycle.mjs:225, :1388 | per-segment cursor walk; imports harden+assess (:39), comment :338 says "hardened outright", not read | yes [248] |
| 26 | scripts/verify-journal.mjs:141-194 | local `ensurePrivateDirectory` chain `[pipeline, verify, runs]`, creates `agent-pipeline` explicitly (:191-194); imports harden+assess (:24) | no |
| 27 | lib/model-role-host-store.mjs:27 (PARTS :16) | per-segment 0o700 chain `agent-pipeline/run/model-role-sessions`; no private-state import | yes [545] |
| 28 | lib/model-family-host-store.mjs:178 | per-segment 0o700 chain; no private-state import | yes [671] |
| 29 | lib/native-goldfish-host-state.mjs:40 (SUBDIRS :22) | per-segment chain `agent-pipeline/run/native-goldfish-host-commit` | yes [357] |
| 30 | lib/agy-host-observed-store.mjs:33 (SUBDIRS :16) | per-segment chain `agent-pipeline/run/agy-host-observed` | yes [362] |
| 31 | lib/design-readiness-runner-host-store.mjs:60 (root :71) | per-segment chain under `join(common, "agent-pipeline")` | yes [577] |
| 32 | lib/codex-design-readiness-host-store.mjs:71, :91 | per-segment 0o700 chain | yes [566] |
| 33 | lib/publication-authority.mjs:57-61 (call :138) | `ensureDirectoryChain(common, ["agent-pipeline", "publication-authority", key])`, per-segment; no private-state import | yes [215] |
| 34 | scripts/native-plugin-readback.mjs:179-183 (call :202) | `ensureDirectoryChain(common, ["agent-pipeline", "native-readback", id])`, per-segment; no private-state import | no |
| 35 | scripts/codex-host-repository-init.mjs:826, :858 | local `ensurePrivateDirectory(agentPipeline, git, ...)` creates `agent-pipeline` explicitly; no private-state import | no |
| 36 | scripts/afk-claude-host.mjs:100-116 | local per-segment `ensurePrivateDirectory` for `["agent-pipeline","afk","worker-requests"]`; imports `assess` only (:35) | no |
| 37 | lib/codex-onboarding-capabilities.mjs:568 (targets :314-316) | `agent-pipeline`, `session-descriptors`, `active`, per-segment | yes [162] |
| 38 | scripts/onboarding-init.mjs:332 | `mkdirSync(dirname(path), { recursive: true })`; whether `path` is under `agent-pipeline` is NOT established (the pointer paths at :444-445 are, this call's `path` is unread); no list entry matched the name (two comment lines, :394 and :396) | see note |

Also seen, creation delegated to the shared helpers in 1b and therefore hardened-on-create: afk-ledger.mjs:298, fanout-ledger.mjs:185, feature-close-audit-executor.mjs:65, rebind-approval.mjs:272, session-power.mjs:355/367, wsl-ipc-compatibility.mjs:388, claude-initial-prompt-pointer.mjs:182, claude-intake-prompt-capture.mjs:126, codex-isolated-critic-contract.mjs:348, close-coordinator.mjs:658/675, publication-close-journal.mjs:459-463 (all `private-boundary.ensurePrivateDirectory`); pre-commit-hook-install.mjs:918/932/941, pre-push-hook-install.mjs:698/712/724, commit-msg-hook-install.mjs:429/458 (`ensureHardenedPrivateDirectory`). codex-onboarding-runtime.mjs:204-270 is a local chain that imports the private-state primitives and has a test asserting the `agent-pipeline` target is hardened (codex-onboarding-runtime.test.mjs:411); I did not read the implementation.

## 2. Which creator runs first in the four new-red cases (question 2)

Cases (all in `plugins/pipeline-core/scripts/guard-maintenance-window.test.mjs`):

1. "prepare with --authorship-mode goldfish-dispatch succeeds ..." (test :164-175; fixture :165, CLI call :167)
2. "prepare with --authorship-mode elephant-direct and a qualifying stage-0 self-check ..." (:177-189; fixture :178)
3. "committed global chat CLI install ..." (:276-292; fixture :277 with `humanApproval: "chat"`, direct library `prepareRequest` :279, CLI install :283)
4. "close on an absent window is a no-op and never appends" (:359-366; fixture :360, CLI close :362)

Common setup: every case begins with `fixture()` (test :94-123). `fixture()` does a `git init`, an initial commit, and then at :118 calls `readLocalRepositoryFingerprint({ repositoryRoot: root })`. Its other writes are in the work tree (`plan.md`, `spec.md`, `project/`, `governance/events/`), none under the git dir.

Call chain to the creator (all anchored above):

`fixture()` :118 -> `readLocalRepositoryFingerprint` (lib/governance-event-store.mjs:880) -> `assertPhysicalRoot` (:179, call at :185) -> `bindLocalRepositoryFingerprint` (:147) -> first-bind branch (:152) -> `mkdir(directory, { recursive: true, mode: 0o755 })` at :155, where `directory` is `<common>/agent-pipeline/governance-events` (:148, :90). That one recursive call creates `agent-pipeline` (inherited DACL on win32, no harden/assess) and `governance-events`.

The later GMW step is the victim, not the creator: cases 1 and 2 reach `run(["prepare", ...])` -> scripts/guard-maintenance-window.mjs:331 -> `prepareGuardMaintenanceWindowRequest` -> `storagePaths(common)` (lib/guard-maintenance-window.mjs:853). Case 3 reaches the same function through the direct library call at test :279 (`prepareRequest`, :136-145) and again on CLI install. Case 4 reaches `storagePaths` through the CLI `close` path (WIN-GES-F3's report places the create call there at about :1947); note this means `close` on a never-used repository creates the window directory, whereas the describe path uses `create: false`. With the WIN-GES-F3 patch (`ensureHardenedPrivateDirectory(common, join(common, "agent-pipeline"))` before `secureDirectory(leaf)`, archived in `evidence/WIN-GES-F3-20261009/gmw-uncommitted.patch.txt`) that call walks the already existing `agent-pipeline`, assesses it, finds the inherited DACL, and throws `PB-WINDOWS-ASSURANCE`. At HEAD the same call tolerates it, because only the leaf is assessed.

Why exactly these four and not the other `prepare`/`install` cases: the invalid-mode, missing-flag and non-qualifying stage-0 cases reject before `storagePaths`; the cases that install with a ledger append were already red at HEAD (GES-LOCKED) and now fail one step earlier. This part of the explanation is taken from the WIN-GES-F3 report, not re-run.

Even without `fixture()`, the CLI itself calls the same creator first: the fixture comment at test :114-117 states that `repositoryFingerprintFor()` in scripts/guard-maintenance-window.mjs reads `readLocalRepositoryFingerprint`. So the order "governance-event-store bind, then GMW" is intrinsic to `install` and `close`, not an artefact of the test.

Confidence: the creator identity and ordering are conclusive by reading (single creator before `storagePaths` in every chain). The DACL verdict is inherited from WIN-GES-F3. A cheap native pin that would settle the verdict independently: in a fresh temp repo call `readLocalRepositoryFingerprint`, then `assessWindowsPrivatePath(<common>/agent-pipeline)` and print the status. I did not run it.

## 3. Shared creator and recommended single-creator design (question 3; needs a design slice)

`ensureHardenedPrivateDirectory` (lib/hardened-private-directory.mjs:95) exists and is the strictest of the three shared helpers. Users at HEAD: scripts/pre-commit-hook-install.mjs (:143 import; :918, :932, :941), scripts/pre-push-hook-install.mjs (:47; :698, :712, :724), scripts/commit-msg-hook-install.mjs (:32; :429, :458); tests lib/hardened-private-directory.test.mjs and .install.test.mjs. The WIN-GES-F3 patch would add lib/guard-maintenance-window.mjs as a fourth user.

The three helpers disagree about a pre-existing insecure intermediate: `ensureHardenedPrivateDirectory` refuses it; `private-boundary.ensurePrivateDirectory` and the two `secureDirectory` variants tolerate it. So today an unhardened first creator of `agent-pipeline` is invisible to almost everything and surfaces only in the installers (and in the F3 patch). Any slice that makes another site strict, without first fixing the first creators, converts latent state into hard failures.

Preliminary recommendation (not a finished design):

- D0, a decision before code: what a pre-existing insecure `agent-pipeline` means (refuse, or repair in place by hardening it). Existing checkouts already carry unhardened roots created by sites 1-3 above, so "refuse" will fail on real machines until a repair verb exists. This is the same assess-and-refuse question WIN-GES-F3 raised; it decides what the pins below assert.
- One new thin entry point, `ensureAgentPipelineRoot(common)`, living with `ensureHardenedPrivateDirectory` and implemented on it, called as the first step by every site that creates anything below the segment; the shared helpers (`private-boundary.ensurePrivateDirectory`, both `secureDirectory` variants) call it internally so their many callers need no edit.
- Slices, in order, each flipping a RED pin first:
  1. S1 (test-only dispatch, new file such as `plugins/pipeline-core/lib/agent-pipeline-root-creation.test.mjs`): per creator, fresh repo, run the creator, then assert the segment is private (win32: `assessWindowsPrivatePath(...).status === "secure"`; POSIX: `(mode & 0o077) === 0`). Pins: (a) `readLocalRepositoryFingerprint` on a fresh repo, which should be RED on POSIX/WSL already because of the 0o755 mkdir (checkable without Windows); (b) `recordBootstrapPreflightReceipt` with an injected subagent identity (RED on win32 only); (c) a denial-telemetry write (win32); (d) the four WIN-GES-F3 reds, once the F3 patch is re-landed, as the integration pin; (e) each installer run after a deliberately inherited-DACL `agent-pipeline` (regression guard for D0's outcome).
  2. S2 (lib/hardened-private-directory.mjs, adds the entry point; not kernel-listed at HEAD, but imported by kernel installers, so the closure rule will require a list entry, as WIN-GES-F3 found). 
  3. S3 lib/governance-event-store.mjs:155 (kernel, signed-package route): call the entry point instead of the bare recursive mkdir; also removes the 0o755 on POSIX. Must precede S5.
  4. S4 lib/guard/bootstrap-receipt.mjs:63/93 and lib/guard/denial-telemetry.mjs:112 (kernel and `lib/guard/`, signed-package route; forbidden to edit in this dispatch).
  5. S5 lib/guard-maintenance-window.mjs `storagePaths` (kernel, signed-package route): re-land the WIN-GES-F3 patch on top of S2-S4, so its stricter walk never meets an unhardened first creator.
  6. S6 shared helpers `private-boundary.ensurePrivateDirectory` and `human-guard-override.secureDirectory` (both kernel): call the entry point internally.
  7. S7 bespoke chain creators, kernel group first (host-store family sites 27-32, publication-authority 33, pipeline-state 24, project-onboarding-v3 13, critic-verify-lifecycle 7, check-protected-path-integrity 8, dispatch-budget-binding 9, pre-push-hook-install:319), then non-kernel (10, 11, 12, 26, 34, 35, 36 and the `[G]` rows of unknown kernel status). Several of these may be better collapsed into one helper call than edited one by one.
- Kernel-listed changes (S3, S4, S5, S6, parts of S7) ride the signed-package route; S1, S2 and the non-kernel part of S7 do not.

## 4. Does a real fresh user path hit it today? (question 4)

By construction, yes for the creation: on a fresh win32 repository, sites 1, 2 and 5 create `agent-pipeline` with an inherited DACL on ordinary first use: site 1 on any governance-store read or append (and on GMW `install`/`close`, per the fixture comment), site 2 on every dispatched subagent's sanctioned preflight (this very dispatch ran it), site 5 on any guard denial. Whether the installers' `PB-WINDOWS-ASSURANCE` then fires is a matter of order: the three installers call `ensureHardenedPrivateDirectory(commonDir, join(commonDir, "agent-pipeline", "<hook>"))` and will refuse if an earlier unhardened creator already made `agent-pipeline`. The same applies to GMW `prepare`/`install`/`close` once the WIN-GES-F3 patch lands.

Not demonstrated in a real flow in this dispatch: I did not run a fresh-repository onboarding on win32, and I did not inspect this repository's live `.git/agent-pipeline` (forbidden). The preflight output I saw lists the private-state directory as present, which means the segment already exists here and its DACL class is unknown to me. The pin that would settle it is S1 (e) plus a read-only `assessWindowsPrivatePath` of a real checkout's `agent-pipeline`, run by whoever is allowed to look at that directory.

## 5. Verification and handoff

- Reads only; no production, test, hook, `lib/guard/` or `harness/` file touched. No native run was made (see section 0).
- DoD check: `node --test harness/scripts/check-consumer-safe-paths.test.mjs` is recorded in the dispatch record.
- Facts to carry forward: (1) the first creator in every red case is lib/governance-event-store.mjs:155; (2) three shared helpers with three different strictness levels; (3) D0 must be decided before any slice makes a site stricter.
