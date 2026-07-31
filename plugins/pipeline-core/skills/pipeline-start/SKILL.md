---
name: pipeline-start
description: "Mandatory session bootstrap for Agent-Pipeline projects (ADR-0010). Run FIRST in every new session and after /clear/plugin refresh. Verifies the V4 lifecycle/native runtime readback, ruleset SHA, pipeline.user.v3 authority, profile/advisory status, model/effort, staleness, calibration, handover and verify before printing the auditable confirmation. Optional role: elephant (default), goldfish or critic."
argument-hint: "[elephant|goldfish|critic]"
---

# pipeline-start — session bootstrap check

Normative source for the general lifecycle: `harness/session-bootstrap.md` in the
**agent-pipeline repo**, plus ADR-0010 and the compact checklist
`harness/checklists/session-start.md` (canon pointers, not runtime reads: these
files live in the agent-pipeline repo, not necessarily in the current project).
For a `pipeline.user.v3` project, routing and advisory authority instead comes
from ADR-0038, `plugins/pipeline-core/config/runner-profiles-v3.json`, the V3
runtime projection, and `advisory-coordinator.mjs`; their V3 contract
supersedes legacy `advisor`/`design-first`/`speed`, `design.advisor`, and
MP-26g bootstrap text in the older general documents. Existing provenance,
staleness, calibration, role, handover and verify rules remain governed by the
general lifecycle. Earlier working names `/pipeline:start` and
`/pipeline-core:start` resolve to THIS skill: `/pipeline-core:pipeline-start`.

**Contract (hard):**

- **No work before the confirmation line.** The confirmation is the auditable proof of the bootstrap; a session without it counts as not bootstrapped.
- **NEVER print the confirmation line without actually performing the steps.** That is the documented main failure mode "reported done, but not verified", and a Critic audits trajectories.
- Normal bootstrap commands below are read-only (git `ls-remote`/`rev-parse`/`log`, file reads). Step 0 may execute only a schema-valid read-only lifecycle action; every mutating lifecycle action is separately confirmed and ends this bootstrap with no confirmation line.
- **Compact continuity:** Compact MUST rerun `pipeline-start` as a continuation re-entry; after that re-entry, automatically continue the persisted next action without waiting. Compact preserves the active task. Only an explicit pause/cancel/replace/redirect, a named gate, completion or a typed blocker may stop continuation.
- **PHX-2 Ledger/Resolver remote-authority transition:** Continuation never
  infers a remote exception from `autonomy`, an old approval or generic
  standing authority. The sole possible exception is a secure **PHX-2 Human
  Governance Decision Ledger** decision resolved by its **Authority Resolver**:
  before execution, it must prove one valid, unconsumed, unrevoked, unexpired
  and integrity-bound PO decision bound exactly to one action, remote, ref,
  candidate and named work package. The record must not originate from an
  agent, Git history, state, cache, agent journal, lifecycle event, readback,
  runner or AGY. Until that Ledger/Resolver path exists, or whenever the
  Resolver or proof is unavailable, missing or ambiguous, this Pipeline has
  no executable remote-action exception: every remote action remains an
  explicit PO gate, while a PO decision is only proposed Ledger input, never
  executable authority. Never promote, copy or infer it from mutable
  `pushApproval` or other state, CLI input, Git history or metadata, cache,
  journal, lifecycle/readback record, agent record, runner or AGY value. Stop
  before execution also for expiry, revocation,
  consumption or authority change. Its sole lifetime ends at successful exact
  remote readback or an explicit revocation/authority change. Read back the
  exact remote ref against the bound candidate, then update only the local
  public evidence/audit path; never include private data or claim success
  before that readback. Readback is observation, never authority. This
  fail-closed rule is platform- and runner-neutral for macOS, Windows and
  Linux and for Claude, Codex and AGY; AGY is a parallel consumer, never a
  prerequisite. Before readback, abort. After publication, never force-push
  or automatically reverse: only new explicit PO authority may name a
  compensating remote action, remote and ref. **Authorization/trust-boundary
  threat-model assessment:** deny an unbound, stale, ambiguous or changed
  remote action; only the PHX-2 Ledger/Resolver proof is authority, and the
  audit path is public-safe.
- **Approved-plan continuation:** After the required plan approval is recorded,
  an internal implementation slice or package is not a PO gate. Within the
  approved scope, complete its required evidence gates, Critic review and
  finding disposition, then autonomously continue with the next package. Ask
  for a PO gate only for a typed blocker, a material scope or authority change,
  a push or other remote action not already admitted by the PHX-2
  Ledger/Resolver proof above, or final feature/epic acceptance. This does not
  weaken the initial readable-PRD approval requirement or any evidence gate.

**Role:** take the role from `$ARGUMENTS` (default when empty: `elephant`).

**Runtime identity line (mandatory, before Step 0):** resolve the absolute
plugin root from this loaded skill and run exactly:

`node "${PIPELINE_PLUGIN_ROOT}/scripts/pipeline-start-preflight.mjs"`

Accept only schema `pipeline.start-preflight.v1`, status
`ready|plugin-refresh-required`, an absolute `pluginRoot` equal to the loaded
skill root, a nonempty `version`, `installedVersion` as either null or a
nonempty version, `installedSource` as
`remote|local-development|unknown`, `executionBoundary` as
`default|host-authorized-wsl`, handoff `none|ready|malformed`, and a `nextAction`
that is null unless status is `ready`. For `ready`, require one read-only
`command` action for the absolute loaded-root `project-onboarding-v3.mjs`
`inspect --root <physical-cwd> --intent bootstrap`, with the same
`executionBoundary`, `mutation:false`, and `requiresConfirmation:false`.
Execute that exact returned action at its declared boundary; never reconstruct
or independently invoke the initial lifecycle inspector. The helper reports handoff presence only and never
prints the private ticket or token.

`plugin-refresh-required` is an attended update handoff, not a project defect:
report the loaded and installed versions, run no onboarding command, and ask
whether the user wants to activate the already installed version. On an
affirmative answer, distinguish the runner. Claude Code uses its native
`/reload-plugins`. Codex has no such slash command: an installation performed
inside `/plugins` is followed by `/new`, as documented by Codex. When a Codex
CLI installation is already current but this preflight proves that the loaded
catalog is older, report `plugin-daemon-refresh-required` and ask for separate
authorization to close all affected Codex sessions. Only after they are closed
may the operator run `codex app-server daemon restart` outside those sessions
and open a new session. Never invent a Codex `/reload-plugins` command, treat an
ordinary TUI `exit` as a daemon restart, or restart the global daemon from an
active project session or without that explicit authorization.

If the exact preflight command cannot start because its loaded plugin root no
longer exists, run only `codex plugin list --json` as the native registry
readback. Prefer exactly one installed, enabled
`pipeline-core@agent-pipeline-local` entry whose marketplace source is local
and exactly contains its `plugins/pipeline-core` source; otherwise accept
exactly one installed, enabled `pipeline-core@agent-pipeline` entry. Require a
nonempty version. This isolated local ID is the sanctioned development override
and prevents an older official session from replacing its cache. When an
accepted entry is present, handle it as
`plugin-refresh-required` using the same runner-specific attended handoff; do
not search cache directories, use a replacement plugin root, inspect the
network, or run onboarding. A missing or ambiguous registry entry remains a
plugin-reload incident.

Only a `ready` result continues. Then print exactly:

> Agent Pipeline start: version {{MANIFEST_VERSION}} · plugin root {{ABSOLUTE_PLUGIN_ROOT}}

The version and root must describe the same loaded distribution. A
missing/unreadable manifest, an ambiguous registry result, a version/root
mismatch, or malformed preflight output is a plugin-reload incident: locate no
replacement by guesswork, run no onboarding command, and ask the user to use
the native refresh path above before retrying. This identity line is diagnostic
only; it does not replace any bootstrap step or confirmation line.

When `installedSource` is `local-development`, print directly afterwards:

> Agent Pipeline source: local-development · registered local Codex marketplace

This is an explicit development topology, not F2 staleness. It permits normal
project work and, after the ordinary exact candidate-bound Verify, Security,
push/publication approval, and readback gates, also permits push and release.
It does not itself satisfy or bypass any delivery gate.

