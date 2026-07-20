---
name: pipeline-start
description: "Mandatory session bootstrap for Agent-Pipeline projects (ADR-0010). Run FIRST in every new session and after /clear/plugin refresh. Verifies ruleset SHA, pipeline.user.v3 plus runtime-noop authority, V3 profile/advisory receipt, model/effort, staleness, calibration, handover and verify before printing the auditable confirmation. Optional role: elephant (default), goldfish or critic."
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
- All bootstrap commands below are read-only (git `ls-remote`/`rev-parse`/`log`, file reads). The bootstrap changes nothing.

**Role:** take the role from `$ARGUMENTS` (default when empty: `elephant`).

| Step | Elephant | Goldfish | Critic |
|---|---|---|---|
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

1. `pipeline.user.yaml` must exist and declare `schema: pipeline.user.v3`.
   Neither a V1/V2 compatibility projection nor the installed plugin cache is
   a substitute authority.
2. Run `node setup.mjs` with **no flags** from the governed project root
   through the host-authorized local read-only execution boundary. Do not first
   run a known sandbox-restricted probe and classify its
   `execution_environment` or `probe_timeout` result as a missing installation.
   In
   V3 this is a read-only source/runtime check. Success must report that
   `pipeline.user.v3` and its runner-neutral advisory runtime projections are
   current and that setup performed no writes.
   A valid source with missing or declined `advisor_export` consent remains a
   successful read-only check and prints the exact configuration command
   `node setup.mjs --configure-advisor-export`; it must not write consent.
3. Treat every non-zero result, migration-required result, invalid V3 source,
   missing runtime baseline, or changed V3-owned projection as **F5**. Do not
   repair drift during bootstrap, do not fall back to V2/V1 routing, and do not
   select a route from stale `.claude/pipeline.yaml` bytes. Diagnose read-only;
   the explicit V3 migration/apply workflow owns authority changes.

The successful no-op is the evidence that a fresh session sees the same V3
source and runtime projection. It is not effective-model evidence; observed
identity and the advisory receipt remain separate requirements.

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
- Run `node plugins/pipeline-core/scripts/bootstrap-env-check.mjs` and require
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
`node plugins/pipeline-core/scripts/codex-app-server-health.mjs` through the
host-authorized local execution boundary before
claiming that a local agent thread, visible subagent activity, or durable host
execution is available. Do not first probe it in a workspace sandbox that
cannot reach the host control socket; a sandbox-local `CAS-*` result describes
that sandbox, not the daemon. `CAS-READY` observes only the daemon's closed version
readback; it does **not** attest a model child, a task queue, or a background
wakeup. Any other `CAS-*` result is a typed local-host incident: do not invent
an active worker or reclassify the defect as a Pipeline implementation result.

The known attended recovery is
`node plugins/pipeline-core/scripts/codex-app-server-health.mjs --recover`.
It performs at most one fixed `codex app-server daemon restart`, then requires
a fresh healthy observation; it never loops, launches a model, or changes a
repository. It is deliberately outside this read-only bootstrap step. A failed
recovery keeps the exact `CAS-*` code and the operator guidance for
`codex doctor` visible.

### V3 advisory duty at session start

- Read the validated V3 `advisorExport` resolution before any advisory action.
  Missing or `declined` consent is an accepted optional bootstrap state:
  Advisory is disabled and no adapter, selected-sandbox probe, child, export,
  or receipt may run. `approved` enables only the registered same-runner duty.
  Consent is configured explicitly with
  `node setup.mjs --configure-advisor-export`; no-flag setup remains read-only.
- Profile eligibility remains frozen: `epic` and `feature` run Advisory only
  when consent is approved; `mini` disables it regardless. A disabled state
  must not fabricate an advisory receipt.
- **Affected Codex child boundary:** before the first child for every sandboxed
  read-only Codex advisory, readiness, or Critic duty, require the generic
  selected host bridge
  `plugins/pipeline-core/scripts/sandboxed-readonly-host-bridge.mjs`. Supply
  its exact selected ID only; the bridge must read back the selected
  `network-open/read-only` profile before launch. A missing, stale, drifted, or
  host-mode-unavailable selection returns its typed no-child result and starts
  no child. This host-compatibility boundary changes neither runner nor model.
  The selected Codex advisory payload is exactly `Read/Grep/Glob/Bash`; Bash
  does not exist through an unbound host fallback.
