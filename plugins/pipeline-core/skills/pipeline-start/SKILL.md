---
name: pipeline-start
description: "Mandatory session bootstrap for Agent-Pipeline projects (ADR-0010). Run FIRST in every new session before any other work, and re-run after /clear or a plugin refresh. Verifies ruleset presence + loaded SHA, model/effort (Elephant), staleness against the marketplace remote, project calibration (.claude/pipeline.json), handover state and the verify gate - then prints the auditable confirmation line. Optional argument = role (elephant default | goldfish | critic)."
argument-hint: "[elephant|goldfish|critic]"
---

# pipeline-start — session bootstrap check

Normative source: `harness/session-bootstrap.md` in the **agent-pipeline repo** (human-readable spec — on any divergence THAT document wins), plus ADR-0010 and the compact checklist `harness/checklists/session-start.md` (canon pointers, not runtime reads: these files live in the agent-pipeline repo, not necessarily in the current project). Earlier working names `/pipeline:start` and `/pipeline-core:start` resolve to THIS skill: `/pipeline-core:pipeline-start`.

**Contract (hard):**

- **No work before the confirmation line.** The confirmation is the auditable proof of the bootstrap; a session without it counts as not bootstrapped.
- **NEVER print the confirmation line without actually performing the steps.** That is the documented main failure mode "reported done, but not verified", and a Critic audits trajectories.
- All bootstrap commands below are read-only (git `ls-remote`/`rev-parse`/`log`, file reads). The bootstrap changes nothing.

**Role:** take the role from `$ARGUMENTS` (default when empty: `elephant`).

| Step | Elephant | Goldfish | Critic |
|---|---|---|---|
| 1 presence + loaded state | full | compact (guardrails active? state = SHA from briefing) | compact (confirm read-only toolset) |
| 1b model/effort | MANDATORY | skip (frontmatter/dispatch, MP-02) | skip (frontmatter/dispatch, MP-07) |
| 1c spend/usage check | recommended (note limit once) | skip | skip |
| 1d role prohibitions | MANDATORY | skip (prohibitions come via the dispatch briefing) | skip (prohibitions come via the dispatch briefing) |
| 2 staleness check | MANDATORY | skip (Elephant fixed the SHA at dispatch) | skip |
| 3 calibration + denies | MANDATORY | only as referenced in the briefing | only guardrail/constraint parts (review benchmark) |
| 4 handover/state | MANDATORY (read completely) | **FORBIDDEN** — the briefing replaces it | **FORBIDDEN** — no handover, no history |
| 5 verify gate available | MANDATORY | MANDATORY (needed for evidence) | skip (Critic audits evidence, runs no gates) |
| 5b reload reminder (F2 or native update notification) | MANDATORY (before confirmation line) | skip (staleness check, step 2, does not apply to Goldfish) | skip (staleness check, step 2, does not apply to Critic) |
| 6 confirmation line | full + extra line | compact | compact |

Goldfish/Critic normally receive their compact variant embedded in the dispatch briefing (goldfish-task / critic-review templates in the agent-pipeline repo). If this skill runs with role `goldfish` or `critic`, execute only the steps marked above.

**Context economy — role-path-only load:** execute and read only the row/section that applies to YOUR actual role (Elephant full path, or Goldfish/Critic compact rows above; Elephant profile variants live under "Same-day light bootstrap" / "Speed bootstrap" below) — do not read the other two roles' full step text as part of running this skill. No step is dropped by this; it only stops front-loading unrelated role material into the session. **Measurable target: context after bootstrap ≤ ~75k tokens (down from >150k today), measured via the statusline.**

## Step 1 — Ruleset presence + loaded state

1. **Presence:** if you are executing this skill, the plugin `pipeline-core` is loaded — this very execution is the presence proof (session-bootstrap §3 step 1). If instead the invocation failed with "unknown skill", that is case **F1** (see failure table; the CLAUDE.md fallback line detects exactly this).
2. **Loaded state (name a concrete SHA, never "something is installed"):** resolve in this order and REPORT WHICH SOURCE you used:
   - **Self-application / plugin-dev case** (current project IS the agent-pipeline repo, or the session runs `--plugin-dir` against a checkout): `git rev-parse HEAD` in that checkout = loaded state.
   - **Installed-plugin case:** locate the marketplace clone/cache under `~/.claude/plugins/` (directory whose `.claude-plugin/marketplace.json` has `"name": "agent-pipeline"`); if it is a git clone, `git -C {{DIR}} rev-parse HEAD` = loaded state.
   - **Installed-plugin case, machine-readable source:** `~/.claude/plugins/installed_plugins.json` → entry `pipeline-core@agent-pipeline`, field `gitCommitSha` (full SHA; `version` carries the 12-char prefix, `installPath` names the cache dir). Caution: the marketplace clone can run AHEAD of the installed cache (after `marketplace update` without `plugin update`) — for the LOADED state, `installed_plugins.json` is authoritative.
   - **Neither works:** name the best available evidence (e.g. cache directory listing, install timestamp) and which source it came from — do NOT invent a SHA.