When `executionBoundary` is `host-authorized-wsl`, make that one routing
decision authoritative for the whole bootstrap. Run the exact read-only
lifecycle inspector returned as the preflight `nextAction` and every later
fixed Pipeline bootstrap helper that
inspects or spawns Git, probes worktree/session capability, or observes the
App-Server control socket directly through the host-authorized local boundary.
Run a fixed remote-freshness helper through the host-authorized
network-open/read-only command boundary. Do not first execute any of those helpers in
the workspace sandbox: its known WSL control-path, process, socket, and network
restrictions yield misleading `EPERM`, invalid-layout, unavailable, or DNS
results and must not consume a bootstrap attempt. This is execution routing,
not a readiness or OS-isolation attestation. It does not widen project file
access, Critic/Advisor isolation, network access for local-only helpers, or any
mutation authority; every mutating action retains its exact confirmation and
host-boundary contract. With `default`, use the ordinary boundaries named by
the individual steps.

| Step | Elephant | Goldfish | Critic |
|---|---|---|---|
| 0 consumer-root onboarding state | MANDATORY before Git or V3 authority | fixed by the dispatch receipt | skip |
| 1 presence + loaded state | full | compact (guardrails active? state = SHA from briefing) | compact (confirm read-only toolset) |
| 1a V3 source/runtime authority | MANDATORY | fixed by the dispatch receipt | skip (Critic receives candidate inputs only) |
| 1b model/effort | MANDATORY | skip (frontmatter/dispatch, MP-02) | skip (frontmatter/dispatch, MP-07) |
| 1c spend/usage check | recommended (note limit once) | skip | skip |
| 1d role prohibitions | MANDATORY | skip (prohibitions come via the dispatch briefing) | skip (prohibitions come via the dispatch briefing) |
| 2 staleness check | MANDATORY | skip (Elephant fixed the SHA at dispatch) | skip |
| 3 calibration + denies | MANDATORY | only as referenced in the briefing | only guardrail/constraint parts (review benchmark) |
| 4 handover/state | MANDATORY (read completely) | **FORBIDDEN** — the briefing replaces it | **FORBIDDEN** — no handover, no history |
| 5 verify gate available | MANDATORY | MANDATORY (needed for evidence) | skip (Critic audits evidence, runs no gates) |
| 5b reload reminder (F2 or native update notification) | MANDATORY (before confirmation line) | skip (staleness check, step 2, does not apply to Goldfish) | skip (staleness check, step 2, does not apply to Critic) |
| 6 confirmation line | full + V3/model/role evidence lines | compact | compact |

Goldfish/Critic normally receive their compact variant embedded in the dispatch briefing (goldfish-task / critic-review templates in the agent-pipeline repo). If this skill runs with role `goldfish` or `critic`, execute only the steps marked above.

**Context economy — role-path-only load:** execute and read only the row/section that applies to YOUR actual role (Elephant full path, or Goldfish/Critic compact rows above; Elephant profile variants live under "Same-day light bootstrap" / "Mini bootstrap" below) — do not read the other two roles' full step text as part of running this skill. No step is dropped by this; it only stops front-loading unrelated role material into the session. **Measurable target: context after bootstrap ≤ ~75k tokens (down from >150k today), measured via the statusline.**

## Step 0 — Consumer-root onboarding state (Elephant only; before every Git or V3 check)

Before **any** `git rev-parse`, Git freshness helper, `setup.mjs`, V3 authority
validator, or project-local pipeline assumption, resolve the loaded plugin root
from this skill. Then handle the private restart handoff before the ordinary
inspection:

1. Use only the preflight helper's `handoff` result; do not inspect the
   environment again. `none` is the normal non-restart path. `malformed` is a
   malformed private handoff: report
   `runtime-readback-unavailable`, make no write, and print no confirmation.
2. When handoff is `ready`, run exactly this plugin-local helper through the
   host-authorized local read-only execution boundary:

   `node "${PIPELINE_PLUGIN_ROOT}/scripts/codex-project-runtime-readback-host.mjs" --root "$PWD"`

   Accept only schema `pipeline.codex-project-runtime-readback-status.v1`,
   status `produced`, exit 0, and no receipt fields. The helper is the sole
   ticket consumer: it locates the Codex executable through PATH, verifies its
   bound digest, performs the bounded native `config/read`, and clears the
   private barrier under CAS. Its stdout is status only, never the ticket,
   token, effective config, agents, receipt, or their digests. `unavailable`,
   malformed output, a non-zero exit, replay, same-generation evidence, or any
   other result is `runtime-readback-unavailable`; stop with no confirmation.
3. Whether no handoff existed or the helper succeeded, run the common V4
   bootstrap inspection exactly:

   `node "${PIPELINE_PLUGIN_ROOT}/scripts/project-onboarding-v3.mjs" inspect --root "$PWD" --intent bootstrap`

   After a successful inherited-ticket helper, re-inspect from the beginning;
   never reuse the pre-helper state. A post-ticket result may continue only as
   `ready` with runtime.status `readback-current` and non-null source, target,
   barrier, and readback digests. Any other post-ticket result is the exact
   later V4 state to report, never false restart/readback success.

On the normal path with no inherited ticket, `ready` has exactly three accepted
runtime forms:

- repository mode `local` with repository status `local-valid-writable`,
  runtime status `readback-current`, and non-null source, target, barrier, and
  readback digests;
- repository mode `local` with repository status `local-valid-writable`,
  runtime status `plugin-managed`, a non-null source digest, null
  target/barrier/readback digests, and `appServer.required:true` plus
  `appServer.status:running` and `appServer.code:CAS-READY`;
- repository mode and status `host-managed`, runtime status `plugin-managed`,
  a non-null source digest, null target/barrier/readback digests, and
  `appServer.required:true` plus `appServer.status:running` and
  `appServer.code:CAS-READY`.

The ready plugin-managed forms require both the reserved Codex-control-mount
path and the exact durable host-repository-init admission bound to the current
root, portable authority, kickoff state, handover, PRD, Spec, and private
history. An empty read-only `.codex` directory alone is not runtime authority.
The receipt-bound forms require no runtime initialization or native readback
barrier and make no project-local runtime or native-readback claim. The `local`
form may continue. A
`host-managed` form with a concrete `gitVersion` is the narrowly bound
post-initialization Codex mount: it may continue through bootstrap and session
work, while dispatch/worktrees remain blocked.

The fresh pre-initialization form is not `ready`. Accept only aggregate status
`host-repository-init-required`, repository mode/status `host-managed` with
`gitVersion:null`, runtime status `plugin-managed-unattested`, a non-null source
digest, null target/barrier/readback digests, valid continuity, and
`appServer.required:false`, `appServer.status:not-requested`, and
`appServer.code:null`. Its sole `nextAction` must be exactly this read-only
planner; run it and stop before Step 1:

`node "${PIPELINE_PLUGIN_ROOT}/scripts/codex-host-repository-init.mjs" plan --root "$PWD"`

Accept only schema `pipeline.codex-host-repository-init-plan.v1`, status
`ready`, the exact root, a 64-hex `planSha256`, and a single `applyAction` whose
executable/argv name the same loaded helper and root, bind that digest, set
`--activate`, and declare `mutation:true`, `requiresConfirmation:true`, and
`requiresHostBoundary:true`. Present the exact action and wait. After explicit
confirmation, run it only through the host-authorized local write boundary,
never in the workspace sandbox. Accept only schema
`pipeline.codex-host-repository-init-apply.v1` and status `restart-required`;
it initializes Git without a commit, copies the private kickoff continuity
history into the new Git control path, and atomically publishes one private
digest-bound admission directory containing the transaction intent, post-init
receipt, and receipt-digest marker in `.claude/.runtime` so the fresh Codex
hook can distinguish the otherwise identical empty protected mount. An exact
pending intent plus the same exclusively reserved Git directory identity and
successfully initialized closed core-tree make the confirmed apply
restart-safe; a partial or replaced `.git` fails closed, and pending state is
never readiness by itself. It mutates no portable
Pipeline/project file. Ask for exactly one ordinary project-session restart and
stop. Do not run the onboarding inspector at the host boundary.
After restart, the normal local/plugin-managed form above may continue without
a runtime initialization or another restart.

Codex 0.145 may run PreToolUse against a different physical control-path view
than the successful bootstrap command. For this 0.4.6 compatibility hotfix,
the lifecycle guard may fall back either to the exact fresh-root host-init
admission directory or, for a pre-existing repository only, to the narrowly
recognised complete protected Git control mount (`HEAD`, `config`, `objects`,
and `refs`; never an empty `.git`). The receipt remains bound to the physical
project root, stable Pipeline source/calibration authority, and immutable
kickoff history. An absent, malformed, copied, permission-weakened, drifted,
or merely empty control mount still blocks. Neither compatibility path is a
freshness, push, release, or writable-Git attestation. Issue #25 owns replacing
both with one native cross-view session attestation.