- For Epic/Feature, start the duty through
  the repository-owned closed launcher for
  `plugins/pipeline-core/scripts/advisory-host-bridge.mjs`,
  `plugins/pipeline-core/scripts/codex-advisory-bootstrap.mjs` for Codex, with exactly one
  material question, bound to the current candidate commit/tree and queue
  revision. The launcher reads the standing `advisor_export.consent` decision
  from validated `pipeline.user.v3`; do not rebuild or export its input with
  raw `node -e`, and do not request a per-run export approval after standing
  consent is approved. Pass the one bounded UTF-8 advisory question only on
  the launcher's stdin, never in its argv. The bridge
  calls the coordinator and owns the fallback sequence; never recreate that
  sequence manually. The bridge consumes its temporary raw input before the
  first request; persist only its receipt target and never log or retain the
  runtime transport.
- **Codex:** the registered primary duty is one fresh ephemeral native Codex
  App-Server turn on `openai/gpt-5.6-sol`: `initialize` → `initialized` →
  `thread/start` with provider fallback disabled → `turn/start` with one input,
  approval `never`, and external read-only/network-open policy → one completed
  agent answer → `turn/completed` → EOF/exit/cleanup. The exact selected
  `network-open/read-only` sandbox is its only transport. Unavailability,
  no-child, wrong identity, missing profile readback, incomplete stdio or
  incomplete cleanup remains non-success without a duplicate consult. There
  is no unbound host shell/consult fallback or Claude/Fable substitution.
- **Claude:** native Fable is tried for the coordinator's bounded repeated
  attempts. Only after those failures may native Opus run; only after the
  native adapters fail may the same-runner fresh read-only consult run. The
  order is `Fable × bounded repeat → Opus → Claude consult`, never an automatic
  main-model or runner switch.
- The consult boundary is mandatory: fresh context, one question, no handover,
  chat history, implementor rationale or memory, Claude tools
  `Read/Grep/Glob` or selected Codex tools `Read/Grep/Glob/Bash`, no mutation,
  and no auto-apply. Codex Bash remains constrained to the read-only checkout
  plus coordinator scratch by the selected profile. Claude uses the
  `pipeline-core:advisor-consult` adapter contract; Codex uses the native
  App-Server contract above.
- Every consent-enabled answered or exhausted invocation must emit one schema-valid
  `pipeline.advisory-receipt.v1`, with candidate binding, runner, configured
  route, adapter, observed status/identity, question/answer digests and redacted
  fallback reason. Persist only the sanitized receipt, never raw question,
  answer, prompt, trace or adapter error. The exact ADR-0041
  functional-equivalent pass emits only its sanitized candidate-bound status
  record, never a native advisory receipt.
- **Attested primary success when consent is approved:** An answered Codex
  Advisory claim requires an `answered` receipt whose
  observed provider matches the same runner and whose candidate binding is
  current. A missing/invalid receipt, adapter-protocol error, runner drift,
  exhausted failure receipt or stale candidate binding creates no attested
  native advisory, selected-sandbox, identity, isolation or conformance claim.
  After exactly one typed Codex selected-sandbox `no-child` or `unavailable`
  stop, ADR-0041 permits one separate fresh, local, hard-read-only
  `consult-advisor` subagent with the direct single question. If it answers
  without handover, memory, mutation, network export or auto-apply, print
  `Advisory po-authorized-functional-equivalent · Receipt n/a · Reason CODE`.
  This is gate-capable for the affected PO gate, bootstrap/readiness decision,
  Critic prerequisite, or Epic-close prerequisite until revoked by the PO or
  replaced by a functional Codex CLI selected sandbox. It is never an attested
  native advisory: it emits no Pipeline Advisory receipt or selected-sandbox
  execution attestation, and every resulting claim must disclose `no attested
  selected-sandbox execution; OS isolation and model identity are not
  asserted`. A failed local consult, a second question, mutation, or export is
  not a pass and receives no further fallback.

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

- Run `node plugins/pipeline-core/scripts/ruleset-freshness.mjs --repo "$PWD"`.
  The helper derives the marketplace URL from the **committed**
  `.claude/settings.json`, bounds remote access to 30 seconds, sanitizes
  transport/authentication failures, and never updates source refs/config.
  In self-application it proves ancestry through a disposable bare repository:
  `equal|ahead` is current, while `behind|diverged` is F2. Consumer plugin
  installs still require equality; `stale` is F2. `unknown` is F3.