## Step 1b — Model/effort (Elephant only)

- **Profile question (THIRD OPTION `speed` NEW) — hard gate, ask BEFORE setting model/effort:** present this AskUserQuestion (3 options + free-text = PO exception):

  > Profile choice (hard, AskUserQuestion, 3 options + free text = PO exception): "Session profile for this topic — Advisor (Cost/Quality) [advisor] (design-tier model throughout from session start + an attached advisor model — default, as long as the advisor model is billed outside your own plan quota) or Design-First (Cost+/Quality+) [design-first] (phase-aware: is the design for this topic ALREADY approved? → go straight to the execution phase, design-tier model at effort `max` from session start, otherwise the design-tier model only for T1 critics/readiness subagents; otherwise design-tier model at effort `xhigh` until the PRD approval gate, then EXACTLY ONE switch to effort `max` — cost consequence: a model outside your own plan quota can cost a noticeable share of an execution session as overage; check your own billing model beforehand, don't assume) or Speed (mini-feature/hotfix) [speed] (implement-tier model + a design-tier advisor active from session start — exact model/effort/advisor commands per `policies/model-policy.md` MP-28; light bootstrap: only ruleset SHA + calibration existence + verify availability + operational handover head, ONE confirmation line instead of three, no profile ceremony; scope ~≤5 files, NO guardrail/canon files, no new dependencies — breaching the boundary ⇒ mandatory escalation to the full profile; guard hooks always stay active; details → "Speed bootstrap" below)?"

  The PO decides per the topic of the first prompt. A free-text answer is the PO-exception path (e.g. a special session running the advisor model as the main model — stays PO-designatable, not a fourth button). Present the verbatim commands for the chosen profile (the model/effort/advisor names below are the shipped default preset — override them in `pipeline.user.yaml`):

  > Profile advisor (from session start):
  > /model opus
  > /effort max
  > /advisor fable
  >
  > Profile design-first, design already approved (phase-aware) — from session start:
  > /model opus
  > /effort max
  >
  > Profile design-first, design not yet approved (switch at the PRD approval gate):
  > /model opus
  > /effort max
  >
  > Advisor hygiene (design-first, if advisor is configured):
  > /advisor off
  >
  > Profile speed (from session start, details → "Speed bootstrap" below):
  > Model/effort/advisor per `policies/model-policy.md` (MP-28) — fixed mapping, no further profile ceremony.

  **Advisor hygiene:** if profile `design-first` is chosen and an advisor is already configured (leftover `advisorModel` user setting from a prior `advisor`-profile session, persists per machine), check in this order: (1) ask about parallel advisor sessions of other projects on this machine; (2) prefer the project-local off-switch `"advisorModel": ""` in `.claude/settings.local.json` (the live settings validator rejects `null` although the docs name it; `$comment` keys are invalid in `settings.local.json`); (3) `/advisor off` ONLY when no parallel session is affected; (4) **divergence = mandatory question (PO condition "one always decides"):** whenever the ACTUAL advisor state diverges from the chosen profile's intended state (e.g. a machine-inherited advisor in a design-first session), put the resolution to the PO as an AskUserQuestion (keep attached / project-local off / `/advisor off`) — silent inheritance is a bootstrap defect, informing without asking does NOT satisfy the duty.