Any mixed form is malformed and fail-closed. The V4 inspection itself carries
the mandatory single read-only App-Server observation for bootstrap, session,
and dispatch whenever it evaluates a possible `ready` result. The non-ready
fresh host-repository-init handoff performs no App-Server observation. Do not
substitute or repeat an observation with a separate readiness claim.

The inspection result must have exact schema `pipeline.project-onboarding.v4`
and the complete closed component/action shape. `inspect` is read-only; it
classifies without initializing Git or writing project files. Do not replace
it with a shell emptiness check, a copied consumer-root `setup.mjs`, generated
project-file heuristics, or an incidental Git error.

The normal bootstrap inspector is authoritative in the execution boundary
selected by the preflight. Under `default`, that is the current Codex session
projection. Under `host-authorized-wsl`, run the exact inspector once directly
at the host-authorized local read-only boundary and require the same physical
root; do not precede it with a sandbox probe or repeat it across both views.
Continue only from that exact typed lifecycle result and never reconstruct a
different action. If a later PreToolUse guard denies an ordinary read despite
an exact `ready` result, report a Pipeline guard adapter defect and stop; do
not plan an unrelated runtime initialization or request an untyped restart.

- **`ready`:** continue to Step 1. This is not a shortcut around the later
  V3, calibration, handover, App-Server, or verify gates.
- **`portable-seed-required` or `adoption-required`:** report F0 or F0A and
  print no confirmation. Execute only a schema-valid read-only `command` action
  whose `mutation` and `requiresConfirmation` fields are both `false`. Read
  back its plan, present the returned digest-bound `apply-portable-seed`,
  `initialize-runtime`, or `apply-repair` action exactly, and wait for explicit
  authorization before any mutation.
- **`runtime-initialization-required`:** follow only its read-only
  `plan-runtime` command action. The returned digest-bound
  `initialize-runtime` action is the sole writer and requires explicit
  confirmation. A completed apply must yield `restart-required`, never ready
  in the writer process.
- **`runtime-attestation-required`:** the selected projection is current but
  has no native readback authority, or its pending restart barrier is bound to
  a different Pipeline launcher/helper or Codex executable identity. Follow
  only its read-only `plan-readback` action. The returned digest-bound
  `apply-readback` action writes only the private restart barrier, replacing a
  stale binding when necessary, requires explicit confirmation, and must yield
  `restart-required` without changing runtime targets.
- **`restart-required`:** expose only the returned `restart-process` action
  with `requiresCurrentProcessExit:true` and a `launch` object declaring
  `executionBoundary:external-terminal`, `invocation:user-copy-only`, and
  `codexToolCallPermitted:false`. These are a hard dispatch prohibition, not
  descriptive hints: never submit the launcher to Bash, exec, PTY, or any
  other Codex tool, even after the user confirms it. Never execute it through
  an ordinary session restart either: those paths cannot provide the external
  controlling terminal and a normal restart cannot inherit the private token.
  After explicit confirmation, instruct the user to close the current project
  session and run the exact digest-bound action in a real external terminal.
  The returned `launch.copyCommand` object is mandatory:
  require `maxColumns:72` plus nonempty `posix` and `powershell` strings whose
  physical lines do not exceed that bound. On Linux and macOS print the exact
  returned `posix` string; on Windows print the exact returned `powershell`
  string. Put it in a fenced code block and never reconstruct it from argv,
  reflow it, expose it as wrapped prose, or add terminal gutter characters.
  The bounded script assembles long paths from short variable assignments so
  no path, quote, or digest depends on visual wrapping. The launcher refuses
  an active `CODEX_THREAD_ID` before
  issuing a ticket and returns `external-launch-required`. The confirmed
  external wrapper issues the one-use ticket and invokes the digest-bound
  readback helper directly. That helper starts a separate strict App Server,
  performs only the bound `config/read`, and clears the restart barrier before
  the wrapper starts an ordinary token-free Codex TUI. `launched` means both
  readback and TUI start succeeded. `readback-produced` means the barrier was
  cleared but the TUI could not be started; the user may then start ordinary
  Codex without another launcher invocation. `readback-unavailable` or
  `launch-unavailable` is terminal for this attempt and may be retried only at
  or after its `retryAfterEpochMs`; never create parallel live tickets. The
  resulting ordinary TUI re-enters this Step 0 with no inherited handoff and
  must observe the current cleared readback. Never run the readback helper in
  the writer/current process, synthesize a ticket, or continue normal
  bootstrap before the external wrapper has produced the readback.
- **`kickoff-required`:** stop before normal bootstrap. If the user has already
  supplied a concrete project intent, derive one concise goal summary from it;
  otherwise collect exactly that one input. The goal is a short project
  objective, not the pasted design, requirements list, acceptance criteria, or
  PRD: use one line, ideally 3–12 words, and at most 160 UTF-8 bytes. When the
  user's intent is clear, shorten it without another question. Preserve the
  complete design in conversation for the post-bootstrap PRD/spec review, but
  never pass it through `--goal`. Then run exactly:

  `node "${PIPELINE_PLUGIN_ROOT}/scripts/project-onboarding-v3.mjs" kickoff plan --root "$PWD" --goal "{{GOAL}}"`

  `kickoff` and `plan` are two separate argv elements in that order. Never use
  or probe guessed aliases such as `kickoff-plan`, `plan-kickoff`,
  `plan --goal`, or bare `kickoff`. Do not inspect the script, search GitHub,
  browse the web, call a repository connector, or run any remote command to
  discover kickoff syntax: this skill is the complete local authority.
  Accept only schema `pipeline.codex-onboarding-kickoff-plan.v1`, the exact
  root and goal, a 64-hex `planSha256`, and its returned digest-bound
  `kickoff apply` action. Present that exact apply and wait for explicit
  confirmation. After confirmation execute only its returned argv, whose
  shape is:

  `node "${PIPELINE_PLUGIN_ROOT}/scripts/project-onboarding-v3.mjs" kickoff apply --root "$PWD" --goal "{{SAME_GOAL}}" --plan-sha256 "{{PLAN_SHA256}}" --activate`

  Re-inspect through the returned lifecycle result. Never reconstruct the
  digest, split the goal, or substitute a network result. The kickoff apply is
  a separately confirmed mutation.
- **`continuity-damaged`:** execute only its exact read-only `plan-repair`
  action. A supported result may expose one digest-bound `apply-repair`
  command for either the recognized invalid active-turn resume pair or an
  established pre-continuity state carrying PO authority. Present that exact
  action and wait for explicit confirmation. The repair never rewrites kickoff
  history. If the plan returns `continuity_repair_unavailable` with
  `nextAction:null`, stop; do not repeat the plan, invent hashes, or edit
  `.claude/pipeline-state.json` directly.
- **`partial|invalid|unsafe|migration-required|adoption-required|repository-mount-read-only|repository-control-path-invalid|git-capability-unavailable|project-root-read-only|repository-mode-unsupported|repository-observation-unavailable|session-capability-unavailable|worktree-capability-unavailable|runtime-target-read-only|runtime-readback-unavailable|projection-drift|continuity-damaged|continuity-observation-unavailable|app-server-execution-denied|app-server-not-running|app-server-unavailable`:**
  stop with no confirmation and report the exact diagnostics and closed
  `nextAction`. A read-only action may run only when its schema, executable,
  argv, expected result, `mutation:false`, and `requiresConfirmation:false`
  fields are exact. Never auto-execute a mutating action, invent a second
  action, edit a generated projection, or infer success from files.
- A malformed result, unknown state/action/diagnostic, or inconsistent
  component is fail-closed with no write and no confirmation.

Codex and Claude expose a visible, non-mutating SessionStart onboarding hint.
For an ungoverned folder it is an opt-in gate: explain the workflow briefly,
ask whether to install it, end the turn, and run neither this skill nor an
onboarding inspection until the user answers affirmatively. For an already
governed folder this skill remains the mandatory entry. The hint is not an
invisible automatic initializer or host-wide write barrier; every mutating
lifecycle action still requires its digest-bound confirmation.

## Step 1 — Ruleset presence + loaded state

