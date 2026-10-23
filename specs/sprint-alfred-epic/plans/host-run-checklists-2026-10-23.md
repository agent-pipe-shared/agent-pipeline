# Host-run acceptance checklists (2026-10-23)

Purpose: one checklist per run the PO performs on a real host, so the runs can be worked through without searching. Every command below is
copied from a file of this repository, and the source is cited in brackets. A step with no repository command says
`(command not found in the repository; ask)`. Nothing here is a decision: the decisions are in
`specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md` (cited as "tiles") and `specs/sprint-alfred-epic/plans/po-list-afk-2026-10-22.md`
(cited as "PO list"). Status of the whole list: prepared by a Goldfish, independent Critic read and PO acceptance pending.

All commands run from the repository root unless a step says otherwise. Item ids are the ids in
`specs/sprint-alfred-epic/evidence/delivery-remeasure-2026-10-23/README.md` (section "Open per item") and `snapshot.json`; the backlog file is
`backlog/items/<date>-<id without the pipeline. prefix>.md`.

## 0. Shared preconditions and recording rules

| Step | Action | Source |
|---|---|---|
| 0.1 | The sitting is applied and the dev build stamped and installed ONLY on the PO's call. Stamp plan: `node scripts/stamp-candidate.mjs --dry-run`; stamp without the flag from a frozen tree; the script never installs, the marketplace install is the operator's step. Version format `0.7.0+<runner>.<UTC yyyymmddhhmmss>.<7-char HEAD>`. | `docs/operating-tools.md` "Candidate stamp" |
| 0.2 | Record the installed version/stamp of each runner before the run: the first `/pipeline-core:pipeline-start` of a new session reports plugin version and root. Claude: `claude plugin list --json`. Codex: `codex plugin list --marketplace agent-pipeline --json` (must report exactly one installed and enabled `pipeline-core@agent-pipeline`). Antigravity: the session lock and the preflight (see run 2). | `SETUP.md` step 0 |
| 0.3 | Link `node` at a stable path BEFORE the Windows and Antigravity runs (not under a version-manager path such as `fnm`; the preflight reports `NODE-SANDBOX-UNREACHABLE` otherwise). The linking command is host specific: `(command not found in the repository; ask)`. Readback on the host: `command -v node` (macOS/Linux) or `where.exe node` (Windows); for Antigravity also confirm Agy's own command tool can run `node --version` in a new session. | PO list row 9; tiles batch 8 row "3, 4, 5, 9"; `SETUP.md` "Node.js on the host's PATH" |
| 0.4 | Fully end the host process and start a new session after any binding or refresh; a reload is not enough. | `SETUP.md` step 0 |
| 0.5 | Where results go: the repository's evidence folder is `specs/sprint-alfred-epic/evidence/`. Existing naming for counted runs: `pin-counted-results-<yyyy-mm-dd>[-<letter>].md` (header with HEAD, date, host, node, runner note; counted table; typed-skip section); for a host classification: `windows-verify-sample-<yyyymmdd>.md`. No host-run file name is fixed by the repository, so this list proposes `host-run-<run>-<yyyy-mm-dd>.md` (`<run>` = `windows`, `antigravity`, `greenfield-<runner>`, `codex-wsl-advisor`). Repository-relative text only: no home paths, no secrets, no transcripts. | `specs/sprint-alfred-epic/evidence/` listing; `docs/operating-tools.md` "Serial count pass" |
| 0.6 | A pin is run alone: `node --test <pin file>`; read the node summary lines (`tests`, `pass`, `fail`, `skipped`, `todo`) and copy them. Pins live in `plugins/pipeline-core/lib/pins/<item id>.test.mjs`. | `docs/operating-tools.md`; pins directory |
| 0.7 | Closing rule: a host run closes only an "open acceptance run (owner native-host)" entry of a delivery-matrix row. Every row also keeps the independent Critic review and PO acceptance; no row becomes 100 from a host run. A typed skip never qualifies a clause. | `specs/sprint-alfred-epic/plans/index-75-plan-2026-10-23.md`; tiles batch 10 |