- Verify the session runs the model/effort of the **chosen profile** (Step 1b profile question): profile `design-first` → **phase-aware:** if the design for this session's topic is ALREADY approved (the standard case for a follow-up execution session after an EL-25 cut), start DIRECTLY in the execution phase — **the design-tier model at effort `max`** from session start, the advisor model only for T1 critics/readiness subagents; otherwise **the design-tier model at effort `xhigh`** until the PRD-gate switch (MP-01 standard), then EXACTLY ONE switch to effort **`max`** (EL-24, sanctioned exception MP-17/MP-18); profile `advisor` → **the design-tier model at effort `max` + the advisor model** already from session start (MP-26 — standard recommendation while the advisor model is not subscription-covered); profile `speed` (NEW) → model/effort/advisor per `policies/model-policy.md` (MP-28) already from session start — fixed pairing, no phase switch, no advisor-hygiene sub-flow. Effort is **session-only**: if unset or wrong, ask the PO to run the profile's verbatim commands NOW, before any work. **Advisory duty:** `xhigh` is the design-phase standard; `max` otherwise only for design-tier fallback operation, for implement-tier dispatches, for PO-designated special tasks (e.g. initial sessions of entirely new topics; for tasks that call for maximal reasoning the ultracode task opt-in, MP-08, remains the alternative), or for **planned execution-phase design-tier operation** — no generic `max` recommendation beyond these. Advisory duty now = point out the OPTION when the PO himself has designated such a task, not proactive lobbying.
- **Model-identity hardening:** assert the active model from OBSERVED evidence — `/model` output or explicit PO confirmation — never assumed, especially in the turns right after a credit-limit/reset event (silent model-fallback risk).
- Confirm the env var `CLAUDE_CODE_SUBAGENT_MODEL` is **NOT set** (MP-04 — it would silently override every subagent's frontmatter model and void the model matrix).
- Deviations from the role default are justification-bound against `policies/model-policy.md` (agent-pipeline repo).
- **Advisor readiness probe (hardening of MP-26g after an observed gap — sessions want to leave the advisor out or switch to the design-tier model instead of running the prescribed workaround):** in profile `advisor`, AFTER enabling the advisor, the Elephant actively probes advisor availability ONCE at session start (one trivial, cheap advisor consult). If that first contact reports `unavailable`/an error, MP-26g applies in exactly this order: (a) alert the PO IMMEDIATELY, same turn; (b) stand up the `pipeline-core:advisor-consult` skill as the session's advisory replacement channel for the rest of the session — this is the MANDATORY PRIMARY path, not an optional suggestion; (c) additionally (not alternatively) offer the PO a fallback-advisor switch (routing the advisor to the design-tier model). Never proceed silently without an advisor channel, and never unilaterally switch the session's MAIN model to the design-tier model as a substitute reaction.
  - **Check:** session notes/handover name the probe outcome (mirrors the existing post-compact advisor-check convention — no new literal-checked confirmation-line field). A skipped probe in profile `advisor` is a bootstrap defect.
  - **Live-validation caveat:** the probe is specified but not yet live-validated against a real advisor outage — a follow-up item, since it needs an actual outage to observe; this is not a blocker for shipping the specification.
- **Effort-introspection limit:** session effort is NOT machine-introspectable from inside the session — unlike the model half, which `/model` output confirms directly (see the model-identity-hardening point above). The only reliable source is this bootstrap step itself: setting it once per the chosen profile plus the explicit (possibly PO-confirmed) second confirmation line — there is no introspection tool that returns it. This gap does not block read-only work: read-only work may start in parallel with a still-pending PO confirmation (practiced pattern, now codified here).

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

- Derive the marketplace URL from the **committed** `.claude/settings.json` of the current project (`extraKnownMarketplaces` entry → e.g. github repo → `https://github.com/{{OWNER_REPO}}.git`). Never hardcode the URL.
- Run `git ls-remote {{MARKETPLACE_URL}} HEAD` and compare with the loaded SHA from step 1. Bound the attempt (~30 s); a hanging remote counts as unreachable.
  - Equal → current.
  - Differs → case **F2**.
  - Remote unreachable / offline → case **F3**.
- Self-application case (working in the agent-pipeline repo itself): compare `git rev-parse HEAD` with `git ls-remote origin HEAD`. Being AHEAD of origin is fine there (you are authoring the ruleset); only BEHIND origin/main counts as stale.
- Why: third-party marketplaces do not auto-update; only an explicit refresh propagates — without this check, two-machine cache drift silently replaces the old copy-paste drift.

## Step 3 — Project calibration + denies (existence check FIRST)

1. Check `.claude/pipeline.json` **EXISTS** in the project, then read it completely. Keys starting with `$` are documentation and ignored. Required minimum fields: `project`, `verify`, `autonomy`, `branchModel`, `worktree`, `stakes`, `constraints` (schema: operating-model §8; canonical example: `templates/pipeline.json.example` in the agent-pipeline repo). Optional `handover` names the handover file (default `docs/state.md`). Missing file or missing required fields → case **F4**.
2. Check project **denies where they actually live**: committed `.claude/settings.json` (permissions) and/or `.claude/guard-config.json` (git-guard extra denies) — NOT in pipeline.json. Verify the committed deny surface exists for projects that declare one.
3. Critic role: read only the guardrail/constraint parts as review benchmark.
4. **Declarative manifest + governance (existence check FIRST, same discipline as F4):** check whether `.claude/pipeline.yaml` (the OPTIONAL declarative manifest — distinct from the required `.claude/pipeline.json` calibration above) EXISTS. If it does: (a) validate it via `node harness/scripts/validate-manifest.mjs` — existence/exit-code check only, no need to parse the full output at bootstrap; (b) read the manifest's `governance.guidelines_path` (and `policies_path`, if present) so the guidelines are already in the Elephant's session context from the start, not fetched later mid-task. A missing `.claude/pipeline.yaml` is NOT a failure case — the manifest is fully optional and F4 does not apply to it — skip this sub-step silently.

## Step 4 — Handover/state file (Elephant only; Goldfish/Critic FORBIDDEN)

- Read the project's handover file completely (path from calibration `handover`, default `docs/state.md`; in the agent-pipeline repo: `docs/state.md`). It is the SINGLE authoritative state source; memory is mirror only.
- Extract the last-updated date for the confirmation line.
- Drift check (default threshold): warn when the repo's last commit is NEWER than the handover state AND the delta since then contains at least one non-docs commit (docs-only deltas do not trigger the warning; merge-completion gate). A project MAY override via the `$driftThreshold` comment key in `.claude/pipeline.json` (default applies if absent).

## Step 5 — Verify gate available

- Confirm the project's ONE verify command (calibration field `verify`) exists and is invocable — existence/help call only, NO full gate run at bootstrap.
- Missing → treat as **F4** (STOP for writing work, offer creation).
- Why: without a runnable verify, the evidence duty is unfulfillable — that must surface at session start, not at task end.

## Step 5b — Reload reminder (detected staleness or native update notification)

- If case **F2** applies (step 2 found staleness) OR the native `/plugin → Marketplaces` update notification appeared in this session, prompt the PO to run `/reload-plugins` — BEFORE the confirmation line (step 6) is printed. The refresh commands alone (marketplace update + `plugin update … --scope project`) do not reload an already-running session; only `/reload-plugins` does (no hook can do this automatically for the live session).
- Why: without this reminder a session silently keeps running on the old cache state even though the refresh was already offered/executed — the reload step is the missing last handgrip of the refresh ritual (`harness/session-bootstrap.md` §5.2, D2/ADR-0001 addendum 2026-07-11).
- Check: if F2 applies or the native notification appeared, a `/reload-plugins` prompt sentence is evidenced BEFORE the confirmation line (session transcript). If neither applies, this step is skipped outright — no extra text in the confirmation line itself (unchanged, see step 6).

## Step 6 — Confirmation line (verbatim format, mandatory, final step)

Print exactly this line (all five fields with concrete values; the check is literal — the line must begin with "Bootstrap check passed:"):

> Bootstrap check passed: ruleset {{VERSION_OR_SHA}} loaded · Project {{PROJECT_NAME}} · Calibration {{CALIBRATION_FILE}} · State {{HANDOVER_DATE}} · Role {{Elephant|Goldfish|Critic}}

Allowed suffixes (only these, each appended with "·"):

- Case F3: `· Staleness unchecked (offline, cache state)`
- Accepted case F2: `· NOTE: ruleset stale ({{N}} commits behind remote)`
- Same-day light bootstrap (see "Same-day light bootstrap" below): `· Staleness same-day cached (full check {{HH:MM}})`
- Speed bootstrap (see "Speed bootstrap" below): `· Profile speed — light bootstrap (details → "Speed bootstrap")`; the model/effort extra line and the role-prohibitions extra line (both step 6.1 below) are OMITTED in this case — they still apply unchanged in substance, they are just not printed as separate lines (ONE confirmation line instead of three).
- Case F4 (calibration and/or handover missing — the EXPECTED initial state in not-yet-migrated projects): the affected field carries `MISSING (F4)` instead of a placeholder value — i.e. `Calibration MISSING (F4)` resp. `State MISSING (F4)` — PLUS the mandatory suffix `· F4: read-only analysis only until calibration/handover is created`.

Role variants of the "State" field:

- Goldfish: `State briefing {{TASK_ID_OR_DATE}}` (SHA comes from the briefing; a briefing without SHA is a briefing defect → return to the Elephant, do not research it yourself)
- Critic: `State n/a (Critic sees no history)` (additionally confirm: no write tools available — if you CAN write, the wrong agent definition is loaded → bootstrap failed, stop)

Elephant adds a second line directly below (MP-17):

> Model/Effort: {{MODEL}} / {{EFFORT}} (per policies/model-policy.md) · Profile {{advisor|design-first|PO exception}} · Advisor {{ADVISOR|off}}

Elephant adds a THIRD line directly below that (Step 1d):

> Role prohibitions loaded: EL-01/EL-02/EL-03/EL-04/EL-16/EL-18/EL-19 — implementation only via Goldfish dispatch (Tier-0 per OM §3.3; further exceptions only by the PO); PRD gate: present readably + wait for 'approved'

No placeholders, no "unknown" outside the defined suffix cases. **Prohibition:** printing this line without having performed steps 1–5 (see Contract).

## Same-day light bootstrap ("short bootstrap", Elephant only)

Preconditions (ALL must hold, else full bootstrap):

1. Same machine AND same calendar day as a documented FULL bootstrap (evidence: the topmost session block of the project's handover file records that bootstrap with date).
2. Loaded ruleset SHA unchanged versus that full bootstrap.
3. No plugin refresh/reload since (after every F2 refresh or `/reload-plugins`, the FULL path is mandatory again — unchanged contract).

Light form (deviates from Steps 1–6 above ONLY as follows; every step not listed here runs unchanged):

- **Step 1:** local SHA only (no `ls-remote`).
- **Step 1b:** unchanged (MANDATORY) — **the profile question repeats at EVERY bootstrap**, light path included: it is a cheap single UI question, and a mid-day profile change is a new session anyway.
- **Step 1d:** unchanged (embedded, cheap).
- **Step 2:** SKIPPED, with mandatory suffix `· Staleness same-day cached (full check {{HH:MM}})` (see Step 6 allowed-suffix list).
- **Step 3:** existence check only.
- **Step 4:** read the handover HEAD block + topmost session block only — UNLESS the handover changed since the full bootstrap (newer commits/date) → full read.
- **Step 5:** existence check only.
- **Step 6:** confirmation line as usual + the suffix above.

Why: a full bootstrap already completed the same calendar day on the same machine makes the expensive checks (remote staleness, full handover read) redundant — PROVIDED ruleset state and handover state are demonstrably unchanged since; the three preconditions are the evidence duty for that, not a shortcut by feel.

## Speed bootstrap (light, mini-feature/hotfix, Elephant only)

**Origin:** third profile option alongside `advisor`/`design-first` in Step 1b — for genuinely small, tightly-bounded diffs (mini-feature/hotfix), not for architecture/guardrail work.

**Precondition:** the PO picks `speed` at the Step 1b profile question. Unlike the same-day light bootstrap above, `speed` is NOT bound to "same machine/same calendar day" — it is a task-shape decision (mini-feature/hotfix), not a cache-freshness one.

**Scope (hard limits — a breach forces mandatory escalation):**

- Mini-feature/hotfix scope only: **~≤5 files touched.**
- **NO guardrail/canon files** in scope — canonical list of forbidden file-classes for the `speed` profile: `policies/model-policy.md` (MP-28); not re-enumerated here to avoid divergence.
- **No new dependencies.**
- If any of these limits become visible as breached mid-session (scope grew beyond the mini-feature/hotfix shape): **mandatory escalation to the full profile** — switch to the full bootstrap/full process immediately, do not keep working the speed path (escalation logic mirrors `harness/checklists/small-session.md`, "Escalation rule" section).
- **Guard hooks stay fully active in EVERY profile, including `speed`** (deterministic, free) — speed saves ceremony, not safety.

**Light bootstrap form** (deviates from the full path in Steps 1–6 ONLY as follows; every step not listed here runs unchanged or is dropped exactly as specified below):

- **Step 1:** local ruleset SHA only (no `ls-remote`).
- **Step 1b:** the profile question itself runs normally (that IS the speed choice); after it, the advisor-hygiene check and the advisor readiness probe are SKIPPED (both are `advisor`-profile-specific) — model/effort/advisor pairing is fixed in the speed profile (`policies/model-policy.md`, MP-28), set once, no follow-up questions.
- **Step 1c:** skipped (no spend/usage check as a separate act).
- **Step 1d:** skipped as a separate confirmation line — the role prohibitions (EL-01/EL-02/EL-03/EL-04/EL-16/EL-18/EL-19) still apply unchanged in substance, they are just not repeated as their own line in the speed path.
- **Step 2:** skipped entirely (no remote staleness check).
- **Step 3:** existence check of the calibration file only (no full read).
- **Step 4:** the operative head of the handover file only — no full session-history read.
- **Step 5:** existence/invocability check of verify only.
- **Step 6:** **ONE confirmation line instead of three** (format → Step 6 above, suffix `· Profile speed — light bootstrap`).

**Light process** (not just the bootstrap — applies to the whole task): no PRD document; direct dispatch, or a mini-edit for the smallest fixes (stage-0 fast path per `docs/operating-model.md` §3.3); a light review tier instead of a full Design-Tier review — the existing Critic-trigger matrix decides as usual, this is not a new Critic rule (→ `harness/checklists/small-session.md` step 3); short close via the **close-light variant** of the `close-block` skill (`plugins/pipeline-core/skills/close-block/SKILL.md`) — its own hard eligibility gate applies unchanged, speed does not override it.

**Why:** a mini-feature or a hotfix used to run under the same heavy ceremony as an architecture rebuild — the exceeded proportionality guardrail. Speed cuts the ceremony without touching a single deterministic guardrail.

## Failure cases F1–F4 (binding behavior)

| Case | Finding | Binding behavior |
|---|---|---|
| **F1** | Ruleset missing entirely (plugin not installed, skills not found) | **STOP.** Inform the PO. Only **minimal-safe mode**: reading (Read/Glob/Grep), read-only git (`status`/`log`/`diff`), plugin diagnosis (`/plugin` menu, settings inspection). NO edits/writes/commits/pushes, no settings changes. **NO confirmation line** — the session counts as not bootstrapped. |
| **F2** | Plugin stale (installed SHA ≠ remote HEAD) | Warn + offer the canonical scope-aware refresh ritual verbatim (D1, Project-Scope is the only supported install/update scope, → `docs/adr/0001-distribution-plugin-marketplace.md` addendum 2026-07-11): `claude plugin marketplace update agent-pipeline` → `claude plugin update pipeline-core@agent-pipeline --scope project` (the unscoped command fails with "not found," default scope is user) → then `/reload-plugins`. Work MAY continue — EXCEPT when the delta touches guardrails (paths `hooks/`, `agents/`, permission settings): then refresh FIRST, work after. Delta check: in a local checkout of the agent-pipeline repo run `git fetch` + `git log --name-only {{INSTALLED_SHA}}..origin/main`; without a checkout the default-safe rule applies: **when in doubt, refresh** (the refresh is cheap, stale guardrails are not). Confirmation line carries the NOTE suffix. After every refresh, repeat steps 1–2 (new SHA in the confirmation line) — otherwise the refresh is not evidenced. **Expectation note:** `/reload-plugins` may report "0 skills" (or an apparently empty skill count) even though skills remain invocable afterwards — verify by invoking a skill, not by the message. |
| **F3** | Offline / remote unreachable | Warn + continue on cache state (the cache is a complete copy; day-to-day operation is offline-capable). Redo the staleness check at next connectivity, at latest at the next bootstrap. Confirmation line carries the offline suffix. |
| **F4** | Calibration or handover file missing (or verify command missing) | **STOP for writing work.** Read-only analysis stays allowed. Offer creation: draft the missing calibration from the required-field list in step 3 (canonical example: `templates/pipeline.json.example` in the agent-pipeline repo — an installed plugin cannot read repo templates, so generate the draft from the field list). Newly created files MUST be named to the PO for confirmation — a new calibration is a project-policy decision, never an agent's solo act. **The confirmation line still prints** (F4 is the expected initial state in not-yet-migrated projects, not a bootstrap failure): the affected field reads `MISSING (F4)` (step 6) plus the mandatory suffix `· F4: read-only analysis only until calibration/handover is created`. |

Why F2 has the guardrail exception: a stale ruleset with old hooks means the session works under WEAKER protection than decided — exactly the state the pipeline exists to abolish. Feature/doc deltas may wait; protection deltas may not.

## Open points

- OPEN: authoritative machine-readable source for the installed plugin SHA (step 1); multi-machine validation (ADR-0010).
- **SessionStart hook:** the hook that requests this skill IS wired — `hooks/hooks.json` carries a `SessionStart` entry (matcher `startup|resume|clear`) running `hooks/staleness-check.mjs`, fail-open, read-only; it passed a T1 Critic review. Open only: multi-machine E2E validation.