1. **Presence:** if you are executing this skill, the plugin `pipeline-core` is loaded — this very execution is the presence proof (session-bootstrap §3 step 1). If instead the invocation failed with "unknown skill", that is case **F1** (see failure table; the CLAUDE.md fallback line detects exactly this).
2. **Loaded state (name a concrete SHA, never "something is installed"):** resolve in this order and REPORT WHICH SOURCE you used:
   - **Self-application / plugin-dev case** (current project IS the agent-pipeline repo, or the session runs `--plugin-dir` against a checkout): `git rev-parse HEAD` in that checkout = loaded state.
   - **Installed-plugin case:** locate the marketplace clone/cache under `~/.claude/plugins/` (directory whose `.claude-plugin/marketplace.json` has `"name": "agent-pipeline"`); if it is a git clone, `git -C {{DIR}} rev-parse HEAD` = loaded state.
   - **Installed-plugin case, machine-readable source:** `~/.claude/plugins/installed_plugins.json` → entry `pipeline-core@agent-pipeline`, field `gitCommitSha` (full SHA; `version` carries the 12-char prefix, `installPath` names the cache dir). Caution: the marketplace clone can run AHEAD of the installed cache (after `marketplace update` without `plugin update`) — for the LOADED state, `installed_plugins.json` is authoritative.
   - **Neither works:** name the best available evidence (e.g. cache directory listing, install timestamp) and which source it came from — do NOT invent a SHA.

## Step 1a — V3 source/runtime authority (Elephant only)

Before selecting a profile, model or advisory adapter, verify the project's
actual route authority:

### Codex private-overlay activation bridge

For Codex, first test whether the governed project root contains the exact file
`.agent-pipeline/core.lock.json`. If it does, this locked-project branch is a
mandatory alternative to the ordinary public-project V3 source/runtime check
below. After an authenticated `activated` result and actual context delivery,
continue at Step 1b; do not also execute the numbered public-project branch:

1. Resolve the absolute root of the **currently loaded `pipeline-core` plugin**
   from this skill's own loaded location. In the command below
   `PIPELINE_PLUGIN_ROOT` denotes that resolved root; it is not a value sourced
   from the project or its environment. Never select a wrapper under `$PWD`, a
   project-local `plugins/` tree, the private overlay, or another checkout.
2. Through the host-authorized local read-only execution boundary run exactly:

   `node "${PIPELINE_PLUGIN_ROOT}/scripts/codex-private-overlay-activation.mjs" status --project-root "$PWD"`

   The wrapper, not a project-local setup or harness, owns Codex source
   observation, lock admission, runtime projection/PO-profile readback, and the
   authenticated one-time private-input consume. Do not run project-local
   `setup.mjs`, a local harness, or a copied activation script as an SNT-A
   identity/admission substitute.
3. Accept only a schema-valid result from that invocation:
   - `activation-required`: **STOP before Step 1b and print no confirmation
     line.** Report the returned reason and `planSha256`; perform no mutation,
     do not invoke `activate`, and do not silently fall back to the public V3
     path. Activation remains a separately reviewed, digest-bound action.
   - `rejected`, a non-zero exit, malformed output, an unavailable `status`
     operation, or missing authenticated readback: **FAIL CLOSED.** Diagnose
     read-only, use no private input as authority, and print no confirmation
     line.
   - `activated`: this is the only activation status that may establish the
     private overlay's authenticated identity/readback. Retain its
     `planSha256` only for the immediately following consistency check; the
     sanitized status alone is never private context.
4. Immediately after a schema-valid `activated` status, run exactly the second
   plugin-local command through the same boundary and resolved plugin root:

   `node "${PIPELINE_PLUGIN_ROOT}/scripts/codex-private-overlay-activation.mjs" load-context --project-root "$PWD"`

   Accept private context only when the result has exact schema
   `pipeline.private-overlay-operational-context.v1`, status `context-loaded`,
   and the same `planSha256` as the activated readback. Its bounded `entries`
   are private operational context for this turn only. They contain class and
   text, not private filenames, and are not machine evidence. Do not echo,
   quote, summarize into public output, persist, log, cache, commit, or export
   either the envelope or its contents.
5. A rejected context envelope remains fail-closed with its sanitized reason.
   If `load-context` is unavailable, non-zero without a valid rejection, or
   emits malformed, mismatched, oversized, filename-bearing, or otherwise
   invalid output, **STOP** and report
   `SNT-A-CODEX-CONTEXT-TRANSFER-UNAVAILABLE`. Do not infer or reconstruct the
   private inputs from the project checkout, status stdout, setup, or harness.
   Only `activated` plus schema-valid `context-loaded` may continue to the
   separate Step 3–5 checks and their F4 behavior.

Passing this locked-project branch replaces only SNT-A identity, admission,
projection and private-input authentication. It does **not** satisfy or replace
the project-specific Step 3 calibration/denies, Step 4 handover, or Step 5
verify checks; those remain separate and retain their F4 behavior.

When `.agent-pipeline/core.lock.json` is absent, use the ordinary public-project
V3 source/runtime check:

1. `pipeline.user.yaml` must exist and declare `schema: pipeline.user.v3`.
   Neither a V1/V2 compatibility projection nor the installed plugin cache is
   a substitute authority.
2. Run the loaded plugin's `node "${PIPELINE_PLUGIN_ROOT}/scripts/v3-bootstrap-authority.mjs" --root "$PWD"`
   through the host-authorized local read-only execution boundary. This is the
   plugin-shipped read-only V3 authority validator; a Consumer-root `setup.mjs`
   is neither required nor consulted. Do not first
   run a known sandbox-restricted probe and classify its
   `execution_environment` or `probe_timeout` result as a missing installation.
   In V3 this is a read-only source/runtime check. Success must report a current
   `pipeline.user.v3` source and status `ready`: either
   `runtimeProjection: "noop"` with `runtimeReadback: "current"`, or, only
   when Codex has reserved the project runtime mount,
   `runtimeProjection: "plugin-managed"` with
   `runtimeReadback: "plugin-provided"`. The latter does not claim that a
   project-local Codex runtime was loaded. A projection-only
   `projection-current`, `restart-required`, host-managed projection gap, or
   unavailable cleared readback is non-success and cannot become bootstrap
   authority. It accepts no V3 registry-refresh, V1/V2, legacy, or other
   runtime-projection fallback.
   A valid source with missing/default or declined `advisor_export` consent
   remains a successful read-only check. Missing/default enables the bounded
   Codex Host Advisor without a prompt; the configuration command is
   informational only and must not write consent.
3. Treat every non-zero result, migration-required result, invalid V3 source,
   missing runtime baseline, or changed V3-owned projection as **F5**. Do not
   repair drift during bootstrap, do not fall back to V2/V1 routing, and do not
   select a route from stale `.claude/pipeline.yaml` bytes. Diagnose read-only;
   the explicit V3 migration/apply workflow owns authority changes.

The successful no-op projection plus current native readback is the evidence
that a fresh session sees the same V3 source and permitted runtime boundary. It is not effective-model evidence; Claude
receipts and Codex Host-Advisor status remain separate requirements.

## Step 1b — Model/effort (Elephant only)

- **V3 work profile — hard gate before setting model/effort:** determine the
  current profile from the active feature/approved plan and current task shape:
  `epic`, `feature`, or `mini`. Reuse a persisted unambiguous profile. If none
  exists, ask the PO exactly this three-option question (free text remains the
  PO-exception path):

  > V3 profile for this topic: Epic (architecture/multi-block), Feature
  > (bounded product change), or Mini (small feature/hotfix; hard light-process
  > limits)?

  `advisor` and `design-first` are no longer profiles. Advisory is the separate
  runner-neutral V3 duty. A legacy `design.advisor`, `/advisor` state, or
  machine-inherited advisor setting must not select or disable that duty.
- Determine `design_phase` versus `execution_phase` from the active state and
  approved plan, then select exactly
  `routing.profiles.<profile>.<phase>.<runner>` from the already validated
  `pipeline.user.v3`. The runner is the configured/observed session runner; do
  not switch runner, main model, role, or route to make advisory work. Set the
  host model/effort to that registered route. A requested selector is not
  observed identity evidence.
- **Model-identity hardening:** assert the active model from observed host
  evidence or explicit PO confirmation, never from the requested route alone,
  especially after a credit-limit/reset event. Session effort is not reliably
  introspectable: set it once from the V3 route and record the explicit value.
  Read-only work may proceed while host confirmation is pending; writes may not.