## 1. Native Windows run

Scope rule: D133 takes full native-Windows runs out of scope; only single-file canaries are run (named so in the matrix rows and in
`specs/sprint-alfred-epic/evidence/windows-verify-sample-20261017.md`). The set below is the canary set of this list.

### 1.1 Preconditions

- Installed stamp including the sitting steps for K96, K105 (ceremony C32, runbook steps 25 to 28) and K97 (C33, steps 29 and 30); without them the credential cases below do not exist. Source: `specs/sprint-alfred-epic/evidence/sitting/runbook.md`.
- A checkout of the stamped commit on the Windows drive, `node` at a stable path (0.3), a clean tree (`git status --short` empty).
- The WSL UNC case needs a path reachable as `\\wsl.localhost\...` from Windows (the repository gives the shape only; the concrete path is the PO's).

### 1.2 Credential-target refusal on `Read` and the native view tools (K96, K105)

| # | Action | Expected | Record |
|---|---|---|---|
| 1 | In the Claude session: ask the agent to `Read` a file named like a credential inside the project (fixture shape from the pin: `vault/id_rsa`, a Windows path, and the same path with forward slashes). | Refused with `GUARD-READ-CREDENTIAL-TARGET:` (not `GUARD-READ-TARGET:`), the path named as the cause, and the repair line "ask the human to put the content you need into a non-credential file inside the project (for example under docs/ or scratch/)". | Verbatim denial text, repository-relative; whether the Windows spelling (`\` and `/`) was refused the same way. |
| 2 | Same with native `Grep` (`path` = the credential file, with and without `glob`) and `Glob` (`pattern: id_rsa`, `path` = the directory). | Same code and the sentence "A signed override is a shell-command route only; a native read tool has none, so the copy above is the repair for this tool." | Denial text per tool. |
| 3 | Negative controls: `Read` of an ordinary in-root file under `docs/`; `Read` of a path outside the project (`..\..\outside.md`). | Ordinary file allowed. Outside path refused with the generic `GUARD-READ-TARGET:` and NOT with the credential code. | Exit/verdict per control. |
| 4 | Run the pins alone: `node --test plugins/pipeline-core/lib/pins/read-blocks-and-misleading-denial-texts-across-runners.test.mjs` and `node --test plugins/pipeline-core/hooks/antigravity-native-read-credential-roots.test.mjs`. | Case M8 (Claude lane) and the Antigravity credential-roots cases pass; the U3 case (below) RUNS on win32 instead of skipping. | Summary lines of both runs. |
| 5 | WSL UNC exact file (case U3, "native Read of a user-supplied WSL UNC exact file is admitted; UNC credential roots and secret basenames stay denied"): the same pin file as step 4 (U3 is `skip: !WIN && LINUX_RUN`, so it runs only here). In the session, `Read` a non-credential file by its `\\wsl.localhost\...` path. | Admitted. A UNC credential root or secret basename stays denied. | Whether U3 passed; the denial text if not. |

Sources: `backlog/items/2026-10-03-read-blocks-and-misleading-denial-texts-across-runners.md` ("Triage 2026-10-23"); held patches `specs/sprint-alfred-epic/evidence/held-patches/k96-read-credential-target-protected.patch` and `k105-claude-native-read-credential-code-unprotected.patch`; tiles batch 6 rows M7/M5; PO list row 38.
Closes: matrix row `pipeline.read-blocks-and-misleading-denial-texts-across-runners` (the U3 host clause; the item is "closed as built except the host clause").
If the Windows behaviour differs from the table: record it as a finding on that item; PO list row 38 says "accepted as is" and the release note names the host limit.

### 1.3 Shared `git show` lane with `| tail -N` (K97)

| # | Action | Expected | Record |
|---|---|---|---|
| 1 | In a session on the stamped candidate, run each as its own command: `git show HEAD:docs/state.md \| tail -n 5`; `git -C . show HEAD:docs/state.md \| tail -3 2>/dev/null`; `git show HEAD:<path> --format= -- \| head -20`. | Each admitted (the bounded git-to-head/tail pipeline; `git show <rev>:<path>` with one optional `--format=` and a trailing `--` before the single sink). | Verdict per command. |
| 2 | Refusal controls: `git log \| tail -n 501`; `git show HEAD:.env \| tail -n 5`; `git -C .. log \| tail -n 3`. | Each refused (outside the admitted shape). | Verdict per command. |
| 3 | `node --test plugins/pipeline-core/lib/pins/advertised-git-to-head-pipeline-is-refused.test.mjs` | Passes; the pin's symlink-dependent case may skip with `host-limitation: cannot create directory symlinks` on Windows. | Summary line and the skip reason. |

Sources: the pin above (admitted and refused lists); `specs/sprint-alfred-epic/evidence/sitting/commit-messages/31-k98p.txt` is the K98 message, the K97 message is `29-k97p.txt`; tiles batch 6 row 15 (AP11 widen) and PO list rows 15 and 38 (shared show lane).
Closes: `pipeline.advertised-git-to-head-pipeline-is-refused` (closes with the K97/K98 patch per tiles); the Windows part is only a canary.

### 1.4 WINACL001 (possible product defect, decided after this run)

- Cause and definition: `(command not found in the repository; ask)`. The repository names WINACL001 only in `docs/state.md` (lines on the Windows efficiency step and the carried item) and PO list row 3; no test or evidence file defines it. The ACL and ancestor pins that the Windows lean set runs are listed in `specs/sprint-alfred-epic/plans/wsl-candidate-sync-runbook.md` section 5 by category only, without file names.
- Action: run the ACL/ancestor pins named by the Windows lean set, one at a time (`node --test <file>`), and record the summary line of each. Which files form the set: `(command not found in the repository; ask)`.
- Decision rule (tiles batch 8): the PO decides after the run whether WINACL001 is a product defect. Record verbatim output of every failing case.
- Closes: PO list row 3 (no matrix item id is named).

### 1.5 Orphan `node.exe` left behind

- No reproduction or acceptance command exists in the repository (PO list row 4, "Native Windows follow-up"). Suggested observation, not a repository command: note the `node.exe` processes before and after the pins above with the host's task list and record any `node.exe` still alive after all runs ended. The exact observation command: `(command not found in the repository; ask)`.
- Record: process count before/after, which run left it, command line if the host shows it.
- Closes: PO list row 4 (follow-up item; no matrix item id).

### 1.6 D133 pins: typed skips only (private temp root, Windows OS temp DACL, design-workflow-package-v2)

D133 closes the native clauses of these three items (tiles batch 10, "D133 items"): the Linux/WSL count stands and the release-note host limit is "Windows file-permission checks verified on Linux/WSL only". The run only records what the pins do on win32; no acceptance depends on it.

| Pin | Command | win32 cases to note |
|---|---|---|
| `private-temp-root-not-secure-branch-has-no-test-seam` | `node --test plugins/pipeline-core/lib/pins/private-temp-root-not-secure-branch-has-no-test-seam.test.mjs` | The `WIN_ONLY` cases (seams consulted on win32 only) run here; the POSIX-branch case skips. |
| `windows-os-temp-root-dacl-fails-private-state-assurance-for-test-fixtures` | `node --test plugins/pipeline-core/lib/pins/windows-os-temp-root-dacl-fails-private-state-assurance-for-test-fixtures.test.mjs` | P1, P2, P5, P6 run here; "premise not present" cases may skip. |
| `design-workflow-package-v2-readiness-fixture-fails-on-windows` | `node --test plugins/pipeline-core/lib/pins/design-workflow-package-v2-readiness-fixture-fails-on-windows.test.mjs` | A2, B1, B2 run here; C1 and C2 (Linux route) skip with the reason naming the Linux/WSL route. |

Record: the summary line and every skip reason; a FAIL is a new finding for the item, not a blocker of D133. Do not weaken any assertion to turn a Windows run green (QG-04; PO rule "never replace features for green tests").
Closes: nothing newly; it documents the typed skips under D133 for `pipeline.private-temp-root-not-secure-branch-has-no-test-seam`, `pipeline.windows-os-temp-root-dacl-fails-private-state-assurance-for-test-fixtures`, `pipeline.design-workflow-package-v2-readiness-fixture-fails-on-windows`.

### 1.7 Canary: capture-evidence npm launch (AC-122)

- Command: `node --test plugins/pipeline-core/lib/pins/capture-evidence-does-not-normalize-windows-npm-launch.test.mjs`
- Expected: P1 to P3 injected cases pass on any host; the two native cases ("P1 native win32 (stock host environment): bare `npm` is normalized under the host's own unmodified PATHEXT" and "P1/P3 native win32: real `npm.cmd` runs through the normalized launch with the real status and output") run on win32 instead of skipping.
- Record: summary line; whether both native cases passed; the host's `node --version` and `npm --version`.
- Closes: the open host canary of `pipeline.capture-evidence-does-not-normalize-windows-npm-launch` (item "Open work": the two win32 skips are an open host canary; AC-122, tiles batch 11). The owner decision (reconstructed text) is already confirmed.

## 2. Antigravity run (WSL, then native if available)

### 2.1 Preconditions

- Antigravity CLI `agy` version 1.2.12 or later on the installer's PATH (`ATR-CLI`, `ATR-CLI-CAPABILITY` otherwise). [`SETUP.md` "Choosing where to bind"]
- Pre-release candidate: SETUP.md says there is no approved Antigravity route before the `v0.7.0` tag; a developer checkout is "only for an explicit pre-release test". The installer's source choice `2` (Local Marketplace) is the developer route and needs the development marketplace directory. [`SETUP.md` step 0 and "Antigravity (Agy): workspace-local binding"]
- The spike S1 to S6 must run in a disposable isolated account/container or a documented CLI configuration-root override, never against the real `~/.gemini` (the item forbids repurposing HOME). The disposable setup command: `(command not found in the repository; ask)`.
- `node` at a stable path (0.3).

### 2.2 S1 to S6 (item `agy-imported-plugin-snapshot-shadows-registered-plugin`: "does a workspace entry load")

Source: `backlog/items/2026-09-28-agy-imported-plugin-snapshot-shadows-registered-plugin.md`, Proposal section 0 and "Reconciled 2026-10-23" (topology option B is decided by D65; the spike decides whether a workspace entry loads; a negative result comes back as a finding). The pin `plugins/pipeline-core/lib/pins/agy-imported-plugin-snapshot-shadows-registered-plugin.test.mjs` covers the Linux side. The exact `agy` argv for each question is not given in the item beyond the verbs named below; anything else is `(command not found in the repository; ask)`.

| Id | Question | Verbs named in the repository | Record |
|---|---|---|---|
| S1 | Does `agy plugin install <absolute local dir>` accept a local path; where does it copy to; is the managed dir keyed by folder name or manifest `name` (`agent-pipeline-core`); does `agy plugin list` show it afterwards? | `agy plugin install`, `agy plugin list` | Copy location, key, list output |
| S2 | Precedence: same plugin name as managed copy and as `plugins.json` entry (global, and separately workspace `.agents/plugins.json`): which does a NEW session load? Use the requires-bootstrap lock version plus an independent loaded-source observation. `agy plugin list` is not proof. | session lock read via the first `/pipeline-core:pipeline-start` of the new session | Lock version, reported plugin root, which source won |
| S3 | After CLI 1.2.10, does a `plugins.json` entry that points at a plugin ROOT load it, or does agy scan its children as a container (making the registry entry inert)? Includes: does a relative `entries[].path` resolve against the workspace (Reconciled section, `UC02C018` to `UC02C020`)? | `plugins.json` entry (written by the installer; do not hand-edit) | Loaded or inert, relative path resolved or not |
| S4 | What does `agy plugin import [source]` do; what created the `source: "antigravity"` import; can a later import re-create a snapshot after removal? | `agy plugin import` | Behaviour per observation |
| S5 | Is there a workspace-scoped managed install, or is managed install always global? | `agy plugin install` | Scope |
| S6 | Does a running session pick up changes (`/skills reload`) or is a full restart required for skills, agents and hooks? | `/skills reload` | Reload sufficient or not, per component |

Installer commands that exist for the run: `node "$pipeline_release_dir/plugins/pipeline-core/install-agy.mjs"` (interactive; source `1`, install location `1` Workspace-Local or `2` Global topology refresh) and `node "$pipeline_release_dir/plugins/pipeline-core/install-agy.mjs" --refresh` (prints the plan, asks to confirm; `--yes` only together with `--refresh`). After either: fully restart Agy and read the session lock. `agy plugin uninstall agent-pipeline-core` is the item's candidate cleanup and is "still unverified"; the item says the spike precedes any cleanup. [`SETUP.md` Agy section; item "Not in scope"]
Expected: one agy-visible source of `agent-pipeline-core` per effective scope; after a refresh the topology verdict is `single-current` (diagnostic only, not proof of what is loaded).
Record in: `specs/sprint-alfred-epic/evidence/host-run-antigravity-<date>.md` (proposed name); the item says "backlog/evidence/" for the S1 to S6 results, which is a different folder than the sprint evidence folder: which one wins is `(command not found in the repository; ask)`.
Closes: `pipeline.agy-imported-plugin-snapshot-shadows-registered-plugin` (the spike and loaded-root clause).

### 2.3 Global registration scope (which workspaces Agy loads)

- Question (from `SETUP.md` "Not verified from the code"): for which workspaces does Agy load a GLOBAL registration, and how does it treat `.agents/plugins.json` in a project that never ran the installer; and whether `--refresh` can be used by a consumer.
- Action: after a Global topology refresh (installer choice `2`), open a new Agy session (a) in the opted-in project and (b) in a directory that never ran the installer (the item names `~/src` as the example), and in each run `/pipeline-core:pipeline-start`.
- Expected: in (b) the hooks are inert (no blocking, no injected instructions, no writes; destructive-git protection still active; the optional onboarding hint may show). [`SETUP.md` "Inert outside opted-in repositories"]
- Record: per directory whether the plugin loaded, the lock version, and whether any hook fired. Update target: `SETUP.md` "Not verified from the code" paragraph (documentation owner, after the run).
- Closes: the activation-scope paragraph of `pipeline.agy-imported-plugin-snapshot-shadows-registered-plugin`.

### 2.4 F-05 parallel-write re-check

- Action: in an Agy session on the stamped candidate, dispatch a Goldfish that issues several `write_to_file` calls in one turn (the original finding: 3 of 4 failed with `permission check failed for write_file`).
- Expected (item): either all parallel writes succeed (hook race fixed) or, while the race exists, the shipped dispatch reference forbids parallel file writes in one turn. The built mitigation is the reference `plugins/pipeline-core/skills/pipeline-start/references/antigravity-native-dispatch.md`, pinned by the case "AC-108: the AGY Goldfish dispatch reference forbids parallel file writes in one turn until the hook race is fixed".
- How to dispatch such a Goldfish by hand: `(command not found in the repository; ask)`; the documented route is prepare then `invoke_subagent` in `antigravity-native-dispatch.md`.
- Record: how many writes were issued and how many failed, verbatim error if any.
- Closes: the F-05 clause of `pipeline.agy-driver-dispatch-and-design-routes-incomplete`.

### 2.5 First acceptance bullet of `agy-driver-dispatch-and-design-routes-incomplete`

- Bullet: "The AGY runner completes the same greenfield happy path as Claude and Codex" (the item says this is decided nowhere and stays host-session work; tiles batch 8 folds it into the Antigravity run). This IS the Antigravity leg of section 3; do it there and cross-reference.
- Also record while in the session: the preflight `nodeSandbox` result, a handover write (`docs/state.md`) in the design and implementation phases, and the lock-version-mismatch reason if a mismatch occurs (`antigravity-lock-version-mismatch`). [item "Reconciled 2026-10-23"]
- Closes: `pipeline.agy-driver-dispatch-and-design-routes-incomplete` (first acceptance bullet; the route clause is already built and pinned 14/14).

## 3. Greenfield acceptance on Claude, Codex and Antigravity

### 3.1 Preconditions

- Stamped and installed candidate per runner (0.1, 0.2), node stable (0.3), a new empty project directory per runner, a fresh session after each binding (0.4).
- Approval mode set in `pipeline.user.yaml` `gates.push_approval`: `signature` (default; needs the human-approval key prepared as in `SETUP.md` "Human-approval key (one-time setup)") or `chat`. The happy path counts exactly two PO proofs or confirmations. [`docs/usage.md` push approval section; item `three-runner-happy-path-with-two-po-approvals`]
- The step-by-step greenfield procedure as one script: `(command not found in the repository; ask)`. The repository documents it only as the lifecycle: `SETUP.md` step 1 (`pipeline-start` classifies the root after consent), 2 (calibration), 3 (Git lifecycle), 5 (routine sessions), and `docs/usage.md`.

### 3.2 Per-runner checklist (`three-runner-happy-path-with-two-po-approvals`)

Run once per runner: Claude (the item names Claude on Windows), Codex (WSL), Antigravity.

| # | Check | Expected | Record |
|---|---|---|---|
| 1 | Onboarding then design then Advisor then plan approval then implementation then push, without detours. | Pushed feature branch. | Branch and commit; wall time. |
| 2 | Count PO proofs/confirmations. | Exactly two: plan approval and push approval (design gets ONE final approval, signature or chat per mode). | Number and kind of each; any extra interaction is a test failure that names its cause. |
| 3 | Guard overrides. | Zero. | Count (a burnt or repeated signature counts). |
| 4 | Onboarding answers survive a restart (Git author, language, profile). | Not asked again after the restart. | Observed yes/no. |
| 5 | The design approval hand-over. | The PO is handed the `--request` form of the signing command, never `--intent-sha256`; no guard-override warning on the design approval. | The printed command. |
| 6 | After plan approval with no delivery course. | A typed absent-course result `SQ-DELIVERY-COURSE-ABSENT` with a repair, not `SQ-DELIVERY-STATE-UNAVAILABLE`; first item dispatch admitted. | Observed result. |
| 7 | Pin for orientation: `node --test plugins/pipeline-core/lib/pins/three-runner-happy-path-with-two-po-approvals.test.mjs` | 22 cases, 21 pass, 1 skipped (case E, typed `E-HOLD`, the per-runner host run). | Summary line (before the run, for the baseline). |

Record in: `specs/sprint-alfred-epic/evidence/host-run-greenfield-<runner>-<date>.md` (proposed). Closes: `pipeline.three-runner-happy-path-with-two-po-approvals` (stays open until all three runners pass; case E is the pin's open slot).
Antigravity additionally: the section 2.5 items; this leg also closes the first acceptance bullet of `pipeline.agy-driver-dispatch-and-design-routes-incomplete`.

### 3.3 Elephant main-context before/after (`elephant-main-context-spent-on-wake-ups-and-inline-reads`)

- Decision: live sessions only, measured in the Greenfield test; the item stays without a before/after number until then (tiles batch 5, row 33(f)).
- Tool: `node plugins/pipeline-core/scripts/elephant-context-measure.mjs <claude-transcript.jsonl>` for one transcript and `node plugins/pipeline-core/scripts/elephant-context-measure.mjs --compare <before.jsonl> <after.jsonl>` for a pair. It reads a Claude transcript. [usage line of the script]
- Check: the PO target is at most 10 % pipeline administration; the baseline was about 1,900 responses with about 26 % wake-up replies, 22 % inline investigation, 5.4 % guard refusals and 10 % persistence/briefing authoring.
- Where the transcript files are found on a host and which session counts as "before" (a pre-measure build) versus "after" (the stamped candidate): `(command not found in the repository; ask)`. For Codex and Antigravity there is no measure command: `(command not found in the repository; ask)`.
- Record: the printed shares for both transcripts, the transcript response counts, build/stamp of each. Update target: the item's acceptance ("one enforcement-layer measure per cause, each with a before/after measurement").
- Closes: `pipeline.elephant-main-context-spent-on-wake-ups-and-inline-reads`.

### 3.4 `codex-wsl-required-advisor-has-no-completable-route`

Done as part of the Codex leg and run 4 below; do not run it twice.

## 4. Codex/WSL real run for the Advisor route

### 4.1 Preconditions

- Installed Codex candidate (0.2), Codex binary at an absolute path, a Feature-profile greenfield project in WSL, repository consent for private review export recorded and the host's data-export approval available (the first run needed an unplanned host-level export approval; the user must see its exact purpose before prompt construction, once). [item "Description" and "Acceptance"; `docs/runtime-boundary.md` "Private review export consent"; `SETUP.md` "Choose advisor export consent explicitly"]
- The WSL selected-sandbox route is admitted only with a passing sandbox preflight receipt; without one it is `WSL_UNAVAILABLE` with a repair.

### 4.2 Commands

| # | Command (source: `plugins/pipeline-core/scripts/codex-host-advisor-route.mjs`) | Expected |
|---|---|---|
| 1 | `node <plugin-root>/scripts/codex-sandbox-preflight.mjs --run --kind intermediate --codex <absolute-codex-path> --receipt <absolute-new-receipt-path>` (the script's own `WSL_PREFLIGHT_REPAIR`) | A receipt of schema `pipeline.codex-sandbox-preflight.v1` that validates. |
| 2 | `node <plugin-root>/scripts/codex-host-advisor-route.mjs --runner codex --profile feature --consent approved --sandbox-preflight <receipt.json>` (usage: `--runner codex --profile <epic\|feature\|mini> --consent <default\|approved\|declined>`) | Route admitted on WSL (not `WSL_UNAVAILABLE`). Run first WITHOUT `--sandbox-preflight` to see the typed unavailable with reason `wsl-sandbox-preflight-not-passed` and its repair. |
| 3 | Walk the Feature greenfield design to final design-package validation with `/pipeline-core:pipeline-start` in the Codex thread. | Either a valid Advisor answer or a reviewable governed unavailable exception; NOT a stop at `DAC-RECEIPT-MISSING`. |
| 4 | Decline path: decline the host export once. | No model call, no alternate egress, no false receipt; a clear alternative is offered. |
| 5 | Pin for orientation: `node --test plugins/pipeline-core/lib/pins/codex-wsl-required-advisor-has-no-completable-route.test.mjs` | 16 of 16 on the Linux side (count from the item, 2026-10-23). |

Record: the receipt (answer digest or unavailable record) is binding evidence: candidate, route, bounded question and evidence digests, observed host result, answer digest; an unavailable receipt must state only what was attempted. Where the receipt and route-attempt trail are stored and the command to read them back: `(command not found in the repository; ask)`. Evidence file: `specs/sprint-alfred-epic/evidence/host-run-codex-wsl-advisor-<date>.md` (proposed). The existing triage evidence is `specs/sprint-alfred-epic/evidence/0.7-codex-greenfield-advisor-triage-2026-09-27.md`.
Closes: `pipeline.codex-wsl-required-advisor-has-no-completable-route` (acceptance bullets 1 to 5; kept open by tiles batch 6 until this run).

## 5. Order and what else the matrix lists

Suggested order: 0.1 to 0.4, then 1 (Windows, short canaries), 2 (Antigravity S1 to S6 first because a negative result changes what the Antigravity greenfield leg can do), 4 (Codex/WSL Advisor), then 3 (the three greenfield legs, with 3.3 measured on the same sessions).

The delivery matrix lists many further `native-host` clauses beyond the runs asked for here (for example the other Windows items in `specs/sprint-alfred-epic/evidence/delivery-remeasure-2026-10-23/README.md`, Claude Desktop, uninstall on installed hosts, a live Critic dispatch on an installed host). They are not covered by this list; the remeasure README row for the item names the open clause.