- **Codex host boundary:** run this helper once through the host-authorized
  network-open/read-only command boundary. Do not first probe it inside a
  known network-restricted workspace sandbox: that produces a misleading DNS
  error before the authoritative host observation. The host result, including
  `unknown`, is the one bootstrap observation.
- Working repository (EVERY writable governed project, including self-application): run `node "${CLAUDE_PLUGIN_ROOT}/scripts/repository-freshness.mjs"` (from this source checkout: `node plugins/pipeline-core/scripts/repository-freshness.mjs`). This is separate from marketplace/plugin freshness. It compares through a disposable bare repository and never fetches into the source checkout. `equal|ahead` permit writes. `behind|diverged|detached|no-upstream|unknown` STOP writes and dispatch while read-only diagnosis remains allowed. `unknown` covers fetch failure/timeout, unavailable upstream, and insufficient shallow history; never call it fresh. Other unmerged remote branches are bounded information only, never a branch-selection gate.
- This is a point-in-time protocol check, not an atomic lock or global enforcement claim: the remote may advance immediately afterwards, and SessionStart context is not an OS-level write barrier. The helper never pulls, merges, rebases, checks out, or writes source refs/config.
- Why: third-party marketplaces do not auto-update; only an explicit refresh propagates — without this check, two-machine cache drift silently replaces the old copy-paste drift.

## Step 3 — Project calibration + denies (existence check FIRST)

1. Check `.claude/pipeline.json` **EXISTS** in the project, then read it completely. Keys starting with `$` are documentation and ignored. Required minimum fields: `project`, `verify`, `autonomy`, `branchModel`, `worktree`, `stakes`, `constraints` (schema: operating-model §8; canonical example: `templates/pipeline.json.example` in the agent-pipeline repo). Optional `handover` names the handover file (default `docs/state.md`). Missing file or missing required fields → case **F4**.
2. Check project **denies where they actually live**: committed `.claude/settings.json` (permissions) and/or `.claude/guard-config.json` (git-guard extra denies) — NOT in pipeline.json. Verify the committed deny surface exists for projects that declare one.
3. Critic role: read only the guardrail/constraint parts as review benchmark.
4. **Declarative manifest + governance (existence check FIRST, same discipline as F4):** check whether `.claude/pipeline.yaml` (the OPTIONAL declarative manifest — distinct from the required `.claude/pipeline.json` calibration above) EXISTS. If it does: (a) validate it via `node harness/scripts/validate-manifest.mjs` — existence/exit-code check only, no need to parse the full output at bootstrap; (b) read the manifest's `governance.guidelines_path` (and `policies_path`, if present) so the guidelines are already in the Elephant's session context from the start, not fetched later mid-task. A missing `.claude/pipeline.yaml` is NOT a failure case — the manifest is fully optional and F4 does not apply to it — skip this sub-step silently.
5. **Repository-scoped PO authority:** run `node harness/scripts/check-po-gate-authority.mjs` from the current checkout. It revalidates the canonical primary checkout's narrow source/runtime PO-language projection against the mode-`0600` receipt below the Git common directory and, when a feature is active, requires exactly one physical `prd_*.md`: `activeFeature.planPath`, carrying exactly one marker for that language. Branch-local profile bytes are neither authority nor a bootstrap repair target. Any receipt, primary-projection, topology, cardinality, path, marker, or digest failure blocks PO-facing authoring and `approve-plan`. Repair the receipt only with `node setup.mjs --publish-po-profile` in the canonical primary checkout, or correct the active feature authority; never copy or rewrite another worktree's profile during bootstrap.
6. **Self-application toolchain preflight (Agent-Pipeline checkout only):** when the current checkout is the Agent-Pipeline source checkout and contains both `plugins/pipeline-core/scripts/toolchain-preflight.mjs` and its repository-local `harness/` dependencies, run `node plugins/pipeline-core/scripts/toolchain-preflight.mjs --root "$PWD"`. This is a read-only observation: it resolves/probes fixed executables and inputs, does not write a receipt, does not install a tool, and does not alter checkout, configuration, or Git state. Never substitute `${CLAUDE_PLUGIN_ROOT}` and never run it in a consumer project merely because `pipeline-core` is installed: scanner configuration and license inputs are project-owned, while this preflight is the Pipeline repository's self-application control.
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