- Run `node "${PIPELINE_PLUGIN_ROOT}/scripts/bootstrap-env-check.mjs"` and require
  its explicit `status: clear` receipt. This proves
  `CLAUDE_CODE_SUBAGENT_MODEL` is **not set** without treating normal empty
  `printenv` output as an error or disclosing a configured value. A set value
  would silently override subagent routing and invalidate advisory/dispatch
  receipts.
- Deviations from the registered V3 route require an explicit PO exception and
  must remain labelled as such; they never mutate `pipeline.user.v3` during
  bootstrap.

### Codex local app-server health (Elephant only)

For a Codex session, run the read-only local observation
`node "${PIPELINE_PLUGIN_ROOT}/scripts/codex-app-server-health.mjs"` through the
host-authorized local execution boundary before
claiming that a local agent thread, visible subagent activity, or durable host
execution is available. Do not first probe it in a workspace sandbox that
cannot reach the host control socket; a sandbox-local `CAS-*` result describes
that sandbox, not the daemon. `CAS-READY` observes only the daemon's closed version
readback; it does **not** attest a model child, a task queue, or a background
wakeup. Any other `CAS-*` result is a typed local-host incident: do not invent
an active worker or reclassify the defect as a Pipeline implementation result.

The known attended recovery is
`node "${PIPELINE_PLUGIN_ROOT}/scripts/codex-app-server-health.mjs" --recover`.
It performs at most one fixed `codex app-server daemon restart`, then requires
a fresh healthy observation; it never loops, launches a model, or changes a
repository. It is deliberately outside this read-only bootstrap step. A failed
recovery keeps the exact `CAS-*` code and the operator guidance for
`codex doctor` visible.

### V3 advisory duty at session start

- Read the validated V3 `advisorExport` resolution before any Advisory action.
  Missing consent is the enabled `default`, with no per-run question; only
  `declined` disables before a child, export or status. `mini` is disabled.
- For Codex Epic/Feature, run exactly
  `node "${PIPELINE_PLUGIN_ROOT}/scripts/codex-host-advisor-route.mjs" --runner codex --profile "{{PROFILE}}" --consent "{{CONSENT}}"`.
  Accept exactly JSON keys `route|policy`; do not pass `--root`, probe `--help`,
  inspect the script, or retry through stdin. For route `host-bound-consult`,
  require policy `pipeline.codex-host-advisor-policy.v1`: launch the primary
  once for at most 60 seconds, interrupt it at that single monotonic deadline,
  verify the unchanged workspace digest, then launch at most one fresh
  `gpt-5.6-terra` / `high` fallback for at most 45 seconds with `forkTurns:none`.
  Polling must never reset either deadline. Interrupt an overrun once; never
  start a third attempt.
  Do not make any selected-sandbox, App-Server, native or other advisory probe
  before or after it. The child receives one question and
  allowlisted repository evidence only; it has no inherited chat/handover/
  memory, mutation, persistence, auto-apply, gate decision, separate network
  tool or third-party export.
- The Elephant, not the child, creates the one-use launch and validates the
  candidate-/launch-/question-bound `pipeline.host-advisor-status.v1` against
  before/between/after workspace observation. An answered unchanged status
  from attempt one or two is Codex `host-bound-consult` success. If both
  bounded attempts are unavailable with an unchanged workspace, record
  `advisory-unavailable` and continue bootstrap without an Advisory-pass
  claim; this advisory exhaustion is not a session blocker. Workspace mutation
  remains a hard integrity stop. It emits no `pipeline.advisory-receipt.v1` and
  every claim retains `no attested selected-sandbox execution; OS isolation and
  model identity are not asserted`.
- The selected-sandbox host bridge
  `sandboxed-readonly-host-bridge.mjs` remains mandatory only for Codex
  Readiness and Critic duties; it is not an Advisor route.
- **Claude:** native Fable is tried for the coordinator's bounded repeated
  attempts. Only after those failures may native Opus run; only after the
  native adapters fail may the same-runner fresh read-only consult run. The
  order is `Fable × bounded repeat → Opus → Claude consult`, never an automatic
  main-model or runner switch.
- Claude retains its existing coordinator receipt and fallback rules. No raw
  question, answer, prompt, trace or adapter error is persisted.

## Step 1c — Spend/usage check (Elephant only; recommended)

- Check the budget situation at session start: configured `/usage-credits`/workspace limits, known weekly-limit pressure (MP-16). Note a configured or near limit **once** in the confirmation output; under acute budget pressure, name the consequence (delegation-first: execution on the implement-tier model, judgment reserved for the higher-capability tier — MP-22). **Model-fallback duty:** whenever a model fallback is on the table at session start, the limit claim MUST be verified against current `/usage` values — limit percentage AND reset timestamp named concretely to the PO; a fallback decision based on unverified/stale limit information is a violation. For the "/usage is a user command → ask once" mechanics see the bullet below (already there, do not duplicate it; same in `harness/session-bootstrap.md` Step 1c). The switch/cut decision itself is the PO's — NO automatic reset-cut (MP-17: mid-session model changes invalidate the warm cache).
- `/usage` is a user command: if the session cannot see the value itself, ask the PO once instead of guessing (three-valued honesty). **In a model-fallback session the confirmation output must name BOTH values** (limit % + reset time); a fallback note without both counts as step not executed.
- Why: a spend-limit abort mid-run and weekly-limit pressure under sustained use are both documented failure modes. Budget surprises mid-work cost runs and quality; the check belongs at session start.

## Step 1d — Role prohibitions (Elephant only)

Confirm the Elephant's role prohibitions before work starts, as a compact list embedded directly below (NO extra file read at runtime — token economy):

- **EL-01** — no production code; only exception: stage-0 fast path per `docs/operating-model.md` §3.3; further exceptions only from the PO.
- **EL-02** — no step-by-step micromanagement; delegation happens once, via the 6-field briefing.
- **EL-03** — judgment stays at the right level (never absorb the PO's, never push down, never outsource the gate).
- **EL-04** — no silent foundational decisions (register + ADR or it does not exist).
- **EL-16** — delegate-first in the execution phase: EVERY implementation = briefed implement-tier Goldfish dispatch; "small/interlinked" is NOT an exception — bundle interlinked small features into ONE briefing; design-phase thinking stays Elephant work.
- **EL-18** — one repo, one elephant; cross-repo needs go through the transfer path.
- **EL-19** — PO gate: after the readiness check, PROACTIVELY deliver the PRD as a readable document (not just a repo path; remote sessions: send it to the device/render) and explicitly wait for the word "approved" — no implementation dispatch before it arrives.

Why: exactly these prohibitions were once violated in a real session — neither bootstrap, close, nor Critic caught it, because the bootstrap never loaded the role prohibitions. The embedded list makes them impossible to miss at session start instead of relying on memory.

Roles: MANDATORY for the Elephant. Goldfish/Critic receive their prohibitions via the dispatch briefing (field 4 "Prohibitions", or their role contract) — this step does not apply to them as a separate bootstrap act.

This step ends in a **third mandatory confirmation line** (verbatim, printed directly below the Model/Effort line; literal-checked like line 1 — format → Step 6):

> Role prohibitions loaded: EL-01/EL-02/EL-03/EL-04/EL-16/EL-18/EL-19 — implementation only via Goldfish dispatch (Tier-0 per OM §3.3; further exceptions only by the PO); PRD gate: present readably + wait for 'approved'

## Step 2 — Staleness check against the marketplace remote (Elephant only)

- **Locked private-overlay exception:** when Step 1a completed through the
  Codex private-overlay branch with schema-valid `activated` readback, use
  that readback's candidate/plugin/source-cache binding as the runner-neutral
  Public-Core freshness evidence for this project. Do not require a
  Claude-specific `.claude/settings.json` marketplace entry or a Claude CLI
  refresh command in the private overlay. The authenticated bridge owns the
  lock-bound comparison; retain only its sanitized status and do not echo
  private coordinates or receipts.

- With `executionBoundary:default`, run `node "${PIPELINE_PLUGIN_ROOT}/scripts/ruleset-freshness.mjs" --repo "$PWD"`.
  The helper derives the marketplace URL from the **committed**
  `.claude/settings.json`, bounds remote access to 30 seconds, sanitizes
  transport/authentication failures, and never updates source refs/config.
  In self-application it proves ancestry through a disposable bare repository:
  `equal|ahead` is current, while `behind|diverged` is F2. Consumer plugin
  installs still require equality; `stale` is F2. `unknown` is F3.
- **Codex host boundary:** with `executionBoundary:host-authorized-wsl`, run
  `node "${PIPELINE_PLUGIN_ROOT}/scripts/ruleset-freshness-host.mjs" --repo "$PWD"`
  once through that exact network-open/read-only command boundary. This is the
  **only** Remote-Freshness observation: it binds the closed public Core HEAD
  read to its internal host transport and then returns the ordinary
  `pipeline.ruleset-freshness.v1` result. Do not invoke either freshness helper
  first inside a known network-restricted workspace sandbox; that produces a
  misleading DNS error before the authoritative host observation. The host
  result, including `unknown`, is the one bootstrap observation.
- **Registered local development source:** when the Step-0 preflight reported
  `installedSource:local-development`, skip the public-marketplace equality
  helper. The native Codex registry plus the cache-busted loaded/installed
  version is the explicit local source selection for this session. Report it as
  local development, not equal/ahead/behind. Repository freshness and all
  Verify, Security, push/publication approval, and readback gates still run
  unchanged; a local source is not a delivery bypass.
- Working repository (EVERY writable governed project, including self-application): run `node "${PIPELINE_PLUGIN_ROOT}/scripts/repository-freshness.mjs"`. This is separate from marketplace/plugin freshness. It compares through a disposable bare repository and never fetches into the source checkout. The committed calibration declares `repositoryMode` as `local-only` or `remote-tracked`; absent means the safe `remote-tracked` default. `local-only` permits writes without an upstream but never justifies a push or release claim. `equal|ahead` permit remote-tracked writes. `pre-head` names a newly initialized repository: the main session may create the initial project scaffold under an exact `session`-ready lifecycle result, but dispatch, worktrees, push, release, and delivery claims remain blocked until the first commit exists. `behind|diverged|detached|no-upstream|unknown` STOP remote-tracked writes and dispatch while read-only diagnosis remains allowed. `host-managed` is retained as the narrow calibration of a Codex fresh-root transition: the helper accepts only the exact protected control layout or the durable digest-bound receipt from the exact host initializer. After that initializer created real Git, the lifecycle's local repository observation is authoritative for session writes, while push/release/branch claims remain unavailable and project-specific verification is still required. Neither host-managed form claims remote freshness or performs a fetch. `unknown` covers invalid mode, invalid host-managed layout or receipt, fetch failure/timeout, unavailable upstream, and insufficient shallow history; never call it fresh. Other unmerged remote branches are bounded information only, never a branch-selection gate.
- This is a point-in-time protocol check, not an atomic lock or global enforcement claim: the remote may advance immediately afterwards, and SessionStart context is not an OS-level write barrier. The helper never pulls, merges, rebases, checks out, or writes source refs/config.
- Why: third-party marketplaces do not auto-update; only an explicit refresh propagates — without this check, two-machine cache drift silently replaces the old copy-paste drift.

## Step 3 — Project calibration + denies (existence check FIRST)

1. Check `.claude/pipeline.json` **EXISTS** in the project, then read it completely. Keys starting with `$` are documentation and ignored. Required minimum fields: `project`, `verify`, `autonomy`, `branchModel`, `worktree`, `stakes`, `constraints` (schema: operating-model §8; canonical example: `templates/pipeline.json.example` in the agent-pipeline repo). Optional `handover` names the handover file (default `docs/state.md`). Missing file or missing required fields → case **F4**.
2. Check project **denies where they actually live**: committed `.claude/settings.json` (permissions) and/or `.claude/guard-config.json` (git-guard extra denies) — NOT in pipeline.json. Verify the committed deny surface exists for projects that declare one.
3. Critic role: read only the guardrail/constraint parts as review benchmark.
4. **Declarative manifest + governance (existence check FIRST, same discipline as F4):** check whether `.claude/pipeline.yaml` (the OPTIONAL declarative manifest — distinct from the required `.claude/pipeline.json` calibration above) EXISTS. If it does: (a) validate it through the loaded plugin's manifest validator — existence/exit-code check only, no need to parse the full output at bootstrap; (b) read the manifest's `governance.guidelines_path` (and `policies_path`, if present) so the guidelines are already in the Elephant's session context from the start, not fetched later mid-task. A missing `.claude/pipeline.yaml` is NOT a failure case — the manifest is fully optional and F4 does not apply to it — skip this sub-step silently. For an authenticated private overlay, do not require Public-Core manifest or governance files from the consumer checkout.
5. **Repository-scoped PO authority (Public source checkout only):** run the repository-owned `check-po-gate-authority.mjs` check only when the current checkout is the Agent-Pipeline Public source checkout. An authenticated private overlay has already received the bridge's sanitized PO/profile readback; it must not look for Public `harness/` files, a Public primary checkout, or Public PRD cardinality. Missing Public PO-gate files in a private consumer checkout are therefore not an F4/F6 failure.
6. **Self-application toolchain preflight (Agent-Pipeline checkout only):** when the current checkout is the Agent-Pipeline source checkout and contains both `plugins/pipeline-core/scripts/toolchain-preflight.mjs` and its repository-local `harness/` dependencies, run `node "${PIPELINE_PLUGIN_ROOT}/scripts/toolchain-preflight.mjs" --root "$PWD"`. This is a read-only observation: it resolves/probes fixed executables and inputs, does not write a receipt, does not install a tool, and does not alter checkout, configuration, or Git state. Never substitute `${CLAUDE_PLUGIN_ROOT}` and never run it in a consumer project merely because `pipeline-core` is installed: scanner configuration and license inputs are project-owned, while this preflight is the Pipeline repository's self-application control.
   - `TCP-READY` permits the self-application toolchain-ready statement. Any other typed result remains factual even when its process exit is `0` under a `warn` or `off` security mode; do not convert it into readiness.
   - `execution_environment`, `probe_timeout`, and `probe_error` describe an
     unobserved host boundary, not a missing binary. Re-run this exact preflight
     through the host-authorized local read-only boundary; never recommend
     reinstalling a tool from one of those results.
   - A missing configured prerequisite names the affected claim, carries a
     copyable platform-appropriate Bash `installCommand`, and reports
     `installAttempted:false`. Present that guidance to the operator; never run
     it automatically. Semgrep guidance is
     `python3 -m pip install semgrep`; Gitleaks and OSV-Scanner receive their
     platform-specific commands in the same result shape.
   - When the preflight reports non-ready under `securityGate: blocking`, fail closed only for security/release/public-baseline claims and their dependent gates. Do not invent F4, repair the environment, or turn this read-only bootstrap observation into a general write prohibition: those broader effects have no authority here. Under `warn` or `off`, surface the typed condition and continue without a readiness claim.
7. **Observation/document governance (Agent-Pipeline source checkout only):** when either `governance/observation-doc-governance.json` or `.github/ISSUE_TEMPLATE/observation.yml` exists in the current Public source checkout, require both plus the Public-Core `check-observation-governance.mjs` checker and run `node harness/scripts/check-observation-governance.mjs` there. A missing counterpart, non-zero result, malformed policy, unclassified `docs/` artifact, or Issue/Backlog/overlay contract drift is case **F6**: fail closed before writing or dispatch and print no confirmation line. The checker is read-only and creates no Issue, label, backlog item, or network request. Do not probe for or require this source-repository control in a private consumer overlay.

## Step 4 — Handover/state file (Elephant only; Goldfish/Critic FORBIDDEN)

- Read the project's handover file completely (path from calibration `handover`, default `docs/state.md`; in the agent-pipeline repo: `docs/state.md`). It is the SINGLE authoritative state source; memory is mirror only.
- Extract the last-updated date for the confirmation line.
- Drift check (default threshold): warn when the repo's last commit is NEWER than the handover state AND the delta since then contains at least one non-docs commit (docs-only deltas do not trigger the warning; merge-completion gate). A project MAY override via the `$driftThreshold` comment key in `.claude/pipeline.json` (default applies if absent).
- **Interaction-continuity re-entry:** run the read-only `node "${PIPELINE_PLUGIN_ROOT}/scripts/continuity-status.mjs" --root "$PWD"`. When it reports active, nonblocked work with a known next action, bootstrap treats that action as mandatory continuation: answer ordinary informational messages and record additive input, then execute the same persisted next action. Startup, resume, crash recovery and automatic/manual compact are not terminal task boundaries. Only an explicit pause/cancel/replace/redirect, a named gate, completion or a typed blocker may stop. The compact hook projects the same duty through `interaction-continuity.mjs`; never reconstruct it from chat history.
- In implementation after a recorded required plan approval, a completed
  internal slice/package is ordinary continuity, not a named PO gate. Continue
  after its applicable evidence and Critic path unless the situation is a typed
  blocker, a material scope or authority change, a push or other remote action
  not already admitted by the PHX-2 Ledger/Resolver proof described in the
  continuation contract, or final feature/epic acceptance. This check applies again at every compact or
  continuation re-entry; never carry a remote exception forward by inference.
- **Local cleanup session (Elephant only):** before the first pipeline-created temporary resource, run `node "${PIPELINE_PLUGIN_ROOT}/scripts/session-cleanup.mjs" start --repo "$PWD"`. The command owns the entire First-bind CAS: when `continuity.runtime.sessionCleanup` is null it refuses any unbound active descriptor, creates one private descriptor, atomically persists only its `sessionId` plus `descriptorSha256`, and retires the new descriptor again if persistence fails. When the tuple is already bound, `start` validates and returns that exact descriptor with code `WT-SESSION-REUSED`; it MUST NOT create or persist another nonce. Bootstrap and compact recovery reuse the same tuple. A normal close cleans and retires that descriptor, proves its closure receipt and atomically releases the exact State tuple so a later genuine session can bind a new one. If cleanup committed but tuple release was interrupted, use `release-binding`; it accepts only the exact completed closure. If both descriptor and closure receipt are absent, run the read-only `plan-recovery` and present its digest-bound `apply-recovery` action for explicit PO confirmation; an active descriptor is never PO-force-replaced. On Codex, use the host-authorized repository-local execution boundary directly when the workspace sandbox forbids nested Git subprocesses; do not first run a known-to-fail sandbox probe. The nonce stays solely in the private Git-common-dir descriptor. Never accept a changed tuple, edit State directly, or infer a cleanup target from a path prefix.

## Step 5 — Verify gate available

- Confirm the project's ONE verify command (calibration field `verify`) exists
  without invoking that command. Never append or pass `--help`: an arbitrary
  Verify entrypoint may treat it as a real run and write evidence. For a
  `node <script>` command, require a physical regular script and run only
  `node --check <script>`. For a direct executable, resolve only the executable
  path (`command -v` or an exact `test -x`); do not execute it. For any other
  calibrated form, perform an equivalent non-executing existence check or
  report the Verify availability as unobserved. Run no full gate and create no
  evidence at bootstrap.
- Missing → treat as **F4** (STOP for writing work, offer creation).
- Why: without a runnable verify, the evidence duty is unfulfillable — that must surface at session start, not at task end.

## Step 5b — Reload reminder (detected staleness or native update notification)

- If case **F2** applies (step 2 found staleness) OR a native plugin-update
  notification appeared in this session, prompt the PO for the runner's actual
  refresh boundary before printing the confirmation line. Claude Code uses
  `/reload-plugins`. Codex installations performed through `/plugins` use
  `/new`; an externally updated Codex installation whose loaded/installed
  versions still differ follows the attended App-Server restart handoff in the
  runtime identity section above.
- Why: without this reminder a session silently keeps running on the old cache
  state even though the refresh was already offered or executed. The commands
  are deliberately runner-specific; no hook can reload its own already-cached
  definition.
- Check: if F2 applies or the native notification appeared, the applicable
  runner-native refresh prompt is evidenced before the confirmation line. If
  neither applies, this step is skipped outright.

## Step 6 — Confirmation line and bounded post-confirmation activation

Print exactly this line (all five fields with concrete values; the check is literal — the line must begin with "Bootstrap check passed:"):

> Bootstrap check passed: ruleset {{VERSION_OR_SHA}} loaded · Project {{PROJECT_NAME}} · Calibration {{CALIBRATION_FILE}} · State {{HANDOVER_DATE}} · Role {{Elephant|Goldfish|Critic}}

Allowed suffixes (only these, each appended with "·"):

- Case F3: `· Staleness unchecked (offline, cache state)`
- Accepted case F2: `· NOTE: ruleset stale ({{N}} commits behind remote)`
- Same-day light bootstrap (see "Same-day light bootstrap" below): `· Staleness same-day cached (full check {{HH:MM}})`
- Mini bootstrap (see "Mini bootstrap" below): `· Profile mini — light bootstrap (details → "Mini bootstrap")`; the V3-authority, model/effort and role-prohibitions extra lines are OMITTED in this case — they still apply unchanged in substance, and Step 1a still passed; only the single confirmation line is printed.
- Case F4 (calibration and/or handover missing — the EXPECTED initial state in not-yet-migrated projects): the affected field carries `MISSING (F4)` instead of a placeholder value — i.e. `Calibration MISSING (F4)` resp. `State MISSING (F4)` — PLUS the mandatory suffix `· F4: read-only analysis only until calibration/handover is created`.

Role variants of the "State" field:

- Goldfish: `State briefing {{TASK_ID_OR_DATE}}` (SHA comes from the briefing; a briefing without SHA is a briefing defect → return to the Elephant, do not research it yourself)
- Critic: `State n/a (Critic sees no history)` (runner-native Critic confirms
  no write tools; Codex functional-equivalent Critic instead discloses
  `functional-equivalent-read-only; OS isolation not asserted` and invokes no
  write tool, mutating command, or delegation)

Elephant adds a V3 authority/advisory line directly below. Default-enabled
Epic/Feature may name only an `answered`, current, schema-valid receipt.
Explicitly declined consent and Mini are accepted disabled states and must not
name a receipt:

> V3 authority: pipeline.user.v3 · Runtime projection {{noop|host-managed-codex}} · Profile {{epic|feature|mini}} · Advisory {{host-bound-consult|disabled-no-consent|disabled-by-profile}} · Status {{STATUS_SHA256|n/a}}

Elephant adds the model/effort line directly below (MP-17):

> Model/Effort: {{MODEL}} / {{EFFORT}} (pipeline.user.v3 route; observed identity separately verified) · Phase {{design_phase|execution_phase}} · Runner {{claude|codex}}

Elephant adds the role-prohibitions line directly below that (Step 1d):

> Role prohibitions loaded: EL-01/EL-02/EL-03/EL-04/EL-16/EL-18/EL-19 — implementation only via Goldfish dispatch (Tier-0 per OM §3.3; further exceptions only by the PO); PRD gate: present readably + wait for 'approved'

No placeholders, no "unknown" outside the defined suffix cases. **Prohibition:** printing this line without having performed steps 1–5 (see Contract).

Immediately after the confirmation line, the Elephant starts the bounded
session-power controller for the exact cleanup descriptor retained in Step 4:

`node "${PIPELINE_PLUGIN_ROOT}/scripts/session-power.mjs" start --session-id ID --expected-descriptor-sha256 SHA`

This command is permitted only after the confirmation line and before the
first Pipeline-created temporary advisory or sandbox resource. It receives no
user-configured executable, arguments, script, or environment input. A typed
`disabled` result is normal for an existing V3 source without
`session.keep_awake`; a typed `unavailable` result records that the host cannot
provide the fixed adapter and does not block ordinary Pipeline work. A malformed
result, `cleanup-pending`, or a result whose session ID differs from the
descriptor is F5: do not create a temporary resource, diagnose read-only, and
leave Close to the exact descriptor-bound recovery path. Plain `setup.mjs`
never starts or stops a host-power process.

## Same-day light bootstrap ("short bootstrap", Elephant only)

Preconditions (ALL must hold, else full bootstrap):

1. Same machine AND same calendar day as a documented FULL bootstrap (evidence: the topmost session block of the project's handover file records that bootstrap with date).
2. Loaded ruleset SHA unchanged versus that full bootstrap.
3. No plugin refresh/reload since (after every F2 runner-native refresh, the FULL path is mandatory again — unchanged contract).

Light form (deviates from Steps 1–6 above ONLY as follows; every step not listed here runs unchanged):

- **Step 1:** local SHA only (no `ls-remote`).
- **Step 1b:** unchanged (MANDATORY) — reuse the persisted unambiguous V3
  profile and phase. Ask only when the active state and task shape are genuinely
  ambiguous. An informational message, resume, compact, or same-day restart is
  not an ambiguity and must not pause continuity merely to repeat a profile
  question.
- **Step 1d:** unchanged (embedded, cheap).
- **Step 2:** marketplace/plugin staleness is SKIPPED, with mandatory suffix `· Staleness same-day cached (full check {{HH:MM}})`; the current writable checkout's freshness helper still runs every time.
- **Step 3:** existence check only.
- **Step 4:** read the handover HEAD block + topmost session block only — UNLESS the handover changed since the full bootstrap (newer commits/date) → full read.
- **Step 5:** existence check only.
- **Step 6:** confirmation line as usual + the suffix above.

Why: a full bootstrap already completed the same calendar day on the same machine makes the expensive checks (remote staleness, full handover read) redundant — PROVIDED ruleset state and handover state are demonstrably unchanged since; the three preconditions are the evidence duty for that, not a shortcut by feel.

## Mini bootstrap (light, mini-feature/hotfix, Elephant only)

**Origin:** V3 profile `mini` in Step 1b — for genuinely small,
tightly-bounded diffs (mini-feature/hotfix), not for
architecture/guardrail work.

**Precondition:** the V3 task profile is `mini`. Unlike the same-day light
bootstrap above, Mini is not bound to "same machine/same calendar day" — it
is a task-shape decision, not a cache-freshness one. V3 advisory is disabled
for this profile; no advisor probe or receipt is permitted.

**Scope (hard limits — a breach forces mandatory escalation):**

- Mini-feature/hotfix scope only: **~≤5 files touched.**
- **NO guardrail/canon files** in scope — canonical list of forbidden file-classes for the `mini` profile: `policies/model-policy.md` (MP-28); not re-enumerated here to avoid divergence.
- **No new dependencies.**
- If any of these limits become visible as breached mid-session (scope grew beyond the mini-feature/hotfix shape): **mandatory escalation to the full profile** — switch to the full bootstrap/full process immediately, do not keep working the Mini path (escalation logic mirrors `harness/checklists/small-session.md`, "Escalation rule" section).
- **Guard hooks stay fully active in EVERY profile, including `mini`** (deterministic, free) — Mini saves ceremony, not safety.

**Light bootstrap form** (deviates from the full path in Steps 1–6 ONLY as follows; every step not listed here runs unchanged or is dropped exactly as specified below):

- **Step 1:** local ruleset SHA only (no `ls-remote`).
- **Step 1a:** unchanged; V3 authority and runtime-noop evidence are mandatory.
- **Step 1b:** the profile question itself runs normally (that is the Mini
  choice); advisory is verified as `disabled-by-profile` and no advisory adapter is
  invoked. Model/effort comes from the Mini phase/runner cell and is set once.
- **Step 1c:** skipped (no spend/usage check as a separate act).
- **Step 1d:** skipped as a separate confirmation line — the role prohibitions (EL-01/EL-02/EL-03/EL-04/EL-16/EL-18/EL-19) still apply unchanged in substance, they are just not repeated as their own line in the Mini path.
- **Step 2:** marketplace/plugin staleness is skipped; the current writable checkout's freshness helper still runs and requires a write-permitting result.
- **Step 3:** existence check of the calibration file only (no full read).
- **Step 4:** the operative head of the handover file only — no full session-history read.
- **Step 5:** existence/invocability check of verify only.
- **Step 6:** **ONE confirmation line instead of the full four-line Elephant
  form** (format → Step 6 above, suffix `· Profile mini — light bootstrap`).

**Light process** (not just the bootstrap — applies to the whole task): no PRD document; direct dispatch, or a mini-edit for the smallest fixes (stage-0 fast path per `docs/operating-model.md` §3.3); a light review tier instead of a full Design-Tier review — the existing Critic-trigger matrix decides as usual, this is not a new Critic rule (→ `harness/checklists/small-session.md` step 3); short close via the **close-light variant** of the `close-block` skill (`plugins/pipeline-core/skills/close-block/SKILL.md`) — its own hard eligibility gate applies unchanged, Mini does not override it.

**Why:** a mini-feature or a hotfix used to run under the same heavy ceremony as an architecture rebuild — the exceeded proportionality guardrail. Mini cuts the ceremony without touching a single deterministic guardrail.

## Failure cases F1–F6 (binding behavior)

| Case | Finding | Binding behavior |
|---|---|---|
| **F0** | V4 status `portable-seed-required` | **STOP before normal bootstrap.** Execute only the exact read-only `nextAction` plan. Present its proposed targets/digests and returned digest-bound `apply-portable-seed --plan-sha256 … --activate` action; never reconstruct or auto-run it. Explicit project-create/initialize authorization may confirm that exact action. Its readback advances only to `runtime-initialization-required` (or another typed failure), never bootstrap success. |
| **F0A** | V4 status `adoption-required` | **STOP before normal bootstrap.** Execute only the exact read-only `nextAction` plan, report every proposed additive target, and wait for confirmation of its digest-bound `apply-portable-seed` action. Adoption preserves existing content and valid Git metadata, rejects reserved-path/configuration collisions, and still advances through runtime initialization, restart, fresh native readback, and kickoff before readiness. |
| **F1** | Ruleset missing entirely (plugin not installed, skills not found) | **STOP.** Inform the PO. Only **minimal-safe mode**: reading (Read/Glob/Grep), read-only git (`status`/`log`/`diff`), plugin diagnosis (`/plugin` menu, settings inspection). NO edits/writes/commits/pushes, no settings changes. **NO confirmation line** — the session counts as not bootstrapped. |
| **F2** | Plugin stale (installed SHA ≠ remote HEAD) | Warn and offer the runner-specific refresh. A registry-validated `local-development` source is not F2 and follows Step 2 instead. Claude Code uses the canonical project-scope ritual from ADR-0001: `claude plugin marketplace update agent-pipeline` → `claude plugin update pipeline-core@agent-pipeline --scope project` → `/reload-plugins`. Codex uses `/plugins` to install/update and `/new` to start the documented fresh chat; a proven loaded/installed mismatch after an external CLI update follows the attended App-Server restart handoff above. Work MAY continue except when the delta touches guardrails (`hooks/`, `agents/`, permission settings); then refresh first. Without a checkout, default safe: when in doubt, refresh. After every refresh, repeat steps 1–2 and name the newly loaded identity. |
| **F3** | Offline / remote unreachable | Warn + continue on cache state (the cache is a complete copy; day-to-day operation is offline-capable). Redo the staleness check at next connectivity, at latest at the next bootstrap. Confirmation line carries the offline suffix. |
| **F4** | Calibration or handover file missing (or verify command missing) | **STOP for writing work.** Read-only analysis stays allowed. Offer creation: draft the missing calibration from the required-field list in step 3 (canonical example: `templates/pipeline.json.example` in the agent-pipeline repo — an installed plugin cannot read repo templates, so generate the draft from the field list). Newly created files MUST be named to the PO for confirmation — a new calibration is a project-policy decision, never an agent's solo act. **The confirmation line still prints** (F4 is the expected initial state in not-yet-migrated projects, not a bootstrap failure): the affected field reads `MISSING (F4)` (step 6) plus the mandatory suffix `· F4: read-only analysis only until calibration/handover is created`. |
| **F5** | `pipeline.user.v3` missing/invalid, V3 migration required, or a V3-owned runtime projection is changed/unreadable | **FAIL CLOSED.** Read-only diagnosis only. Do not use V1/V2 or runtime bytes as fallback authority, do not start advisory, do not write/dispatch, and print **no confirmation line**. Repair only through the explicit V3 migration/apply or an independently reviewed authority correction; then rerun bootstrap from Step 1a. |
| **F6** | Agent-Pipeline observation/document governance is missing, malformed, incomplete, or drifted | **FAIL CLOSED.** Read-only diagnosis only; no writing, dispatch, confirmation line, automatic inventory classification, backlog promotion, or deletion. Correct the governed artifact and rerun the checker and bootstrap. |

Why F2 has the guardrail exception: a stale ruleset with old hooks means the session works under WEAKER protection than decided — exactly the state the pipeline exists to abolish. Feature/doc deltas may wait; protection deltas may not.

## Open points

- OPEN: authoritative machine-readable source for the installed plugin SHA (step 1); multi-machine validation (ADR-0010).
- **Startup boundary:** Codex and Claude SessionStart hooks surface a visible, non-mutating onboarding reminder. In an ungoverned folder they first ask whether the optional workflow should be installed and MUST NOT invoke this skill or inspect onboarding before the affirmative answer. They do not auto-install or silently invoke a skill: installation remains an explicit user-confirmed lifecycle action. Codex plugin hooks run only after the user has trusted the installed hook definition.