## Step 4 — Handover/state file (Elephant only; Goldfish/Critic FORBIDDEN)

- Read the project's handover file completely (path from calibration `handover`, default `docs/state.md`; in the agent-pipeline repo: `docs/state.md`). It is the SINGLE authoritative state source; memory is mirror only.
- Extract the last-updated date for the confirmation line.
- Drift check (default threshold): warn when the repo's last commit is NEWER than the handover state AND the delta since then contains at least one non-docs commit (docs-only deltas do not trigger the warning; merge-completion gate). A project MAY override via the `$driftThreshold` comment key in `.claude/pipeline.json` (default applies if absent).
- **Interaction-continuity re-entry:** run the read-only `node plugins/pipeline-core/scripts/continuity-status.mjs --root "$PWD"`. When it reports active, nonblocked work with a known next action, bootstrap treats that action as mandatory continuation: answer ordinary informational messages and record additive input, then execute the same persisted next action. Startup, resume, crash recovery and automatic/manual compact are not terminal task boundaries. Only an explicit pause/cancel/replace/redirect, a named gate, completion or a typed blocker may stop. The compact hook projects the same duty through `interaction-continuity.mjs`; never reconstruct it from chat history.
- **Local cleanup session (Elephant only):** before the first pipeline-created temporary resource, run `node plugins/pipeline-core/scripts/session-cleanup.mjs start --repo "$PWD"` once and retain only its `sessionId` plus `descriptorSha256` in continuity runtime state. On Codex, use the host-authorized repository-local execution boundary directly when the workspace sandbox forbids nested Git subprocesses; do not first run a known-to-fail sandbox probe. The nonce stays solely in the private Git-common-dir descriptor. Bootstrap, compact recovery and both close profiles use that same descriptor ID **and the persisted digest**; they never regenerate a nonce, accept a changed descriptor or infer a cleanup target from a path prefix.

## Step 5 — Verify gate available

- Confirm the project's ONE verify command (calibration field `verify`) exists and is invocable — existence/help call only, NO full gate run at bootstrap.
- Missing → treat as **F4** (STOP for writing work, offer creation).
- Why: without a runnable verify, the evidence duty is unfulfillable — that must surface at session start, not at task end.

## Step 5b — Reload reminder (detected staleness or native update notification)

- If case **F2** applies (step 2 found staleness) OR the native `/plugin → Marketplaces` update notification appeared in this session, prompt the PO to run `/reload-plugins` — BEFORE the confirmation line (step 6) is printed. The refresh commands alone (marketplace update + `plugin update … --scope project`) do not reload an already-running session; only `/reload-plugins` does (no hook can do this automatically for the live session).
- Why: without this reminder a session silently keeps running on the old cache state even though the refresh was already offered/executed — the reload step is the missing last handgrip of the refresh ritual (`harness/session-bootstrap.md` §5.2, D2/ADR-0001 addendum 2026-07-11).
- Check: if F2 applies or the native notification appeared, a `/reload-plugins` prompt sentence is evidenced BEFORE the confirmation line (session transcript). If neither applies, this step is skipped outright — no extra text in the confirmation line itself (unchanged, see step 6).

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

Elephant adds a V3 authority/advisory line directly below. Consent-approved
Epic/Feature may name only an `answered`, current, schema-valid receipt.
Missing/declined consent and Mini are accepted disabled states and must not
name a receipt:

> V3 authority: pipeline.user.v3 · Runtime projection noop · Profile {{epic|feature|mini}} · Advisory {{answered|disabled-no-consent|disabled-by-profile|po-authorized-functional-equivalent}} · Receipt {{RECEIPT_ID|n/a}} {{· Reason CODE when functional-equivalent}}

Elephant adds the model/effort line directly below (MP-17):

> Model/Effort: {{MODEL}} / {{EFFORT}} (pipeline.user.v3 route; observed identity separately verified) · Phase {{design_phase|execution_phase}} · Runner {{claude|codex}}

Elephant adds the role-prohibitions line directly below that (Step 1d):

> Role prohibitions loaded: EL-01/EL-02/EL-03/EL-04/EL-16/EL-18/EL-19 — implementation only via Goldfish dispatch (Tier-0 per OM §3.3; further exceptions only by the PO); PRD gate: present readably + wait for 'approved'

No placeholders, no "unknown" outside the defined suffix cases. **Prohibition:** printing this line without having performed steps 1–5 (see Contract).

Immediately after the confirmation line, the Elephant starts the bounded
session-power controller for the exact cleanup descriptor retained in Step 4:

`node plugins/pipeline-core/scripts/session-power.mjs start --session-id ID --expected-descriptor-sha256 SHA`

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
3. No plugin refresh/reload since (after every F2 refresh or `/reload-plugins`, the FULL path is mandatory again — unchanged contract).

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

## Failure cases F1–F5 (binding behavior)

| Case | Finding | Binding behavior |
|---|---|---|
| **F1** | Ruleset missing entirely (plugin not installed, skills not found) | **STOP.** Inform the PO. Only **minimal-safe mode**: reading (Read/Glob/Grep), read-only git (`status`/`log`/`diff`), plugin diagnosis (`/plugin` menu, settings inspection). NO edits/writes/commits/pushes, no settings changes. **NO confirmation line** — the session counts as not bootstrapped. |
| **F2** | Plugin stale (installed SHA ≠ remote HEAD) | Warn + offer the canonical scope-aware refresh ritual verbatim (D1, Project-Scope is the only supported install/update scope, → `docs/adr/0001-distribution-plugin-marketplace.md` addendum 2026-07-11): `claude plugin marketplace update agent-pipeline` → `claude plugin update pipeline-core@agent-pipeline --scope project` (the unscoped command fails with "not found," default scope is user) → then `/reload-plugins`. Work MAY continue — EXCEPT when the delta touches guardrails (paths `hooks/`, `agents/`, permission settings): then refresh FIRST, work after. Delta check: in a local checkout of the agent-pipeline repo run `git fetch` + `git log --name-only {{INSTALLED_SHA}}..origin/main`; without a checkout the default-safe rule applies: **when in doubt, refresh** (the refresh is cheap, stale guardrails are not). Confirmation line carries the NOTE suffix. After every refresh, repeat steps 1–2 (new SHA in the confirmation line) — otherwise the refresh is not evidenced. **Expectation note:** `/reload-plugins` may report "0 skills" (or an apparently empty skill count) even though skills remain invocable afterwards — verify by invoking a skill, not by the message. |
| **F3** | Offline / remote unreachable | Warn + continue on cache state (the cache is a complete copy; day-to-day operation is offline-capable). Redo the staleness check at next connectivity, at latest at the next bootstrap. Confirmation line carries the offline suffix. |
| **F4** | Calibration or handover file missing (or verify command missing) | **STOP for writing work.** Read-only analysis stays allowed. Offer creation: draft the missing calibration from the required-field list in step 3 (canonical example: `templates/pipeline.json.example` in the agent-pipeline repo — an installed plugin cannot read repo templates, so generate the draft from the field list). Newly created files MUST be named to the PO for confirmation — a new calibration is a project-policy decision, never an agent's solo act. **The confirmation line still prints** (F4 is the expected initial state in not-yet-migrated projects, not a bootstrap failure): the affected field reads `MISSING (F4)` (step 6) plus the mandatory suffix `· F4: read-only analysis only until calibration/handover is created`. |
| **F5** | `pipeline.user.v3` missing/invalid, V3 migration required, or a V3-owned runtime projection is changed/unreadable | **FAIL CLOSED.** Read-only diagnosis only. Do not use V1/V2 or runtime bytes as fallback authority, do not start advisory, do not write/dispatch, and print **no confirmation line**. Repair only through the explicit V3 migration/apply or an independently reviewed authority correction; then rerun bootstrap from Step 1a. |

Why F2 has the guardrail exception: a stale ruleset with old hooks means the session works under WEAKER protection than decided — exactly the state the pipeline exists to abolish. Feature/doc deltas may wait; protection deltas may not.

## Open points

- OPEN: authoritative machine-readable source for the installed plugin SHA (step 1); multi-machine validation (ADR-0010).
- **SessionStart hook:** the hook that requests this skill IS wired — `hooks/hooks.json` carries a `SessionStart` entry (matcher `startup|resume|clear`) running `hooks/staleness-check.mjs`, fail-open, read-only; it passed a T1 Critic review. Open only: multi-machine E2E validation.
