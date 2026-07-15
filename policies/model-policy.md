# Model Policy — Roles, Effort, Workflows, Budget, Telemetry

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · as of 2026-07-03

This policy operationalizes the role-model matrix, the Ultracode/workflow rules, cache discipline, and the requirements around acceptEdits preconditions and cost telemetry from the project's own decision register (where one exists). On conflict, that decision register wins. The policy is deliberately **model-agnostic**: rules speak of role tiers (Design/Implement/Mechanic/Deep/Review/Advisor) — the Implement/Mechanic/Deep/Review dispatch tiers live in `pipeline.user.yaml` → `models.*`, the Design (orchestrator) and Advisor tiers are routed per session profile via `worktypes.*` — not product names; concrete model names appear only as the shipped default preset (Section 1).

Sibling documents of this phase: `docs/operating-model.md` (roles, rituals, session lifecycle), `policies/tooling-policy.md` (version requirements, tooling radar), `harness/session-bootstrap.md` (session-start protocol), `docs/adr/` (formalization as ADRs).

All rules carry IDs (**MP-xx**) and follow the pattern **Rule (must/must-not) → Why → How to check**.

---

## 1. Role-Tier-Effort Matrix

### Shipped default (preset, `pipeline.user.yaml` → `worktypes.*` + `models.*`)

The pipeline distinguishes two config layers: **orchestrator/advisor routing per session profile** (`worktypes.<profile>.{design_phase,execution_phase,advisor}`, one entry for each of the three session profiles `design`/`feature`/`mini` — see MP-28/`harness/session-bootstrap.md` §6.5 for the profile names design-first/advisor/speed) and **four dispatch tiers** (`models.*`: Implement/Mechanic/Deep/Review). `setup.mjs` writes a preset matching the PO's subscription tier at setup time; the **Max preset** below is the recommended starting point and this repo's committed default state:

| Tier (config key)  | Role                              | Default model (Max preset) | Default effort |
|---------------------|-------------------------------------|------------------------------|-----------------|
| `worktypes.<profile>.{design_phase,execution_phase}` | Elephant (Orchestrator), routed per session profile & phase | opus (`design` profile, both phases) / opus→sonnet (`feature` profile: opus design phase, sonnet execution phase, revised 2026-07-10) / sonnet (`mini` profile, both phases) | high — see `pipeline.user.yaml` → `worktypes` for the full per-profile/phase matrix (revised 2026-07-10, was high–max) |
| `models.implement`  | Goldfish (Implementor)             | sonnet                       | medium          |
| `models.mechanic`   | Goldfish (Mechanic)                | sonnet                       | low             |
| `models.deep`       | Goldfish (Deep, MP-27)             | sonnet                       | xhigh           |
| `models.review`     | Critic                             | sonnet                       | max             |
| `worktypes.<profile>.advisor` | optional second-opinion advisor, per session profile | `off` (`design` profile) / opus (`feature`/`mini` profiles, fixed pairing — `feature` advisor changed from `off` to `opus` 2026-07-10) | — |

All values are overridable in `pipeline.user.yaml` — the "Pro" preset, for instance, runs every role on the cheaper model with staggered effort (see comment in `pipeline.user.yaml`). This policy owns the semantic constraints; the single machine-readable authority for mutable shipped-default assignments is `plugins/pipeline-core/config/routing-authority.json`, resolved through the runner mappings and checked by Full Verify. From here on this policy speaks only of **tiers**, never product names. **`goldfish-deep` is its own config tier, `models.deep`** (MP-27, added alongside Implement/Mechanic/Review): it runs on the configured Deep-tier model at effort `xhigh` — the full thinking budget for test-suite/guardrail-class work (on the Design-tier orchestrator model instead, where genuine design latitude exists rather than implementation-with-a-full-budget).

### MP-01 — Design tier: model/effort fixed per session, switch only at one named gate

- **Must:** The Design-tier model (Elephant/orchestrator) runs throughout the design phase (Triage → Interview/Spec → Readiness, MP-22) continuously on the configured Design-tier model at standard effort `high`–`xhigh`. Model AND effort are set at session start and stay stable until the next phase/profile boundary (MP-17) — no silent mid-session switch.
- **Execution phase — configurable profile:** From the Goldfish dispatch (execution phase) onward, the pipeline allows two modes, deliberately chosen per project/session:
  1. **Continuous:** the Design-tier model stays active for execution-phase orchestration too (higher capability, higher cost across the whole session).
  2. **Gate switch (the one sanctioned exception):** orchestration switches EXACTLY ONCE, right at the PRD-approval gate, to a cheaper/faster configuration for the execution phase — typically justified by the chosen provider's billing model (cost-per-task calculus, MP-13). Switching BACK to the pricier Design-tier model mid-execution-phase remains forbidden without exception (cache invalidation, MP-17/MP-18).
  Choosing the mode is a deliberate, documented decision (never an implicit default) — token-heavy work is delegated to goldfish anyway instead of switching the orchestrator model (MP-18).
- **Must (effort):** Standard effort for the Design tier is `high`–`xhigh` (many providers' official guidance: `xhigh`/comparable high tiers are the sweet spot for most agentic coding tasks; the top tier shows "diminishing returns" and should be reserved sparingly for the hardest individual cases). The top tier is a named session exception, not a standing setting — the effort switch itself invalidates the cache (MP-17), so only recommend switching at session/block boundaries. The PO (user command) always makes this call — never silent continuation in the wrong mode.
- **Model-identity hardening:** The active model identity is confirmed from OBSERVED evidence (e.g. a runtime status output or an explicit PO confirmation), never assumed — especially right after limit/fallback events.
- **Why:** A pricier, more capable orchestrator model often uses FEWER tokens overall because it's more effective at finding solutions and saves iteration loops — even at a higher per-token price (cost per task counts, not $/MTok, MP-13).
- **Operational note (generic caution, provider-dependent):** Some models bill thinking tokens covertly as expensive output, or auto-fall back to another model under certain trigger conditions (e.g. a safety classifier) — that invalidates the cache and, if observed, belongs in the telemetry "peculiarities" column (MP-19). Verify your own provider's behavior before session start, don't assume it.
- **How to check:** Session bootstrap (`harness/session-bootstrap.md`) sets and verifies model+effort as a mandatory step — effort is session-only and must be re-set at every start; the top effort tier only counts as correctly configured if the session exception is named. The telemetry line records model/effort; issued or omitted switch-hints at detected large blocks are Critic-/retro-checkable.

### MP-02 — Goldfish: model floor = Mechanic-tier model, effort per MP-27

- **Must:** Goldfish never run below the configured Mechanic-tier model (hard model floor — no downgrade to a smaller/cheaper model class, not even for trivial tasks). Effort allocation itself now follows the 3-tier matrix in MP-27, not a single flat effort value.
- **Implementation:** Subagent frontmatter sets model + effort explicitly per subagent (plugin level) — never implicit inheritance from the main model (related trap: MP-04, global model-override env var).
- **How to check:** Frontmatter of the versioned plugin agents shows the model floor; telemetry line per Goldfish block.

### MP-27 — Goldfish 3-tier effort matrix

- **Must:** Goldfish dispatches run on one of three dedicated subagents, each with a fixed effort (frontmatter, not prose):
  - **`goldfish-mechanic`** — effort **`low`**: mechanical, uniform, pure plan execution with no in-task design decisions, fully specified briefing.
  - **`goldfish-implementor`** — effort **`medium`** — the default for clearly briefed implementation tasks.
  - **`goldfish-deep`** — effort **`xhigh`**: test-suite/verify authorship, guardrail/hook/canon code, tasks with genuine in-task design latitude, senior-class work.
  Planning/design and analysis synthesis stay unchanged on the Design tier at `xhigh`+ (MP-01/MP-22/MP-23 untouched).
- **Pre-authorized revert path:** if the error rate measurably rises (first-pass-rate measurement series), a dated revert from `medium` to `xhigh` for the Implementor tier is pre-approved — needs only a dated entry in the project's own decision log + telemetry evidence, no new gate.
- **Cross-note (Critic matrix, MP-07 untouched):** as Goldfish implementation effort drops, the importance of the review gate RISES rather than falls — the trigger criteria and model choice in MP-07 stay unchanged.
- **Why:** clearly briefed, plan-faithful execution doesn't need the same thinking budget as guardrail/design work; the matrix maps that 1:1 onto three named, versioned subagents instead of an effort field in the dispatch prompt.
- **How to check:** `grep` across the three agent frontmatters (`plugins/pipeline-core/agents/goldfish-mechanic.md`, `-implementor.md`, `-deep.md`) shows the three effort values exactly; dispatch metadata names the chosen subagent; first-pass rate feeds into the next periodic review (Section 5).

### MP-28 — `speed` profile: Implement-tier model at effort `high` + Design-tier advisor from session start (NEW; effort revised 2026-07-10, was `max`)

- **Must (model pairing, effort revised 2026-07-10 — was `max`; rationale: high is sufficient and faster):** A third session-start profile, defined ALONGSIDE the existing `design-first` and `advisor` profiles (MP-01, MP-26): **`speed`** — the mini-feature/hotfix profile. Model pairing: the **Implement-tier model at effort `high`** runs as the session's MAIN model — an inversion of the usual pattern where the Design-tier model orchestrates the session — paired with the **Design-tier model active as advisor from session start** (MP-26(b) already defines the advisor as Design-tier model class; `speed` is the profile that keeps that advisor engaged from the very first turn, on top of a cheaper main model). Any tier below the Mechanic tier once floated for this profile stays FUTURE ONLY and requires a dedicated measurement run first — do NOT enable it here; this does not create a fourth exception to MP-03's below-Mechanic-tier ban.
- **Scope (hard limits):** `speed` is bounded to ≤5 files touched, no new dependencies, and NO files from any of the following classes — **the canonical speed-scope forbidden-file-class list** (`harness/session-bootstrap.md` §6.5 and the `pipeline-start` skill point here rather than re-enumerating): `guardrails/*`, `roles/*`, `policies/*`, `docs/operating-model.md`, hook files under `plugins/pipeline-core/hooks/*`, `.claude/settings.json`, guard-config (`.claude/guard-config.json`). Breaching any of these three limits mid-task is a MANDATORY escalation to the full profile (`design-first` or `advisor`) — not a judgment call the session talks itself out of. Guard hooks stay active UNCONDITIONALLY under `speed` — the profile trims ceremony, never the deterministic guard layer (`policies/tooling-policy.md` G1/W3).
- **Bootstrap (cross-ref):** the lightweight bootstrap ritual for `speed` — ruleset version, calibration file, verify availability, the operative handover head, ONE confirmation line instead of three, no profile ceremony — is defined in `harness/session-bootstrap.md` §6.5; this policy governs model/effort and scope only, that section governs the ritual.
- **Process:** no PRD document required; direct dispatch (or a mini-edit path for the smallest fixes); a light review stage replaces the full Design-tier review; a short close replaces the full close ceremony. This is a proportionality trade for genuinely small, bounded work — it does NOT exempt a `speed`-profile task from the MP-07 criticality triggers (architecture/guardrails/security still force Design-tier/`max` review regardless of profile).
- **Why:** Mini-features and hotfixes were paying the same session-ceremony cost as full-feature work. A proportionate profile for genuinely small, bounded diffs closes that gap without touching the below-Mechanic-tier ban (MP-03) or the guard layer (G1). The PO confirmed the model pairing verbatim: "speed profile = Implement-tier/`max` + Design-tier advisor." **Effort revised 2026-07-10:** the verbatim quote is the historical record of that decision; the effective execution effort is now `high` across all three profiles (`design`, `feature`, `mini`) — the model pairing itself (Implement-tier main + Design-tier advisor) is untouched by this revision.
- **How to check:** Bootstrap step 1b (profile selection) offers `speed` as a third option; dispatch metadata for a `speed`-profile session names the profile explicitly; a session that exceeds ≤5 files, touches a guardrail/canon file, or adds a dependency without a logged escalation to the full profile is a bootstrap/process defect, flagged at close.

### MP-03 — MUST NOT: models below the Mechanic tier for implementation/judgment/review

- **Must not (hard):** No model below the Mechanic-tier class for implementation, judgment, or review work in the pipeline — not as Goldfish, not as Critic, not as a workflow stage that produces or evaluates artifacts. The three exceptions below are exhaustive.
- **Why:** (a) Quality risk creates iteration loops that eat the nominal savings — the pipeline's cost lever is model price + cache discipline + small Goldfish contexts, not a weaker model. (b) The smallest model class typically has no effort parameter, no adaptive thinking, and a smaller context — unsuitable for diffs/implementations with real substance.
- **Exception (a) — built-in runtime mechanisms:** Excepted are built-in agent-runtime mechanisms that internally use a smaller model class (e.g. a `/goal` evaluator) — that isn't a role assignment.
- **Exception (b) — harness-internal read-only summarizer:** WebFetch/WebSearch summarization may run internally on the smallest model class — sanctioned-but-noted, as long as the output stays a pure fetch summary (no judgment, no artifact creation). Telemetry may report the model without that counting as a violation.
- **Exception (c) — research-fetcher class:** tightly scoped, read-only web-search/fetch/extraction dispatches with no judgment/synthesis/artifact creation may explicitly run as research-fetcher on the smallest model class — preconditions and measurement basis: see MP-25.
- **How to check:** `grep` across the plugin's versioned agent/skill frontmatter: no model below the Mechanic-tier class outside the three named exceptions. Plus MP-04 (env-var ban). Critic review of guardrail changes checks this too.

### MP-25 — Research-fetcher class: read-only dispatches on the smallest model class

- **Must:** Read-only web-search/fetch/extraction dispatches — no repo writes, no artifacts, no judgment — MAY run on the smallest available model class. Requires explicit dispatch metadata: `role=research-fetcher`. Synthesis or evaluation of the fetched material stays at least Mechanic tier (never below) — the research-fetcher class covers EXCLUSIVELY the pure fetch/extraction step; MP-03's ban otherwise stays unchanged.
- **Why:** A pure fetch/extraction step needs no judgment budget; the class is deliberately narrow — it loosens MP-02/MP-03 for nothing beyond the pure fetch step. Measurement basis: in the project's own comparison measurements, a research-fetcher dispatch delivered usable results in a fraction of the time and tokens of a comparable Mechanic-/Implement-tier dispatch of the same task class — keep your own numbers in the project telemetry log, don't use this policy as a numbers source.
- **How to check:** dispatch metadata explicitly names `role=research-fetcher`; any dispatch that synthesizes, evaluates, or produces a committed artifact from the fetched material is NOT a research-fetcher dispatch and must run at least Mechanic tier (MP-02/MP-03).

### MP-04 — MUST NOT: set a global model-override env var

- **Must not:** An environment variable that overrides ALL subagents' frontmatter is never set globally (in Claude Code: `CLAUDE_CODE_SUBAGENT_MODEL`).
- **Why:** A global override to a smaller or larger model class would silently defeat the differentiated tier matrix (Goldfish ≠ Critic ≠ critical Critic).
- **How to check:** Session bootstrap checks that the var is unset (`harness/session-bootstrap.md`).

### MP-05 — Escalation: Goldfish → higher tier

- **Must:** The Design-tier orchestrator decides escalation AT DISPATCH TIME and logs it in the briefing as "model rationale" in the mandatory "dispatch metadata" field (canonical briefing field list: `docs/operating-model.md` §2.3). Escalation criteria (one suffices):
  1. task spans multiple subsystems or very many files (rule of thumb: >15 files or expected diff >800 lines — starting values, to be calibrated via telemetry);
  2. solution path stays ambiguous despite the spec (several plausible implementations, briefing can't pre-decide everything);
  3. the same task class already failed on the Implement-tier model despite an improved briefing (two-failed-attempts rule exhausted, escalating to the orchestrator produced no better briefing → the next lever is the model);
  4. long autonomous runs with a very large token budget, where a higher tier supports long context windows at lower cost per token.
  The escalation target tier is typically the Design-tier model (more capability for "genuinely large").
- **Why:** without named criteria, escalation would be ad hoc and unauditable.
- **How to check:** briefing field present; telemetry line shows the escalated model + task shorthand; periodic review compares escalation rate and success.

### MP-06 — De-escalation within the matrix

- **Must:** De-escalation means ONLY lower effort (never a lower tier/model). For mechanical/uniform Goldfish tasks (clear plan, small diffs, no design decisions) the `goldfish-mechanic` subagent (effort `low`, MP-27) is the de-escalation target. Model floors (Goldfish/Critic: Mechanic-tier model; Design tier: the configured Design-tier model) are never undercut.
- **Why:** effort controls overall token readiness — that's the legitimate savings lever; switching to a lower model class violates the tier matrix. Caution: the effort scale is calibrated PER MODEL — "high" on a smaller model ≠ "high" on a larger one; don't compare effort levels across models.
- **How to check:** telemetry; frontmatter defaults in the plugin.

### MP-07 — Critic staggering: Review tier by default, escalation on criticality

- **Must:** Critic reviews run by default on the Review-tier model / effort `max`. **Escalation to a higher tier (Design-tier model) is MANDATORY** when the review subject touches any of:
  - **Architecture:** ADR-required decisions, core contracts, operating-model changes;
  - **Guardrails:** hooks (esp. git-guard), permissions/settings, permission modes, workflow preconditions;
  - **Security:** secrets/credentials, auth, network exposure, history rewrites — plus anything that can control real devices or production systems.
  In addition, the orchestrator MAY escalate by judgment (e.g. unusually large blast radius). De-escalation below the Review-tier model is forbidden (MP-03).
- **Why:** Critic input is small (spec + diff + guardrails, never chat history), so model quality dominates over input cost. On critical reviews, a missed finding is orders of magnitude more expensive than the tier difference.
- **How to check:** the Critic briefing template contains "criticality → model" as a conditional part of the mandatory "dispatch metadata" field (canonical briefing field list: `docs/operating-model.md` §2.3); the telemetry line records the Critic model. ONE Critic agent + invocation parameter `model` (`plugins/pipeline-core/agents/critic.md`) — no fork for the critical case; the orchestrator sets the escalation per dispatch.
- **Addendum (MP-27):** as Goldfish implementation effort (MP-27) drops, the importance of this review gate RISES rather than falls — the trigger criteria and model choice above stay UNCHANGED (criticality still governs architecture/guardrails/security, not Goldfish effort).
- **Codex native-host duty (ADR-0035):** `criticNormal` is an explicit
  runner-specific host duty at `gpt-5.6-sol/xhigh`; it is not derived by
  silently translating the canonical Critic `max` assignment. Existing Claude
  assignments remain unchanged. The duty is a normal review lane and does not
  satisfy T1 isolation without a named, scope-bounded PO waiver.

### MP-22 — Minimum-tier principle: phase-scoped (design vs. execution)

- **Design phase — Design-tier model mandatory** (session effort per MP-01; Design-tier subagent dispatches `max` per MP-07): Everything from Triage through Interview→Spec to the Spec-Readiness-Check (`docs/operating-model.md` §3.2 steps 1–3) — interview/requirements clarification, best-practice and solution-path research, architecture debate, spec/plan authoring, path decisions, spec-readiness evaluation — runs on the Design-tier model. This includes research goldfish dispatched during the design phase: they default to the Design-tier model, with the briefing's model-justification field stating "design-phase quality" (MP-05 field).
- **Execution phase — Implement-/Mechanic-tier default; orchestrator tier per the chosen profile (MP-01):** From Goldfish dispatch through merge (`docs/operating-model.md` §3.2 steps 4–8) — implementation against a finished plan, mechanical edits, bulk/grunt work, status updates, formatting, doc-sync — dispatches to the Implement-/Mechanic-tier model (MP-02/MP-27). The orchestrator itself may keep running the execution phase on the Design-tier model or switch to a cheaper configuration per the chosen profile (MP-01) — the Design-tier model's irreducible core in the execution phase shrinks to the Review-tier escalation cases (MP-07) and readiness-check subagent dispatches, which stay Design-tier regardless of profile; everything else sensibly delegable goes to the Implement-/Mechanic-tier — including workflow `agent()` calls, which MUST set the model explicitly (silent model inheritance is a known cost driver).
- **Bundling:** small interlinked feature bundles are dispatched as ONE bundled briefing — context economy through bundling, never through self-implementation; "small/interlinked" is never grounds for the orchestrator to implement it itself.
- **Why:** design-phase quality spend is legitimate; silent-inheritance waste in the execution phase is not. Splitting the principle by SDLC phase keeps the legitimate spend and cuts the waste. Leaves MP-01 (orchestrator model) and MP-02 (Goldfish default) unchanged.
- **How to check:** design-phase dispatches (Triage/Spec/Readiness) show the Design-tier model in the dispatch metadata field without needing a justification (it's the default for that phase); execution-phase dispatch briefings and workflow `agent()` invocations carry an explicit `model` field defaulting to the Implement-/Mechanic-tier; a Design-tier dispatch in the execution phase requires a stated model justification (MP-05).

### MP-23 — Implement-tier-first / Design-tier-first presumption, scoped by phase

- **Execution phase:** "When in doubt whether a dispatch needs the Design-tier model, it does not — draft on the Implement-/Mechanic-tier, have the orchestrator review; Design-tier authorship only for genuine architecture/guardrail/security single cases with a stated rationale (MP-05) — in practice this is where the Review-tier escalation / readiness-check subagent dispatches (MP-07) sit."
- **Design phase (reversed):** When in doubt whether a design-phase step (interview, research, architecture debate, spec authoring, readiness evaluation) needs the Design-tier model, it does — stay on the Design-tier model (effort per MP-01 standard) rather than downgrading, per MP-22.
- **Why:** a single "when in doubt, cheaper tier" rule would silently erode the design-phase quality guarantee MP-22 sets explicitly; the presumption inverts by phase instead of applying uniformly.
- **How to check:** same as MP-22; Critic review of Spec-Readiness/architecture artifacts flags a design-phase step that ran on a lower tier without an explicit, documented reason.

---

## 2. Ultracode & Dynamic Workflows

Terminology: Ultracode is not an API effort level but a runtime setting — it sends effort `xhigh` and lets the main session plan Dynamic Workflows (scripted multi-agent orchestration). **Distinction: Ultracode ≠ subagents.** Goldfish and Critics are normal subagents and ALWAYS work, entirely independent of whether Ultracode is active; Ultracode concerns only the main session's workflow orchestration (MP-08). "Ultracode off" thus weakens neither dispatches nor reviews.

### MP-08 — Low-friction, per-task opt-in with an indication list

- **Must:** Ultracode/workflows are activated **per task** (keyword `ultracode` in the prompt, or "use a workflow"), low-friction and without ceremony, when the task is on the indication list:
  - **initial research** (e.g. deep-research assignments, cross-check research),
  - **approach/architecture exploration** (exploring alternatives in parallel),
  - **audits** (codebase-wide checks, consistency checks),
  - **migrations** (many uniform changes).
  **Counter-indication:** normal feature implementation and tasks with strong interdependencies — official guidance explicitly names "most coding tasks" as a counter-indication here.
- **Must not:** `/effort ultracode` as a standing state of the Design-tier session. Session-wide Ultracode only for a bounded workflow block with an immediate way back — better: start large workflow runs in their own session or from a Goldfish, so the orchestrator cache doesn't pay for the effort switch twice (an effort switch invalidates the cache, MP-17).
- **Why:** use the tool's strength without token blind-flying; the positive indications are exactly the parallelizable, context-busting task types.
- **How to check:** workflow runs appear as their own telemetry line (role "Workflow"); a live status command shows tokens per agent during the run.

### MP-09 — Calibration run for novel large workflows (recommended, not a mandatory gate)

- **Should:** before a novel large workflow run, do a small-slice calibration run — one directory instead of the whole repo, a narrow question instead of a broad one; observe token consumption; aborting doesn't lose finished partial results (official recommendation).
- **Why:** "A single run can use meaningfully more tokens than working through the same task in conversation." The calibration run is deliberately a recommendation, not a requirement — it's skipped for known, proven workflow types.
- **How to check:** for novel workflows expected to run >30 min, the telemetry line records whether a calibration run happened ("peculiarities").

### MP-10 — HARD precondition for write-capable workflow/runner dispatches

- **Must (hard, blocking):** before every workflow/runner invocation, the provider-neutral P5B runner receives a complete structured coordinator dispatch and executes the P5 preflight before its single injected synthetic-adapter call. `isolated-write` requires all three controls: (1) **hook guardrails installed** — the git-guard union active as a PreToolUse hook; (2) **task-tight allowlist** — only commands needed for that task; (3) **worktree** — a proven isolated worktree. `bounded-write` is allowed only after a visible PO decision and exclusively with complete positive, project-calibrated bounded-control evidence. `read-only` requires enforceable no-write capability. Every missing, ambiguous, or unsupported input rejects before adapter invocation.
- **Why:** workflow subagents ALWAYS run in `acceptEdits` and inherit the session's tool allowlist — permission modes (`plan`, `ask`, project `defaultMode`) do NOT apply there. The only effective protection sits at the hook, allowlist, and isolation level.
- **High-risk-project special rule:** for <PROJECT_B> (real devices, high stakes), write-capable workflows are permitted only with explicit PO approval until the guard migration is complete — in addition to the three preconditions. Whether each project's existing, possibly differing git-guard incarnations suffice as a transitional precondition until a shared union ships is governed by the project-specific calibration — ask the PO if in doubt.
- **How to check:** the structured workflow start request proves mode, side effects, canonical paths, calibrated isolation, active guard, task-tight allowlist, exact verify, and escalation target; capability evidence is evaluable per claimed property. The preflight tests every rejection before adapter invocation. This rule covers only workflow/runner dispatches, not ordinary local or serial writers; those remain worktree-optional.

### MP-11 — Parallelism limit: 3–5 agents by default

- **Must:** workflows and manual subagent fan-outs default to **3–5 parallel agents**. More (technically often far more is possible) only with explicit justification in the workflow prompt AND a prior calibration run (MP-09).
- **Why:** 3–5 matches the common reference pattern (a lead agent spawns 3–5 subagents) and this project's own WIP limit for the serial PO gate. Above that, coordination quality and cost control suffer.
- **How to check:** the agent count is stated in the workflow prompt; a live status command during the run shows the actual count.

### MP-12 — Version proven workflows

- **Must:** save successful workflow runs as a command under the respective repo's `.claude/workflows/`.
- **Why:** reproducible orchestration instead of re-improvising — exactly the pipeline's "versioned operating model" approach.
- **How to check:** repeated workflow types without a versioned command stand out in the periodic telemetry review.

---

## 3. Token-Budget Guardrails

### MP-13 — Measure cost PER TASK, never per MTok

- **Must:** make cost comparisons and decisions exclusively at task level (total tokens/cost per task). **Must not:** compare $/MTok across tokenizer/model generations.
- **Why (the tokenizer trap):** newer model generations often produce noticeably more tokens for the same text than older ones — MTok prices aren't directly comparable across model generations. A "pricier model saves iteration tokens" argument is therefore only verifiable at task level, never from the raw MTok price.
- **How to check:** telemetry (Section 5) records tokens per session/block/task — that's the measurement basis for every periodic price review (MP-21).

### MP-14 — Small-slice calibration before large runs

- **Must:** before every large run (workflow OR a long autonomous single run) measure spend on a small subset (one directory, one narrow question) — official recommendation.
- **Why:** the consumption of large runs is barely predictable up front; calibration provides the extrapolation before the budget is gone.
- **How to check:** the large run's telemetry line references the calibration run ("peculiarities").

### MP-15 — `/goal` only with a stop clause

- **Must:** every `/goal` condition for autonomous runs contains an explicit stop clause (e.g. "… or stop after 20 turns"). `/goal` without an argument shows turns + token spend of the running goal — check regularly on long runs.
- **Why:** without a stop clause there's no structural upper bound on a misdirected autonomous run.
- **How to check:** the stop clause is part of the briefing template for autonomous runs (`docs/operating-model.md`: "stop conditions" are a mandatory briefing part anyway).

### MP-16 — Limits & monitoring

- **Must:** pull a usage/cost status at least at session close (telemetry data source, Section 5); check context fill level before large runs. The official mechanisms of the respective provider serve as upper bounds (e.g. a monthly subscription limit or workspace spend limits under API billing).
- **Must not:** base budget control on undocumented directives — an informally claimed token-budget bonus or an unofficially documented CLI flag for budget increases counts as UNVERIFIED until confirmed on your own provider.
- **Note:** some provider APIs offer a beta budget field only for the programmatic Messages API, not the interactive CLI — only relevant once the pipeline orchestrates headless/SDK-based.
- **How to check:** limit set = documented once in the bootstrap check; usage values appear in every telemetry line.

### MP-24 — Route trivial questions away from the Design-tier session

- **Rule:** "Do not ask the orchestrator about the weather: quick questions from mobile that need no orchestrator context belong in a separate session/chat — every message to the Design-tier session costs Design-tier tokens and context."
- **Why:** Model and effort are session properties (MP-01, MP-17) fixed for the whole session — except the ONE sanctioned profile switch-point (PRD gate, MP-01/MP-17/MP-18) — there is no per-message model downgrade. The fix for per-request model switching is delegation via a separate, cheaper session, not a lighter orchestrator session.
- **How to check:** session topic drift is a bootstrap/close-ritual check item (`docs/operating-model.md` §5); a Design-tier session containing unrelated one-off/status questions is a lifecycle violation flagged at close, not a modeling problem.

### MP-26 — Advisor rules (optional second-opinion pattern)

- **Must:**
  (a) The advisor is used only when `worktypes.<profile>.advisor` is set to a model (not `off`) (or via a dated project exception) — default is `off` (see preset, Section 1).
  (b) Advisor = Design-tier model class as second opinion, injected at judgment gates. If the advisor is chosen as project-wide standard operation (Design-tier orchestrator + advisor continuously active instead of only at specific points), that stays a REAL, deliberately made choice per project — never a silent auto-default.
  (c) every telemetry line records advisor call count/cost share, as far as the provider's usage display exposes that.
  (d) Goldfish/Critic briefings in advisor sessions carry an explicit "Do not consult the advisor" prohibition line where needed, until the project's own measurement data confirms the benefit.
  (d2) the subagent model matrix stays UNTOUCHED: Goldfish/Critic always run on the tier model explicitly named in the dispatch (MP-02/MP-07) — advisor inheritance concerns only the availability of the advisor TOOL within a subagent, never its own model.
  (d3) advisor hygiene NEVER presents a blind global advisor-off (that can silently kill parallel advisor sessions of other projects on the same machine). Order: (1) ask about parallel advisor sessions of other projects on this machine; (2) prefer a project-local off switch if the runtime offers one; (3) use a global advisor-off switch ONLY if no parallel session is affected; (4) if the ACTUAL advisor state diverges from the chosen profile's intended state, that's a mandatory question to the PO, never a silent correction.
  (d4) after every context-compaction step (`/compact` or similar) in an advisor-active session, advisor availability MUST be actively checked and logged in the session record — compaction × advisor interaction is a known blind spot this check closes.
  (e) the orchestrator SHOULD actively request advisor consultation at judgment gates (dispositions, readiness triage, incident decisions) instead of relying solely on model-driven timing.
  (f) advisor effort is not separately configurable (it runs at the fixed Design-tier effort).
  (g) **Advisor-outage workaround (hardened):** if an advisor call in an advisor-active session reports an error/`unavailable`, this order applies:
  1. IMMEDIATE notification to the PO on the FIRST failure — never silently continue without the advisor.
  2. **MANDATORY PRIMARY PATH, not an optional suggestion:** the orchestrator IMMEDIATELY dispatches a read-only advisor-consult subagent as a substitute (Design-tier model class, dispatch metadata `role=consult-advisor` — the bound fallback agent in this plugin is named `consult-advisor`, `plugins/pipeline-core/agents/consult-advisor.md`), EXACTLY one question per consult, no repo writes; the answer feeds the orchestrator's own judgment, never applied automatically.
  3. In addition, NOT as an alternative, the orchestrator offers the PO a switch-block to an alternative advisor model as an OPTIONAL offer — the decision stays with the PO, never a unilateral orchestrator move.
  **Explicit ban:** (i) silently omitting advisor consultation and (ii) a unilateral switch of the MAIN model in reaction to the advisor outage are NOT acceptable substitutes for step 2 — both were actually observed and are exactly the gap this hardening closes.
- **Why:** advisor cost scales with context length (uncached full-conversation reads); without these guardrails the advisor pattern would undercut the cost discipline the tier matrix is meant to establish. The hygiene order (d3) prevents a blind global advisor-off from damaging neighboring sessions.
- **How to check:** dispatch metadata and briefings show the prohibition line in advisor sessions where applicable; the telemetry line records advisor calls ("peculiarities"); the advisor-configuration bootstrap step checks the hygiene order including the mandatory question on divergence; session notes carry the post-compaction advisor check (d4); an advisor outage triggers the (g) notification within the same turn AND the consult-advisor dispatch within the same or the next turn — silently continuing without the advisor, or a unilateral model switch instead of the dispatch, is a bootstrap/process defect, not a judgment call.

---

## 4. Cache Discipline

### MP-17 — Fix model + effort at session start

- **Must:** model and effort are set at session start (design phase: Design-tier model + standard effort, MP-01) and stay stable until the next phase/profile boundary. **Sanctioned single exception:** in the gate-switch profile (MP-01), exactly ONE switch to the cheaper execution-phase configuration, right at the PRD-approval gate. Switching back to the pricier Design-tier model mid-session stays FORBIDDEN. Any other switch — if unavoidable — only at task boundaries.
- **Why:** a model or effort switch invalidates the entire prompt cache; on long sessions that means a full, expensive reprocessing of the history. Also invalidators (provider-dependent, verify before session start): fast-mode switches, MCP connect/disconnect (non-deferred), a deny rule on bare tool names, context compaction, a runtime upgrade mid-session.
- **How to check:** mandatory bootstrap step (`harness/session-bootstrap.md`); cache health is measurable via the ratio of cache-read to cache-creation tokens (high read-to-write ratio = healthy; persistently high creation = look for an invalidator).

### MP-18 — Cut to a subagent instead of switching models

- **Must:** if a task needs a different model or heavy token throughput, cut it to a subagent (Goldfish/Critic) — never switch via a model-switch command in the running Design-tier session.
- **Must not:** a built-in "plan on the big model, exec on the small model" auto-toggle alias is not used in the pipeline.
- **Sanctioned exception:** the ONE gate switch at the PRD-approval gate (MP-01) is exempt from this ban — it's a planned event documented in the dispatch ledger, not a model switch "in the running session" in the sense of this rule. Switching back stays forbidden without exception.
- **Why:** subagents have their own short-lived cache; the parent cache stays intact — a model switch in the session, by contrast, destroys it completely. That's why a continuously pricier Design-tier model is compatible with cache economics: the orchestrator context gets reused as a cheap cache read, the token-heavy work runs in cheap, fresh Goldfish contexts. An auto-toggle alias switches the model at every plan↔exec transition and pays for the cache anew each time.
- **How to check:** a model switch in telemetry is an anomaly candidate ONLY if it's NOT the documented PRD-gate switch event — that one is tracked as an EXPECTED event with a ledger entry + identity verification, not an anomaly. Every other model switch remains an anomaly candidate. The status display/usage command shows the cache ratio.

### MP-19 — Context hygiene: clear/compact/rewind rules

- **Must:**
  1. **Topic change → new/renamed session** (rename beforehand for findability). "Stale context wastes tokens on every subsequent message."
  2. **Compaction only at natural task boundaries**, always with a focus argument — never let auto-compaction happen mid-task. **Checkpoint rule:** at every task boundary (package/wave boundary, PRD gate, before the first dispatch of a new package) with a high context fill level, a focused compaction is a MANDATORY checkpoint, not an emergency valve; well beyond that counts as an overdue cut. **Cache-economics note:** compaction rebuilds the warm cache from scratch (full reprocessing cost) — so set it only at boundaries where the rebuild pays off, consistent with MP-17 and without contradicting the ONE sanctioned gate switch there (the compact checkpoint is a cache-rebuild decision, not an additional model-switch exception).
  3. **Rewind to a cached prefix instead of compaction** when a solution path is completely discarded — that's cheaper than recompacting.
  4. CLAUDE.md/memory edits are cache-safe but only take effect after the next clear/compact/restart — don't be surprised, don't double-patch.
  5. an automatic model fallback (e.g. a safety-classifier downgrade) = cache loss → note in telemetry "peculiarities" if observed.
- **Worktree note:** the cache applies per machine + working directory — every worktree has its own cache. Factor this in as a cost driver during parallel Goldfish planning.
- **Why:** context hygiene is the second-biggest cost lever after model choice; these rules are official rules of thumb, not a pipeline invention.
- **How to check:** the operating model's session-lifecycle policy (`docs/operating-model.md`) makes these rules mandatory knowledge for every Design-tier session; violations become visible via the cache ratio (MP-17); a compaction block at a task boundary with a high fill level is visible in the dispatch ledger/handover.

---

## 5. Cost Telemetry

### MP-20 — Instrument: `telemetry/costs.md` per project, written at session close

- **Must:** every pipeline project (including this meta-repo itself, insofar as it applies the pipeline to itself) maintains a versioned **`telemetry/costs.md`** file. At session close (the `/close` ritual), **one line** is appended per session or per completed block:

  | Date | Session/Block | Role | Model/Effort | Task (short) | Tokens | First pass (y/n) | Intervention needed (y/n) | Peculiarities |
  |---|---|---|---|---|---|---|---|---|
  | YYYY-MM-DD | S4/B2 | Elephant | Design tier / high | Phase-2 policy dispatch | 1.1M in (cache-R 90%) / 60k out | — | — | — |
  | YYYY-MM-DD | S4/B2-G1 | Goldfish | Implement tier / medium | model-policy authored | 250k in / 30k out | y | n | — |

  Conventions: role ∈ {Elephant, Goldfish, Critic, Workflow}; "tokens" = input/output plus cache-read share, as reported by the provider's usage display (use subagent/skill attribution where available); "peculiarities" = escalations (MP-05/MP-07), model fallback, cache anomalies, calibration runs, workflow agent count.
- **Maturity-metric collection (benefit/self-measurement, `docs/operating-model.md` §7):** the columns **"first pass (y/n)"** (submission passed the gate without a rework cycle) and **"intervention needed (y/n)"** (manual interventions/course corrections during the run) are maintained **per Goldfish dispatch**; Elephant/Critic lines carry "—".
- **Headless convention:** headless/bare runs (`policies/tooling-policy.md`) additionally record a machine-readable total-cost value delivered by the runtime in the tokens column (marked as a $ value), as far as the runtime provides it.
- **Subagent-token convention:** dispatch lines carry subagent tokens in the tokens column, annotated "(subagent)"; for dispatches continued across resume/multiple turns, the reported value is CUMULATIVE and must be marked "(cumulative)" — never sum across multiple lines twice.
- **Budget-escalation criterion (reference target from `docs/operating-model.md` §4.3, stage 4):** budget overrun exists when the monthly limit is reached OR the extrapolation of a calibration run (MP-09/MP-14) clearly exceeds expectations → stop + escalate to the PO.
- **Transition rule:** as long as no automation writes the line, it's maintained manually at session close. Once a close-skill/ledger script (e.g. `harness/scripts/usage-ledger.mjs`) is available, it takes over the token half automatically; the $ column then stays a marked ESTIMATED aid computed from a local price table (e.g. `harness/scripts/model-prices.json`) — the MP-13 caveat "cost per task, never per MTok" stays unchanged, the estimate is a computational aid, not an MTok comparison. A real receipt arriving later is worked into the existing line as a dated addendum (the real number overwrites the estimate, the estimate stays visible as the calibration date — the MP-21 review uses this drift data). The local price table is coupled to the MP-21 price review: every review updates BOTH Section 6 of this policy and the price-table file.
- **Periodic review:** the first Design-tier session of a cycle (e.g. start of month) reviews the prior period's lines and appends 3–5 lines of findings under `## Review YYYY-MM` to the file (anomalies, escalation rate, cache health, a rough $ estimate via the local price table — mark it as an estimate, respect MP-13). Mandatory part of the review: evaluate **first-pass rate and rework effort** across the Goldfish lines.
- **Why:** "cost telemetry from day 1" stays a soft TODO without an instrument; a price review needs real task-cost data, not MTok invoices.
- **How to check:** the file exists and grows (git log); a close automation (if present) enforces the step; a drift check of the close ritual catches forgotten lines.

---

## 6. Cost Benchmarks & Price Review

This policy deliberately carries NO hardwired $/MTok table — model prices change more often than this policy and differ by provider/tier. Instead:

- **Higher capability classes usually cost more per token** — effort is the most effective cost lever within a tier (don't turn down the tier choice itself, MP-06); always make cost decisions at task level, never from the raw $/MTok value (MP-13).
- **Check the current price page of your own provider before every cost decision** — this policy deliberately names no snapshot numbers that would go stale. Concrete numbers valid for your setup belong in your local price table (e.g. `harness/scripts/model-prices.json`, if present) or your own calculation note — not in this file.
- **Model/provider operational note (generic caution):** some models bill thinking tokens covertly as expensive output, or have different cache break-even points, context-window surcharges, batch discounts, or different tokenizer efficiency compared to older generations — verify the ACTUAL behavior of the configured model before a cost assumption, don't assume another model's behavior applies.
- **Mind the billing model:** some providers run individual models outside the plan quota (overage/credits), others stay in-quota — that affects which tier suits sustained operation (relevant for the profile choice in MP-01) and must be checked on your own account, not assumed.

### MP-21 — Periodic price review + adjustment reservation

- **Must:** a price review happens periodically (e.g. quarterly, or triggered by a provider price change or an introductory-rate expiry) — record the date and trigger in the project's own decision log. Input: telemetry data from MP-20 (task cost per role), escalation rates, cache ratio. Subject: the entire preset in Section 1, the Goldfish effort default, the escalation criteria.
- **Adjustment reservation:** the preset applies provisionally — adjustment is expressly reserved if a tier proves too expensive for the quality achieved. Interim findings from the periodic review (MP-20) can bring the review forward.
- **How to check:** the review date is anchored in the project's own decision log; the first review after it falls due MUST document the review finding.

**Formalization:** Tier- and workflow-spanning elements of this policy are formalized as ADRs in `docs/adr/` as needed — including workflow preconditions for acceptEdits and the high-risk-project special rule. Precedence unchanged: project's own decision register (if present) > ADR > this policy formulation.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# Modell-Policy — Rollen, Effort, Workflows, Budget, Telemetrie

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · Stand 2026-07-03

Diese Policy operationalisiert die Rollen-Modell-Matrix, die Ultracode-/Workflow-Regeln, die Cache-Disziplin sowie die Vorgaben zu acceptEdits-Vorbedingungen und Kosten-Telemetrie aus dem eigenen Entscheidungsregister (falls vorhanden). Bei Widerspruch gewinnt das eigene Entscheidungsregister. Diese Policy ist bewusst **modellagnostisch** formuliert: Regeln sprechen von Rollen-Tiers (Design/Implement/Mechanic/Deep/Review/Advisor) — die Dispatch-Tiers Implement/Mechanic/Deep/Review liegen in `pipeline.user.yaml` → `models.*`, die Tiers Design (Orchestrator) und Advisor werden je Session-Profil über `worktypes.*` geroutet — nicht von Produktnamen; konkrete Modellnamen erscheinen ausschließlich als mitgelieferter Default-Preset (Abschnitt 1).

Schwester-Dokumente dieser Phase: `docs/operating-model.md` (Rollen, Rituale, Session-Lifecycle), `policies/tooling-policy.md` (Versionsanforderungen, Tooling-Radar), `harness/session-bootstrap.md` (Session-Start-Protokoll), `docs/adr/` (Formalisierung als ADRs).

Alle Regeln tragen IDs (**MP-xx**) und folgen dem Muster **Gebot/Verbot → Warum → Prüfweise**.

---

## 1. Rollen-Tier-Effort-Matrix

### Mitgelieferter Default (Preset, `pipeline.user.yaml` → `worktypes.*` + `models.*`)

Die Pipeline unterscheidet zwei Config-Ebenen: **Orchestrator-/Advisor-Routing je Session-Profil** (`worktypes.<profile>.{design_phase,execution_phase,advisor}`, je ein Eintrag für die drei Session-Profile `design`/`feature`/`mini` — Profilnamen Design-first/Advisor/Speed s. MP-28/`harness/session-bootstrap.md` §6.5) und **vier Dispatch-Tiers** (`models.*`: Implement/Mechanic/Deep/Review). `setup.mjs` schreibt beim Setup ein Preset passend zur Abo-Stufe des PO; das **Max-Preset** unten ist der empfohlene Startpunkt und der committete Default-Zustand dieses Repos:

| Tier (Config-Key)  | Rolle                              | Default-Modell (Max-Preset) | Default-Effort |
|---------------------|-------------------------------------|------------------------------|-----------------|
| `worktypes.<profile>.{design_phase,execution_phase}` | Elephant (Orchestrator), geroutet je Session-Profil & Phase | opus (Profil `design`, beide Phasen) / opus→sonnet (Profil `feature`: opus Design-Phase, sonnet Ausführungsphase, revidiert 2026-07-10) / sonnet (Profil `mini`, beide Phasen) | high — vollständige Profil-/Phasen-Matrix s. `pipeline.user.yaml` → `worktypes` (revidiert 2026-07-10, vormals high–max) |
| `models.implement`  | Goldfish (Implementor)             | sonnet                       | medium          |
| `models.mechanic`   | Goldfish (Mechanic)                | sonnet                       | low             |
| `models.deep`       | Goldfish (Deep, MP-27)             | sonnet                       | xhigh           |
| `models.review`     | Critic                             | sonnet                       | max             |
| `worktypes.<profile>.advisor` | optionaler Second-Opinion-Advisor, je Session-Profil | `off` (Profil `design`) / opus (Profile `feature`/`mini`, feste Paarung — `feature`-Advisor 2026-07-10 von `off` auf `opus` geändert) | — |

Alle Werte sind in `pipeline.user.yaml` überschreibbar — das Preset „Pro" fährt z. B. alle Rollen auf dem günstigeren Modell mit gestaffeltem Effort (siehe Kommentar in `pipeline.user.yaml`). Diese Policy besitzt die semantischen Grenzen; die einzige maschinenlesbare Autorität für veränderliche ausgelieferte Default-Zuweisungen ist `plugins/pipeline-core/config/routing-authority.json`, aufgelöst durch Runner-Mappings und in Full Verify geprüft. Ab hier spricht diese Policy nur noch von **Tiers**, nicht von Produktnamen. **`goldfish-deep` ist ein eigener Config-Tier, `models.deep`** (MP-27, neu neben Implement/Mechanic/Review): Er läuft auf dem konfigurierten Deep-Tier-Modell bei Effort `xhigh` — das volle Denkbudget für Test-Suite-/Guardrail-Klasse-Arbeit (bei echtem Design-Spielraum stattdessen auf dem Design-Tier-Orchestrator-Modell, nicht als Implementierung-mit-vollem-Budget).

### MP-01 — Design-Tier: fixiertes Modell/Effort je Session, Wechsel nur an einer benannten Gate-Stelle

- **Gebot:** Das Design-Tier-Modell (Elephant/Orchestrator) läuft während der Design-Phase (Triage → Interview/Spec → Readiness, MP-22) durchgehend auf dem konfigurierten Design-Tier-Modell bei Standard-Effort `high`–`xhigh`. Modell UND Effort werden zu Sessionbeginn gesetzt und bleiben bis zur nächsten Phasen-/Profilgrenze stabil (MP-17) — kein stiller Wechsel mitten in der Session.
- **Ausführungsphase — konfigurierbares Profil:** Ab dem Goldfish-Dispatch (Ausführungsphase) erlaubt die Pipeline zwei Betriebsweisen, je Projekt/Session bewusst gewählt:
  1. **Durchgehend:** das Design-Tier-Modell bleibt auch für die Ausführungsphasen-Orchestrierung aktiv (höhere Fähigkeit, höhere Kosten über die ganze Session).
  2. **Gate-Wechsel (sanktionierte EINE Ausnahme):** die Orchestrierung wechselt GENAU EINMAL, exakt am PRD-Freigabe-Gate, auf eine günstigere/schnellere Konfiguration für die Ausführungsphase — typischerweise begründet durch das Abrechnungsmodell des gewählten Providers (Kosten-pro-Aufgabe-Kalkül, MP-13). Ein Rück-Wechsel zurück auf das teurere Design-Tier-Modell MITTEN in der Ausführungsphase bleibt ohne Ausnahme verboten (Cache-Invalidierung, MP-17/MP-18).
  Die Wahl der Betriebsweise ist eine bewusste, dokumentierte Entscheidung (nie impliziter Default) — token-intensive Arbeit wird ohnehin an Goldfische delegiert statt das Orchestrator-Modell zu wechseln (MP-18).
- **Gebot (Effort):** Standard-Effort für das Design-Tier ist `high`–`xhigh` (offizielle Guidance vieler Anbieter: `xhigh`/vergleichbare hohe Stufen gelten als Sweet Spot für die meisten agentischen Coding-Aufgaben; die jeweils höchste Stufe zeigt „diminishing returns" und ist sparsam für die härtesten Einzelfälle zu reservieren). Die höchste Stufe ist eine benannte Session-Ausnahme, keine Dauereinstellung — der Effort-Wechsel selbst invalidiert den Cache (MP-17), Wechsel-Empfehlungen also nur an Session-/Blockgrenzen aussprechen. Die Entscheidung trifft immer der PO (User-Kommando), nie stiller Weiterlauf im falschen Modus.
- **Modell-Identitäts-Härtung:** Die aktive Modell-Identität wird aus BEOBACHTETER Evidenz bestätigt (z. B. eine Modell-Statusausgabe der Runtime oder eine explizite PO-Bestätigung), nie angenommen — insbesondere unmittelbar nach Limit-/Fallback-Ereignissen.
- **Warum:** Ein teureres, fähigeres Orchestrator-Modell verbraucht in Summe oft WENIGER Tokens, weil es bei der Lösungsfindung effektiver ist und Iterationsschleifen spart — auch bei höherem Preis pro Token (Kosten pro Aufgabe zählen, nicht $/MTok, MP-13).
- **Betriebsnotiz (generische Vorsicht, providerabhängig):** Manche Modelle rechnen Thinking-Tokens verdeckt als teuren Output ab, oder fallen bei bestimmten Trigger-Bedingungen (z. B. einem Safety-Classifier) automatisch auf ein anderes Modell zurück — das invalidiert den Cache und gehört, falls beobachtet, in die Telemetrie-Spalte „Besonderheiten" (MP-19). Das eigene Provider-Verhalten vor Sessionbeginn verifizieren, nicht annehmen.
- **Prüfweise:** Session-Bootstrap (`harness/session-bootstrap.md`) setzt und verifiziert Modell+Effort als Pflichtschritt — Effort ist session-only und muss bei jedem Start neu gesetzt werden; die höchste Effort-Stufe gilt nur als korrekt konfiguriert, wenn die Session-Ausnahme benannt ist. Telemetrie-Zeile weist Modell/Effort aus; ausgesprochene bzw. unterlassene Wechsel-Hinweise bei erkannten Großblöcken sind Critic-/Retro-prüfbar.

### MP-02 — Goldfish: Modell-Untergrenze = Mechanic-Tier-Modell, Effort siehe MP-27

- **Gebot:** Goldfische laufen NIE unterhalb des konfigurierten Mechanic-Tier-Modells (Modell-Untergrenze, hart — kein Downgrade auf eine kleinere/billigere Modellklasse, auch nicht für triviale Tasks). Die Effort-Zuteilung selbst folgt der 3-Stufen-Matrix in MP-27, nicht mehr einem einzelnen Pauschal-Effort.
- **Umsetzung:** Subagent-Frontmatter setzt Modell + Effort explizit je Subagent (Plugin-Ebene) — nie implizite Vererbung vom Hauptmodell (verwandte Falle: MP-04, globale Modell-Override-Env-Var).
- **Prüfweise:** Frontmatter der versionierten Plugin-Agents zeigt die Modell-Untergrenze; Telemetrie-Zeile je Goldfish-Block.

### MP-27 — Goldfish 3-Stufen-Effort-Matrix

- **Gebot:** Goldfish-Dispatches laufen auf einem von drei eigenen Subagenten, je mit fest zugeordnetem Effort (Frontmatter, nicht Prosa):
  - **`goldfish-mechanic`** — Effort **`low`**: mechanische, gleichförmige, reine Plan-Ausführung ohne In-Task-Designentscheidungen, voll spezifiziertes Briefing.
  - **`goldfish-implementor`** — Effort **`medium`** — Standard für klar gebriefte Implementierungsaufgaben.
  - **`goldfish-deep`** — Effort **`xhigh`**: Test-Suite-/Verify-Autorenschaft, Guardrail-/Hook-/Kanon-Code, Aufgaben mit echtem In-Task-Design-Spielraum, Klasse-hoch-Arbeit.
  Planung/Design und Analyse-Synthese bleiben unverändert auf Design-Tier-Ebene mit `xhigh`+ (MP-01/MP-22/MP-23 unangetastet).
- **Vorautorisierter Rück-Revisions-Pfad:** Steigt die Fehlerquote messbar (Erstpass-Quote-Messreihe), ist eine datierte Rück-Revision von `medium` auf `xhigh` für den Implementor-Tier vorab freigegeben — braucht nur einen datierten Eintrag im eigenen Projekt-Entscheidungsprotokoll + Telemetrie-Beleg, kein neues Gate.
- **Cross-Note (Critic-Matrix, MP-07 unangetastet):** Mit sinkendem Goldfish-Implementierungs-Effort STEIGT die Bedeutung des Review-Gates, statt sich zu verringern — die Trigger-Kriterien und Modellwahl in MP-07 bleiben dabei unverändert.
- **Warum:** Klar gebriefte, plan-treue Ausführung braucht nicht dasselbe Denkbudget wie Guardrail-/Design-Arbeit; die Matrix spiegelt das 1:1 auf drei benannte, versionierte Subagenten statt auf ein Effort-Feld im Dispatch-Prompt.
- **Prüfweise:** `grep` über die drei Agent-Frontmatter (`plugins/pipeline-core/agents/goldfish-mechanic.md`, `-implementor.md`, `-deep.md`) zeigt die drei Effort-Werte exakt; Dispatch-Metadaten benennen den gewählten Subagenten; Erstpass-Quote fließt in die nächste periodische Sichtung (Abschnitt 5) ein.

### MP-28 — `speed`-Profil: Implement-Tier-Modell bei Effort `high` + Design-Tier-Advisor ab Sessionstart (NEU; Effort revidiert 2026-07-10, vormals `max`)

*(English in the source — agent-facing profile/dispatch rule, same convention as MP-22/23/24.)*

- **Gebot (model pairing, Effort revidiert 2026-07-10 — vormals `max`; Begründung: high reicht und ist schneller):** A third session-start profile, defined ALONGSIDE the existing `design-first` and `advisor` profiles (MP-01, MP-26): **`speed`** — the mini-feature/hotfix profile. Model pairing: the **Implement-Tier model at effort `high`** runs as the session's MAIN model — an inversion of the usual pattern where the Design-Tier model orchestrates the session — paired with the **Design-Tier model active as advisor from session start** (MP-26(b) already defines the advisor as Design-Tier model class; `speed` is the profile that keeps that advisor engaged from the very first turn, on top of a cheaper main model). Any tier below the Mechanic tier once floated for this profile stays FUTURE ONLY and requires a dedicated measurement run first — do NOT enable it here; this does not create a fourth exception to MP-03's below-Mechanic-tier ban.
- **Scope (hard limits):** `speed` is bounded to ≤5 files touched, no new dependencies, and NO files from any of the following classes — **the canonical speed-scope forbidden-file-class list** (`harness/session-bootstrap.md` §6.5 and the `pipeline-start` skill point here rather than re-enumerating): `guardrails/*`, `roles/*`, `policies/*`, `docs/operating-model.md`, hook files under `plugins/pipeline-core/hooks/*`, `.claude/settings.json`, guard-config (`.claude/guard-config.json`). Breaching any of these three limits mid-task is a MANDATORY escalation to the full profile (`design-first` or `advisor`) — not a judgment call the session talks itself out of. Guard hooks stay active UNCONDITIONALLY under `speed` — the profile trims ceremony, never the deterministic guard layer (`policies/tooling-policy.md` G1/W3).
- **Bootstrap (cross-ref):** the lightweight bootstrap ritual for `speed` — ruleset version, calibration file, verify availability, the operative handover head, ONE confirmation line instead of three, no profile ceremony — is defined in `harness/session-bootstrap.md` §6.5; this policy governs model/effort and scope only, that section governs the ritual.
- **Process:** no PRD document required; direct dispatch (or a mini-edit path for the smallest fixes); a light review stage replaces the full Design-Tier review; a short close replaces the full close ceremony. This is a proportionality trade for genuinely small, bounded work — it does NOT exempt a `speed`-profile task from the MP-07 criticality triggers (architecture/guardrails/security still force Design-Tier/`max` review regardless of profile).
- **Why:** Mini-features and hotfixes were paying the same session-ceremony cost as full-feature work. A proportionate profile for genuinely small, bounded diffs closes that gap without touching the below-Mechanic-tier ban (MP-03) or the guard layer (G1). The PO confirmed the model pairing verbatim: "speed profile = Implement-Tier/`max` + Design-Tier advisor." **Effort revidiert 2026-07-10:** das wörtliche Zitat ist das historische Protokoll jener Entscheidung; der wirksame Ausführungs-Effort ist jetzt `high` in allen drei Profilen (`design`, `feature`, `mini`) — das Modell-Pairing selbst (Implement-Tier-Hauptmodell + Design-Tier-Advisor) bleibt von dieser Revision unangetastet.
- **Prüfweise:** Bootstrap Schritt 1b (profile selection) offers `speed` as a third option; dispatch metadata for a `speed`-profile session names the profile explicitly; a session that exceeds ≤5 files, touches a guardrail/canon file, or adds a dependency without a logged escalation to the full profile is a bootstrap/process defect, flagged at close.

### MP-03 — VERBOT: Modelle unterhalb des Mechanic-Tiers für Implementierung/Judgment/Review

- **Verbot (hart):** Kein Modell unterhalb der Mechanic-Tier-Klasse für Implementierungs-, Judgment- oder Review-Arbeit in der Pipeline — nicht als Goldfish, nicht als Critic, nicht als Workflow-Stage, die Artefakte erzeugt oder bewertet. Die drei Ausnahmen unten sind abschließend.
- **Warum:** (a) Qualitätsrisiko erzeugt Iterationsschleifen, die die nominale Ersparnis auffressen — der Kostenhebel der Pipeline ist Modell-Preis + Cache-Disziplin + kleine Goldfish-Kontexte, nicht ein schwächeres Modell. (b) Die kleinste Modellklasse hat typischerweise keinen Effort-Parameter, kein Adaptive Thinking und einen kleineren Kontext — für Diffs/Implementierungen mit Substanz ungeeignet.
- **Ausnahme (a) — eingebaute Runtime-Mechanismen:** Ausgenommen sind eingebaute Mechanismen der Agenten-Runtime, die intern eine kleinere Modellklasse nutzen (z. B. ein `/goal`-Evaluator) — das ist keine Rollenbesetzung.
- **Ausnahme (b) — harness-interner Read-only-Summarizer:** WebFetch-/WebSearch-Zusammenfassung darf intern auf der kleinsten Modellklasse laufen — sanktioniert-aber-notiert, solange die Ausgabe reine Fetch-Zusammenfassung bleibt (kein Judgment, keine Artefakt-Erzeugung). Telemetrie darf das Modell ausweisen, ohne dass das als Verstoß zählt.
- **Ausnahme (c) — Research-Fetcher-Klasse:** eng begrenzte, read-only Websuche/Fetch/Extraktions-Dispatches ohne Judgment/Synthese/Artefakt-Erzeugung dürfen explizit als Research-Fetcher auf der kleinsten Modellklasse laufen — Voraussetzungen und Messbasis: siehe MP-25.
- **Prüfweise:** `grep` über die versionierten Agent-/Skill-Frontmatter des Plugins: kein Modell unterhalb der Mechanic-Tier-Klasse außerhalb der drei benannten Ausnahmen. Zusätzlich MP-04 (Env-Var-Verbot). Critic-Review von Guardrail-Änderungen prüft dies mit.

### MP-25 — Research-Fetcher-Klasse: read-only Dispatches auf der kleinsten Modellklasse

- **Gebot:** Read-only Websuche-/Fetch-/Extraktions-Dispatches — keine Repo-Schreibzugriffe, keine Artefakte, kein Judgment — DÜRFEN auf der kleinsten verfügbaren Modellklasse laufen. Erfordert explizite Dispatch-Metadaten: `role=research-fetcher`. Synthese oder Bewertung des abgerufenen Materials bleibt mindestens Mechanic-Tier (nie darunter) — die Research-Fetcher-Klasse deckt AUSSCHLIESSLICH den reinen Fetch-/Extraktions-Schritt ab; MP-03s Verbot bleibt ansonsten unverändert.
- **Warum:** Ein reiner Fetch-/Extraktions-Schritt braucht kein Judgment-Budget; die Klasse ist bewusst eng gefasst — sie lockert MP-02/MP-03 für nichts über den reinen Fetch-Schritt hinaus. Messbasis: In eigenen Vergleichsmessungen lieferte ein Research-Fetcher-Dispatch brauchbare Ergebnisse in einem Bruchteil der Zeit und Tokens eines vergleichbaren Mechanic-/Implement-Tier-Dispatches derselben Aufgabenklasse — eigene Zahlen im Projekt-Telemetrie-Log führen, nicht diese Policy als Zahlenquelle nutzen.
- **Prüfweise:** Dispatch-Metadaten benennen `role=research-fetcher` explizit; jeder Dispatch, der aus dem abgerufenen Material synthetisiert, bewertet oder ein committetes Artefakt erzeugt, ist KEIN Research-Fetcher-Dispatch und muss mindestens Mechanic-Tier laufen (MP-02/MP-03).

### MP-04 — VERBOT: globale Modell-Override-Env-Var setzen

- **Verbot:** Eine Environment-Variable, die das Frontmatter ALLER Subagents überschreibt, wird nicht global gesetzt (in Claude Code: `CLAUDE_CODE_SUBAGENT_MODEL`).
- **Warum:** Ein globaler Override auf eine kleinere oder größere Modellklasse würde die differenzierte Tier-Matrix (Goldfish ≠ Critic ≠ kritischer Critic) still aushebeln.
- **Prüfweise:** Session-Bootstrap prüft, dass die Var nicht gesetzt ist (`harness/session-bootstrap.md`).

### MP-05 — Eskalation Goldfish → höheres Tier

- **Gebot:** Der Design-Tier-Orchestrator entscheidet die Eskalation BEIM DISPATCH und protokolliert sie im Briefing als „Modell-Begründung" im Pflichtfeld „Dispatch-Metadaten" (kanonische Briefing-Feldliste: `docs/operating-model.md` §2.3). Eskalationskriterien (eines genügt):
  1. Aufgabe überspannt mehrere Subsysteme oder sehr viele Dateien (Richtwert: > 15 Dateien oder erwartetes Diff > 800 Zeilen — Startwerte, per Telemetrie zu kalibrieren);
  2. Lösungsweg bleibt trotz Spec ambig (mehrere plausible Umsetzungen, Briefing kann nicht alle Entscheidungen vorwegnehmen);
  3. dieselbe Task-Klasse ist zuvor auf dem Implement-Tier-Modell trotz nachgebessertem Briefing gescheitert (Zwei-Fehlversuche-Regel durchlaufen, Eskalation an den Orchestrator hat kein besseres Briefing ergeben → nächster Hebel ist das Modell);
  4. lange autonome Läufe mit sehr großem Token-Budget, wo ein höheres Tier lange Kontextfenster bei niedrigeren Kosten pro Token unterstützt.
  Eskaliertes Ziel-Tier ist typischerweise das Design-Tier-Modell (mehr Fähigkeit für „sehr Umfangreiches").
- **Warum:** Ohne benannte Kriterien würde die Eskalation ad hoc und unauditierbar.
- **Prüfweise:** Briefing-Feld vorhanden; Telemetrie-Zeile zeigt das eskalierte Modell + Aufgabenkürzel; periodische Sichtung vergleicht Eskalationsquote und -erfolg.

### MP-06 — Deeskalation innerhalb der Matrix

- **Gebot:** Deeskalation heißt ausschließlich niedrigerer Effort (nie ein niedrigeres Tier/Modell). Für mechanische/gleichförmige Goldfish-Tasks (klarer Plan, kleine Diffs, keine Designentscheidungen) ist der `goldfish-mechanic`-Subagent (Effort `low`, MP-27) das Deeskalationsziel. Modell-Untergrenzen (Goldfish/Critic: Mechanic-Tier-Modell; Design-Tier: das konfigurierte Design-Tier-Modell) werden nie unterschritten.
- **Warum:** Effort steuert die Gesamttoken-Bereitschaft — das ist der legitime Sparhebel; ein Wechsel auf eine niedrigere Modellklasse verletzt die Tier-Matrix. Achtung: Die Effort-Skala ist PRO MODELL kalibriert — „high" auf einem kleineren Modell ≠ „high" auf einem größeren; Effort-Level nicht modellübergreifend vergleichen.
- **Prüfweise:** Telemetrie; Frontmatter-Defaults im Plugin.

### MP-07 — Critic-Staffelung: Review-Tier Standard, Eskalation bei Kritikalität

- **Gebot:** Critic-Reviews laufen standardmäßig auf dem Review-Tier-Modell / Effort `max`. **Eskalation auf ein höheres Tier (Design-Tier-Modell) ist PFLICHT**, wenn der Prüfgegenstand eines der folgenden berührt:
  - **Architektur:** ADR-pflichtige Entscheidungen, Kernverträge, Operating-Model-Änderungen;
  - **Guardrails:** Hooks (insb. git-guard), Permissions/Settings, Permission-Modi, Workflow-Vorbedingungen;
  - **Security:** Secrets/Credentials, Auth, Netz-Exposition, History-Rewrites — sowie alles, was reale Geräte oder Produktivsysteme steuern kann.
  Zusätzlich DARF der Orchestrator nach Judgment eskalieren (z. B. ungewöhnlich großer Blast-Radius). Deeskalation unter das Review-Tier-Modell ist verboten (MP-03).
- **Warum:** Der Critic-Input ist klein (Spec + Diff + Guardrails, nie Chat-Verlauf), daher dominiert Modellqualität über Inputkosten. Bei kritischen Reviews ist ein übersehener Befund um Größenordnungen teurer als die Tier-Differenz.
- **Prüfweise:** Critic-Briefing-Template enthält „Kritikalität → Modell" als bedingten Teil des Pflichtfelds „Dispatch-Metadaten" (kanonische Briefing-Feldliste: `docs/operating-model.md` §2.3); Telemetrie-Zeile weist das Critic-Modell aus. EIN Critic-Agent + Invocation-Parameter `model` (`plugins/pipeline-core/agents/critic.md`) — kein Fork für den kritischen Fall; die Eskalation setzt der Orchestrator pro Dispatch.
- **Ergänzung (MP-27):** Mit sinkendem Goldfish-Implementierungs-Effort (MP-27) STEIGT die Bedeutung dieses Review-Gates, statt sich zu verringern — die Trigger-Kriterien und Modellwahl oben bleiben dabei UNVERÄNDERT (Kritikalität entscheidet weiterhin über Architektur/Guardrails/Security, nicht der Goldfish-Effort).
- **Native Codex-Host-Duty (ADR-0035):** `criticNormal` ist eine explizite
  runnerspezifische Host-Duty auf `gpt-5.6-sol/xhigh`; sie entsteht nicht durch
  eine stille Übersetzung der kanonischen Critic-Zuweisung `max`. Bestehende
  Claude-Zuweisungen bleiben unverändert. Die Duty ist ein normaler Review-Pfad
  und erfüllt T1-Isolation nur mit einem namentlichen, scope-begrenzten PO-Waiver.

### MP-22 — Minimum-tier principle: phase-scoped (design vs. execution)

*(English in the source — agent-facing dispatch rule.)*

- **Design phase — Design-Tier model mandatory (session effort per MP-01; Design-Tier subagent dispatches `max` per MP-07):** Everything from Triage through Interview→Spec to the Spec-Readiness-Check (`docs/operating-model.md` §3.2 steps 1–3) — interview/requirements clarification, best-practice and solution-path research, architecture debate, spec/plan authoring, path decisions, spec-readiness evaluation — runs on the Design-Tier model. This includes research goldfish dispatched during the design phase: they default to the Design-Tier model, with the briefing's model-justification field stating "design-phase quality" (MP-05 field).
- **Execution phase — Implement-/Mechanic-Tier default; orchestrator tier per the chosen profile (MP-01):** From Goldfish-Dispatch through Merge (`docs/operating-model.md` §3.2 steps 4–8) — implementation against a finished plan, mechanical edits, bulk/grunt work, status updates, formatting, doc-sync — dispatches to the Implement-/Mechanic-Tier model (MP-02/MP-27). The orchestrator itself may keep running the execution phase on the Design-Tier model or switch to a cheaper configuration per the chosen profile (MP-01) — the Design-Tier model's irreducible core in the execution phase shrinks to the Review-Tier escalation cases (MP-07) and Readiness-check subagent dispatches, which stay Design-Tier regardless of profile; everything else sensibly delegable goes to the Implement-/Mechanic-Tier — including workflow `agent()` calls, which MUST set the model explicitly (silent model inheritance is a known cost driver).
- **Bundling:** small interlinked feature bundles are dispatched as ONE bundled briefing — context economy through bundling, never through self-implementation; "small/interlinked" is never grounds for the orchestrator to implement it itself.
- **Why:** design-phase quality spend is legitimate; silent-inheritance waste in the execution phase is not. Splitting the principle by SDLC phase keeps the legitimate spend and cuts the waste. Leaves MP-01 (orchestrator model) and MP-02 (Goldfish default) unchanged.
- **Check:** Design-phase dispatches (Triage/Spec/Readiness) show the Design-Tier model in the dispatch metadata field without needing a justification (it's the default for that phase); execution-phase dispatch briefings and workflow `agent()` invocations carry an explicit `model` field defaulting to the Implement-/Mechanic-Tier; a Design-Tier dispatch in the execution phase requires a stated model justification (MP-05).

### MP-23 — Implement-tier-first / Design-tier-first presumption, scoped by phase

- **Execution phase:** "When in doubt whether a dispatch needs the Design-Tier model, it does not — draft on the Implement-/Mechanic-Tier, have the orchestrator review; Design-Tier authorship only for genuine architecture/guardrail/security single cases with a stated rationale (MP-05) — in practice this is where the Review-Tier escalation / Readiness-check subagent dispatches (MP-07) sit."
- **Design phase (reversed):** When in doubt whether a design-phase step (interview, research, architecture debate, spec authoring, readiness evaluation) needs the Design-Tier model, it does — stay on the Design-Tier model (effort per MP-01 standard) rather than downgrading, per MP-22.
- **Why:** A single "when in doubt, cheaper tier" rule would silently erode the design-phase quality guarantee MP-22 sets explicitly; the presumption inverts by phase instead of applying uniformly.
- **Check:** Same as MP-22; Critic review of Spec-Readiness / architecture artifacts flags a design-phase step that ran on a lower tier without an explicit, documented reason.

---

## 2. Ultracode & Dynamic Workflows

Begriffsklärung: Ultracode ist kein API-Effort-Level, sondern ein Runtime-Setting — es sendet Effort `xhigh` und erlaubt der Hauptsession, Dynamic Workflows (Multi-Agent-Orchestrierung per Skript) zu planen. **Abgrenzung: Ultracode ≠ Subagents.** Goldfische und Critics sind normale Subagents und funktionieren IMMER, völlig unabhängig davon, ob Ultracode aktiv ist; Ultracode betrifft ausschließlich die Workflow-Orchestrierung der Hauptsession (MP-08). „Ultracode aus" schwächt also weder Dispatches noch Reviews.

### MP-08 — Niedrigschwelliger Task-Opt-in mit Indikationsliste

- **Gebot:** Ultracode/Workflows werden **pro Task** aktiviert (Keyword `ultracode` im Prompt bzw. „use a workflow"), niedrigschwellig und ohne Zeremonie, wenn die Aufgabe auf der Indikationsliste steht:
  - **initiale Recherchen** (z. B. Deep-Research-Aufträge, Cross-Check-Recherche),
  - **Vorgehensmodell-/Architektur-Exploration** (Alternativen parallel ausleuchten),
  - **Audits** (codebase-weite Prüfungen, Konsistenz-Checks),
  - **Migrationen** (viele gleichförmige Änderungen).
  **Gegenindikation:** normale Feature-Implementierung und Tasks mit starken Abhängigkeiten untereinander — offizielle Guidance nennt hier ausdrücklich „die meisten Coding-Tasks" als Gegenindikation.
- **Verbot:** `/effort ultracode` als Dauerzustand der Design-Tier-Session. Session-weites Ultracode nur für einen abgegrenzten Workflow-Block mit sofortigem Rückweg — besser: große Workflow-Läufe in einer eigenen Session bzw. aus einem Goldfish heraus starten, damit der Orchestrator-Cache die Effort-Wechsel nicht doppelt bezahlt (Effort-Wechsel invalidiert den Cache, MP-17).
- **Warum:** Die Stärke des Werkzeugs ohne Token-Blindflug nutzen; die positiven Indikationen sind genau die parallelisierbaren, kontextsprengenden Aufgabentypen.
- **Prüfweise:** Workflow-Läufe erscheinen als eigene Telemetrie-Zeile (Rolle „Workflow"); ein Live-Statuskommando zeigt Token pro Agent während des Laufs.

### MP-09 — Kalibrierlauf bei neuartigen großen Workflows (empfohlen, keine Pflicht-Hürde)

- **Gebot (soll):** Vor einem neuartigen großen Workflow-Run einen Small-Slice-Kalibrierlauf fahren — ein Verzeichnis statt des ganzen Repos, eine enge Frage statt einer breiten; Token-Verbrauch beobachten; Abbruch verliert keine fertigen Teilergebnisse (offizielle Empfehlung).
- **Warum:** „A single run can use meaningfully more tokens than working through the same task in conversation." Der Kalibrierlauf ist bewusst eine Empfehlung, keine Pflicht — bei bekannten, erprobten Workflow-Typen entfällt er.
- **Prüfweise:** Bei neuartigen Workflows > erwartete 30 Min Laufzeit dokumentiert die Telemetrie-Zeile, ob kalibriert wurde („Besonderheiten").

### MP-10 — HARTE Vorbedingung für schreibende Workflow-/Runner-Dispatches

- **Gebot (hart, blockierend):** Vor jeder Workflow-/Runner-Invocation erhält der providerneutrale P5B-Runner einen vollständigen strukturierten Coordinator-Dispatch und führt den P5-Preflight vor seinem einzigen injizierten synthetischen Adapter-Aufruf aus. `isolated-write` verlangt alle drei Vorbedingungen: (1) **Hook-Guardrails installiert** — die git-guard-Union als PreToolUse-Hook aktiv; (2) **enge Task-Allowlist** — nur die für den Task nötigen Kommandos; (3) **Worktree** — ein nachgewiesen isolierter Worktree. `bounded-write` ist nur nach sichtbarer PO-Entscheidung und ausschließlich bei vollständig positiv belegten, projektkalibrierten begrenzenden Kontrollen zulässig. `read-only` braucht eine durchsetzbare No-Write-Fähigkeit. Jede fehlende, unklare oder nicht unterstützte Eingabe wird vor der Adapter-Invocation abgewiesen.
- **Warum:** Workflow-Subagents laufen **immer in `acceptEdits`** und erben die Tool-Allowlist der Session — Permission-Modi (`plan`, `ask`, Projekt-`defaultMode`) greifen dort NICHT. Der einzige wirksame Schutz liegt auf Hook-, Allowlist- und Isolations-Ebene.
- **Hochrisiko-Projekt-Sonderregel:** Bei <PROJECT_B> (reale Geräte, hohe Stakes) sind schreibende Workflows bis zum Abschluss der Guard-Migration nur mit expliziter PO-Freigabe zulässig — zusätzlich zu den drei Vorbedingungen. Ob die je Projekt bestehenden, ggf. abweichenden git-guard-Inkarnationen als Übergangs-Voraussetzung genügen, bis eine gemeinsame Union ausgeliefert ist, regelt die projektspezifische Kalibrierung — im Zweifel den PO fragen.
- **Prüfweise:** Der strukturierte Workflow-Startauftrag belegt Modus, Side Effects, kanonische Pfade, kalibrierte Isolation, aktiven Guard, enge Task-Allowlist, exakten Verify und Eskalationsziel; Capability-Evidence ist pro beanspruchter Eigenschaft auswertbar. Der Preflight testet jeden Reject vor Adapter-Invocation. Diese Regel betrifft nur Workflow-/Runner-Dispatches, nicht ordentliche lokale oder serielle Writer; diese bleiben worktree-optional.

### MP-11 — Parallel-Limit: 3–5 Agents als Default

- **Gebot:** Workflows und manuelle Subagent-Fan-outs laufen standardmäßig mit **3–5 parallelen Agents**. Mehr (technisch oft weit darüber möglich) nur mit expliziter Begründung im Workflow-Prompt UND vorherigem Kalibrierlauf (MP-09).
- **Warum:** 3–5 deckt sich mit dem gängigen Referenzmuster (ein Lead-Agent spawnt 3–5 Subagents) und mit dem eigenen WIP-Limit für das serielle PO-Gate. Darüber leiden Koordinationsqualität und Kostenkontrolle.
- **Prüfweise:** Agent-Zahl steht im Workflow-Prompt; ein Live-Statuskommando während des Runs zeigt die tatsächliche Zahl.

### MP-12 — Erprobte Workflows versionieren

- **Gebot:** Erfolgreiche Workflow-Läufe als Command unter `.claude/workflows/` des jeweiligen Repos speichern.
- **Warum:** Reproduzierbare Orchestrierung statt Neu-Improvisation — exakt der „versioniertes Operating Model"-Ansatz der Pipeline.
- **Prüfweise:** Wiederholte Workflow-Typen ohne versionierten Command fallen in der periodischen Telemetrie-Sichtung auf.

---

## 3. Token-Budget-Leitplanken

### MP-13 — Kosten pro AUFGABE messen, nie pro MTok

- **Gebot:** Kostenvergleiche und -entscheidungen ausschließlich auf Aufgabenebene (Gesamt-Tokens/-Kosten pro Task) führen. **Verbot:** $/MTok-Vergleiche über Tokenizer-/Modell-Generationen hinweg.
- **Warum (Tokenizer-Falle):** Neuere Modell-Generationen produzieren für denselben Text oft spürbar mehr Tokens als ältere — MTok-Preise sind zwischen Modell-Generationen nicht direkt vergleichbar. Ein „teureres Modell spart Iterationstokens"-Argument ist deshalb nur auf Task-Ebene überprüfbar, nie am reinen MTok-Preis.
- **Prüfweise:** Die Telemetrie (Abschnitt 5) erfasst Tokens pro Session/Block/Aufgabe — das ist die Messbasis für jeden periodischen Preis-Review (MP-21).

### MP-14 — Small-Slice-Kalibrierung vor großen Runs

- **Gebot:** Vor jedem großen Run (Workflow ODER langer autonomer Einzel-Lauf) den Spend auf einer kleinen Teilmenge messen (ein Verzeichnis, eine enge Frage) — offizielle Empfehlung.
- **Warum:** Der Verbrauch großer Läufe ist vorab kaum schätzbar; die Kalibrierung liefert die Hochrechnung, bevor das Budget weg ist.
- **Prüfweise:** Telemetrie-Zeile des großen Runs referenziert den Kalibrierlauf („Besonderheiten").

### MP-15 — `/goal` nur mit Stop-Klausel

- **Gebot:** Jede `/goal`-Bedingung für autonome Läufe enthält eine explizite Stop-Klausel (z. B. „… or stop after 20 turns"). `/goal` ohne Argument zeigt Turns + Token-Spend des laufenden Ziels — bei langen Läufen regelmäßig prüfen.
- **Warum:** Ohne Stop-Klausel gibt es keine strukturelle Obergrenze für einen fehlgeleiteten autonomen Lauf.
- **Prüfweise:** Stop-Klausel ist Teil des Briefing-Templates für autonome Läufe (`docs/operating-model.md`: „Stop-Bedingungen" sind ohnehin Pflichtteil jedes Briefings).

### MP-16 — Limits & Monitoring

- **Gebot:** Einen Nutzungs-/Kosten-Status mindestens beim Session-Abschluss abrufen (Datenquelle der Telemetrie, Abschnitt 5); Kontext-Füllstand vor großen Runs prüfen. Als Obergrenzen dienen die offiziellen Mechanismen des jeweiligen Providers (z. B. ein Monatslimit im Abo bzw. Workspace-Spend-Limits bei API-Abrechnung).
- **Verbot:** Budget-Steuerung auf undokumentierte Direktiven stützen — ein informell behaupteter Token-Budget-Bonus oder ein nicht offiziell belegtes CLI-Flag zur Budgeterhöhung gilt als UNSICHER, bis am eigenen Provider verifiziert.
- **Merkposten:** Manche Provider-APIs bieten ein Beta-Budgetfeld nur für die programmatische Messages-API an, nicht für die interaktive CLI — erst relevant, falls die Pipeline später headless/SDK-basiert orchestriert.
- **Prüfweise:** Limit gesetzt = einmalig im Bootstrap-Check dokumentiert; Nutzungswerte erscheinen in jeder Telemetrie-Zeile.

### MP-24 — Route trivial questions away from the Design-Tier session

*(English in the source — operational rule, session-routing.)*

- **Rule:** "Do not ask the orchestrator about the weather: quick questions from mobile that need no orchestrator context belong in a separate session/chat — every message to the Design-Tier session costs Design-Tier tokens and context."
- **Why:** Model and effort are session properties (MP-01, MP-17) fixed for the whole session — except the ONE sanctioned profile switch-point (PRD-gate, MP-01/MP-17/MP-18) — there is no per-message model downgrade. The fix for per-request model switching is delegation via a separate, cheaper session, not a lighter orchestrator session.
- **Check:** Session topic drift is a bootstrap/close-ritual check item (`docs/operating-model.md` §5); a Design-Tier session containing unrelated one-off/status questions is a lifecycle violation flagged at close, not a modeling problem.

### MP-26 — Advisor-Regeln (optionales Second-Opinion-Muster)

- **Gebot:**
  (a) Der Advisor wird nur genutzt, wenn `worktypes.<profile>.advisor` auf ein Modell gesetzt ist (nicht `off`) (oder per datierter Projekt-Ausnahme) — Default ist `off` (s. Preset, Abschnitt 1).
  (b) Advisor = Design-Tier-Modellklasse als Second Opinion, injiziert an Urteils-Gates. Wird der Advisor als projektweiter Standard-Betrieb gewählt (Design-Tier-Orchestrator + Advisor durchgehend aktiv statt nur punktuell), bleibt das eine ECHTE, bewusst getroffene Wahl je Projekt — niemals ein stiller Auto-Default.
  (c) Jede Telemetrie-Zeile erfasst Advisor-Aufrufzahl/-Kostenanteil, soweit die Nutzungsanzeige des Providers das ausweist.
  (d) Goldfish-/Critic-Briefings in Advisor-Sessions tragen bei Bedarf eine explizite Verbotszeile „Do not consult the advisor", bis eigene Messdaten den Nutzen bestätigen.
  (d2) Die Subagent-Modell-Matrix bleibt UNANGETASTET: Goldfish/Critic laufen immer auf dem im Dispatch explizit genannten Tier-Modell (MP-02/MP-07) — Advisor-Vererbung betrifft ausschließlich die Verfügbarkeit des Advisor-TOOLS innerhalb eines Subagenten, nie dessen eigenes Modell.
  (d3) Advisor-Hygiene präsentiert NIE blind ein globales Advisor-Aus (das kann parallele Advisor-Sessions anderer Projekte auf derselben Maschine stumm beenden). Reihenfolge: (1) nach parallelen Advisor-Sessions anderer Projekte auf dieser Maschine fragen; (2) einen projekt-lokalen Off-Schalter bevorzugen, falls die Runtime einen anbietet; (3) einen globalen Advisor-Aus-Schalter NUR nutzen, wenn keine parallele Session betroffen ist; (4) weicht der TATSÄCHLICHE Advisor-Zustand vom beabsichtigten Zustand des gewählten Profils ab, ist das eine Pflichtfrage an den PO, keine stille Korrektur.
  (d4) Nach jedem Kontext-Kompaktierungsschritt (`/compact` o. Ä.) in einer Advisor-aktiven Session MUSS die Advisor-Verfügbarkeit aktiv geprüft und im Session-Protokoll notiert werden — Kompaktierung × Advisor-Wechselwirkung ist ein bekannter blinder Fleck, den diese Prüfpflicht schließt.
  (e) Der Orchestrator SOLLTE Advisor-Konsultation an Urteils-Gates aktiv anfordern (Dispositionen, Readiness-Triage, Inzident-Entscheide) statt sich allein auf modellgesteuertes Timing zu verlassen.
  (f) Advisor-Effort ist nicht separat konfigurierbar (er läuft auf dem festen Design-Tier-Effort).
  (g) **Advisor-Ausfall-Workaround (gehärtet):** Meldet ein Advisor-Aufruf in einer Advisor-aktiven Session einen Fehler/`unavailable`, gilt in dieser Reihenfolge:
  1. SOFORT-Meldung an den PO beim ERSTEN Fehlschlag — nie stilles Weiterlaufen ohne Advisor.
  2. **PFLICHT-PRIMÄRPFAD, kein optionaler Vorschlag:** der Orchestrator dispatcht UNMITTELBAR einen read-only Advisor-Consult-Subagenten als Ersatz (Design-Tier-Modellklasse, Dispatch-Metadaten `role=consult-advisor` — der gebundene Fallback-Agent heißt in diesem Plugin `consult-advisor`, `plugins/pipeline-core/agents/consult-advisor.md`), GENAU eine Frage je Consult, keine Repo-Schreibzugriffe; die Antwort fließt in das Orchestrator-Urteil ein, wird nie automatisch angewandt.
  3. Zusätzlich, NICHT alternativ, bietet der Orchestrator dem PO einen Umschalt-Block auf ein alternatives Advisor-Modell als OPTIONALES ANGEBOT an — Entscheidung liegt beim PO, kein Orchestrator-Alleingang.
  **Verbot (explizit):** (i) stilles Weglassen der Advisor-Konsultation und (ii) ein einseitiger Wechsel des HAUPTMODELLS als Reaktion auf den Advisor-Ausfall sind KEINE zulässigen Ersatzhandlungen für Schritt 2 — beide wurden real beobachtet und sind genau die Lücke, die diese Härtung schließt.
- **Warum:** Advisor-Kosten skalieren mit der Kontextlänge (ungecachte Full-Conversation-Reads); ohne diese Leitplanken würde das Advisor-Muster die Kostendisziplin unterlaufen, die die Tier-Matrix herstellen soll. Die Hygiene-Reihenfolge (d3) verhindert, dass ein blindes globales Advisor-Aus Nachbarsessions beschädigt.
- **Prüfweise:** Dispatch-Metadaten und Briefings zeigen die Verbotszeile in Advisor-Sessions, wo zutreffend; Telemetrie-Zeile weist Advisor-Aufrufe aus („Besonderheiten"); der Bootstrap-Schritt zur Advisor-Konfiguration prüft die Hygiene-Reihenfolge inkl. der Pflichtfrage bei Divergenz; Session-Notizen tragen den Post-Kompaktierungs-Advisor-Check (d4); ein Advisor-Ausfall löst binnen desselben Turns die (g)-Meldung UND binnen desselben oder des nächsten Turns den Consult-Advisor-Dispatch aus — stilles Weiterlaufen ohne Advisor, oder ein einseitiger Modellwechsel statt des Dispatches, ist ein Bootstrap-/Prozessfehler, kein Judgment Call.

---

## 4. Cache-Disziplin

### MP-17 — Modell + Effort am Sessionanfang fixieren

- **Gebot:** Modell und Effort werden zu Sessionbeginn gesetzt (Design-Phase: Design-Tier-Modell + Standard-Effort, MP-01) und bleiben bis zur nächsten Phasen-/Profilgrenze stabil. **Sanktionierte EINE Ausnahme:** im Gate-Wechsel-Profil (MP-01) genau EIN Wechsel auf die günstigere Ausführungsphasen-Konfiguration unmittelbar am PRD-Freigabe-Gate. Der Rück-Wechsel zurück auf das teurere Design-Tier-Modell mitten in der Session bleibt VERBOTEN. Jeder andere Wechsel — falls unvermeidbar — nur an Aufgabengrenzen.
- **Warum:** Ein Modell- oder Effort-Wechsel invalidiert den kompletten Prompt-Cache; bei langen Sessions heißt das eine volle, teure Neuverarbeitung des Verlaufs. Ebenfalls Invalidatoren (providerabhängig, vor Sessionbeginn verifizieren): Fast-Mode-Wechsel, MCP-Connect/Disconnect (nicht-deferred), Deny-Regel auf blanke Toolnamen, Kontext-Kompaktierung, Runtime-Upgrade mitten in einer Session.
- **Prüfweise:** Bootstrap-Pflichtschritt (`harness/session-bootstrap.md`); Cache-Gesundheit messbar über das Verhältnis Cache-Read- zu Cache-Creation-Tokens (hohes Read-zu-Write-Verhältnis = gesund; dauerhaft hohe Creation = Invalidator suchen).

### MP-18 — Subagenten-Schnitt statt Modellwechsel

- **Gebot:** Braucht eine Aufgabe ein anderes Modell oder viel Token-Durchsatz, wird sie an einen Subagent (Goldfish/Critic) geschnitten — nie per Modellwechsel-Kommando in der laufenden Design-Tier-Session gewechselt.
- **Verbot:** Ein eingebauter „Plan auf großem Modell, Exec auf kleinem Modell"-Auto-Toggle-Alias wird in der Pipeline nicht verwendet.
- **Sanktionierte Ausnahme:** Der EINE Gate-Wechsel am PRD-Freigabe-Gate (MP-01) ist von diesem Verbot ausgenommen — er ist ein geplantes, im Dispatch-Ledger dokumentiertes Ereignis, kein Modellwechsel „in der laufenden Session" im Sinne dieser Regel. Der Rück-Wechsel bleibt ohne Ausnahme verboten.
- **Warum:** Subagents haben einen eigenen, kurzlebigen Cache; der Parent-Cache bleibt intakt — ein Modellwechsel in der Session zerstört ihn dagegen komplett. Deshalb ist ein durchgehend teureres Design-Tier-Modell mit der Cache-Ökonomie verträglich: Der Orchestrator-Kontext wird als billiger Cache-Read wiederverwendet, die token-intensive Arbeit läuft in billigen, frischen Goldfish-Kontexten. Ein Auto-Toggle-Alias wechselt das Modell bei jedem Plan↔Exec-Übergang und bezahlt jedes Mal den Cache neu.
- **Prüfweise:** Ein Modellwechsel in der Telemetrie ist NUR dann eine Auffälligkeit, wenn er NICHT das dokumentierte PRD-Gate-Wechsel-Ereignis ist — dieses wird als ERWARTETES Ereignis mit Ledger-Eintrag + Identitätsverifikation geführt, keine Anomalie. Jeder andere Modellwechsel bleibt Auffälligkeits-Kandidat. Statusanzeige/Nutzungs-Kommando zeigen das Cache-Verhältnis.

### MP-19 — Kontext-Hygiene: Clear/Compact/Rewind-Regeln

- **Gebote:**
  1. **Themenwechsel → neue/umbenannte Session** (vorher umbenennen zur Wiederauffindbarkeit). „Stale context wastes tokens on every subsequent message."
  2. **Kompaktierung nur an natürlichen Aufgabengrenzen**, immer mit Fokus-Argument — nie Auto-Kompaktierung mitten im Task treiben lassen. **Checkpoint-Regel:** an jeder Aufgabengrenze (Paket-/Wellen-Grenze, PRD-Gate, vor dem ersten Dispatch eines neuen Pakets) mit hohem Kontext-Füllstand ist eine fokussierte Kompaktierung PFLICHT-Checkpoint, kein Notfall-Ventil; deutlich darüber gilt als überfälliger Schnitt. **Cache-Ökonomie-Notiz:** Kompaktierung baut den warmen Cache NEU auf (voller Reprocessing-Kostenblock) — daher nur an Grenzen setzen, wo der Rebuild sich amortisiert, konsistent mit MP-17 und ohne Widerspruch zum dort sanktionierten EINEN Gate-Wechsel (der Compact-Checkpoint ist eine Cache-Rebuild-Entscheidung, keine zusätzliche Modellwechsel-Ausnahme).
  3. **Rücksprung auf einen gecachten Prefix statt Kompaktierung**, wenn ein Lösungsweg komplett verworfen wird — das ist billiger als eine Neuverdichtung.
  4. CLAUDE.md-/Memory-Edits sind cache-safe, greifen aber erst nach dem nächsten Clear/Compact/Restart — nicht wundern, nicht doppelt patchen.
  5. Ein automatischer Modell-Fallback (z. B. ein Safety-Classifier-Downgrade) = Cache-Verlust → in Telemetrie-„Besonderheiten" vermerken, falls beobachtet.
- **Hinweis Worktrees:** Der Cache gilt pro Maschine + Arbeitsverzeichnis — jeder Worktree hat einen eigenen Cache. Bei paralleler Goldfish-Planung als Kostenfaktor einkalkulieren.
- **Warum:** Kontext-Hygiene ist der zweitgrößte Kostenhebel nach der Modellwahl; die Regeln sind offizielle Faustregeln, keine Pipeline-Erfindung.
- **Prüfweise:** Session-Lifecycle-Politik im Operating Model (`docs/operating-model.md`) macht diese Regeln zum Pflichtwissen jeder Design-Tier-Session; Verstöße werden über das Cache-Verhältnis (MP-17) sichtbar; ein Kompaktierungs-Block an einer Aufgabengrenze mit hohem Füllstand ist im Dispatch-Ledger/Handover sichtbar.

---

## 5. Kosten-Telemetrie

### MP-20 — Instrument: `telemetry/costs.md` je Projekt, geschrieben beim Sessionabschluss

- **Gebot:** Jedes Pipeline-Projekt (auch das eigene Meta-Repo, sofern es die Pipeline auf sich selbst anwendet) führt eine versionierte Datei **`telemetry/costs.md`**. Beim Session-Abschluss (`/close`-Ritual) wird pro Session bzw. pro abgeschlossenem Block **eine Zeile** angehängt:

  | Datum | Session/Block | Rolle | Modell/Effort | Aufgabe (kurz) | Tokens | First-Pass (j/n) | Eingriffe nötig (j/n) | Besonderheiten |
  |---|---|---|---|---|---|---|---|---|
  | JJJJ-MM-TT | S4/B2 | Elephant | Design-Tier / high | Phase-2-Dispatch Policies | 1,1M in (Cache-R 90 %) / 60k out | — | — | — |
  | JJJJ-MM-TT | S4/B2-G1 | Goldfish | Implement-Tier / medium | model-policy verfasst | 250k in / 30k out | j | n | — |

  Konventionen: Rolle ∈ {Elephant, Goldfish, Critic, Workflow}; „Tokens" = Input/Output plus Cache-Read-Anteil, so wie die Nutzungsanzeige des Providers sie ausweist (Subagent-/Skill-Attribution nutzen, wo verfügbar); „Besonderheiten" = Eskalationen (MP-05/MP-07), Modell-Fallback, Cache-Auffälligkeiten, Kalibrierläufe, Workflow-Agent-Zahl.
- **Reifemetrik-Erhebung (Nutzen-/Selbst-Messgröße, `docs/operating-model.md` §7):** Die Spalten **„First-Pass (j/n)"** (Abgabe ging ohne Nacharbeitszyklus durchs Gate) und **„Eingriffe nötig (j/n)"** (manuelle Eingriffe/Kurskorrekturen während des Laufs) werden **je Goldfish-Dispatch** gepflegt; Elephant-/Critic-Zeilen tragen „—".
- **Headless-Konvention:** Headless-/Bare-Läufe (`policies/tooling-policy.md`) tragen zusätzlich einen von der Runtime maschinenlesbar gelieferten Gesamtkostenwert in die Token-Spalte ein (als $-Wert kennzeichnen), soweit die Runtime das liefert.
- **Subagent-Token-Konvention:** Dispatch-Zeilen tragen Subagent-Tokens in der Tokens-Spalte, annotiert „(subagent)"; bei über Resume/mehrere Turns fortgesetzten Dispatches ist der ausgewiesene Wert KUMULATIV und mit „(kumulativ)" zu kennzeichnen — nie über mehrere Zeilen hinweg doppelt aufsummieren.
- **Budget-Eskalationskriterium (Referenzziel von `docs/operating-model.md` §4.3, Stufe 4):** Budget-Überschreitung liegt vor, wenn das Monatslimit erreicht ist ODER die Hochrechnung eines Kalibrierlaufs (MP-09/MP-14) die Erwartung deutlich übersteigt → Stop + Eskalation an den PO.
- **Übergangsregel:** Solange kein Automatismus die Zeile schreibt, wird sie manuell beim Session-Abschluss gepflegt. Sobald ein Close-Skill/Ledger-Script (z. B. `harness/scripts/usage-ledger.mjs`) verfügbar ist, übernimmt es die Token-Hälfte automatisch; die $-Spalte bleibt dann eine markiert GESCHÄTZTE Rechenhilfe aus einer lokalen Preistabelle (z. B. `harness/scripts/model-prices.json`) — der MP-13-Vorbehalt „Kosten pro Aufgabe, nie pro MTok" bleibt unverändert, die Schätzung ist eine Rechenhilfe, kein MTok-Vergleich. Ein später eintreffender echter Beleg wird als datierter Nachtrag in die bestehende Zeile eingearbeitet (echte Zahl überschreibt die Schätzung, die Schätzung bleibt als Kalibrierdatum sichtbar — MP-21-Review nutzt diese Drift-Daten). Die lokale Preistabelle ist an den MP-21-Preis-Review gekoppelt: jeder Review aktualisiert BEIDES, Abschnitt 6 dieser Policy und die Preistabellen-Datei.
- **Periodische Sichtung:** Die erste Design-Tier-Session eines Turnus (z. B. Monatsanfang) sichtet die Vorperioden-Zeilen und hängt 3–5 Zeilen Befund unter `## Sichtung JJJJ-MM` an die Datei an (Auffälligkeiten, Eskalationsquote, Cache-Gesundheit, grobe $-Schätzung über die lokale Preistabelle — als Schätzung kennzeichnen, MP-13 beachten). Pflichtteil der Sichtung: **First-Pass-Quote und Nacharbeitsaufwand** über die Goldfish-Zeilen auswerten.
- **Warum:** „Kosten-Telemetrie ab Tag 1" bleibt ohne Instrument ein Soft-TODO; ein Preis-Review braucht reale Task-Kosten-Daten, keine MTok-Rechnungen.
- **Prüfweise:** Datei existiert und wächst (Git-Log); ein Close-Automatismus (falls vorhanden) erzwingt den Schritt; ein Drift-Check des Abschluss-Rituals deckt vergessene Zeilen auf.

---

## 6. Kostenrichtwerte & Preis-Review

Diese Policy führt bewusst KEINE fest verdrahtete $/MTok-Tabelle mehr — Modellpreise ändern sich häufiger als diese Policy und unterscheiden sich je Provider/Tier. Stattdessen gilt:

- **Höhere Fähigkeitsklassen kosten pro Token in der Regel mehr** — Effort ist der wirksamste Kostenhebel innerhalb eines Tiers (nicht die Tier-Wahl selbst herunterschrauben, MP-06); Kostenentscheidungen immer auf Task-Ebene treffen, nie am reinen $/MTok-Wert (MP-13).
- **Vor jeder Kostenentscheidung die aktuelle Preisseite des eigenen Providers gegenprüfen** — diese Policy nennt bewusst keine Snapshot-Zahlen, die veralten würden. Konkrete, für dein Setup gültige Zahlen gehören in deine lokale Preistabelle (z. B. `harness/scripts/model-prices.json`, falls vorhanden) oder eine eigene Kalkulationsnotiz — nicht in diese Datei.
- **Modell-/Provider-Betriebsnotiz (generische Vorsicht):** Manche Modelle rechnen Thinking-Tokens verdeckt als teuren Output ab, oder haben abweichende Cache-Break-even-Punkte, Kontextfenster-Aufschläge, Batch-Rabatte oder eine andere Tokenizer-Effizienz gegenüber älteren Generationen — vor einer Kostenannahme das TATSÄCHLICHE Verhalten des konfigurierten Modells verifizieren, nicht das eines anderen Modells unterstellen.
- **Abrechnungsmodell beachten:** Manche Provider führen einzelne Modelle außerhalb des Plan-Kontingents (Overage/Credits), andere Modelle bleiben im Kontingent — das beeinflusst, welches Tier sich für Dauerbetrieb eignet (relevant für die Profilwahl in MP-01) und ist am eigenen Account zu prüfen, nicht anzunehmen.

### MP-21 — Periodischer Preis-Review + Anpassungsvorbehalt

- **Gebot:** Ein Preis-Review findet periodisch statt (z. B. quartalsweise, oder ausgelöst durch eine Provider-Preisänderung bzw. das Auslaufen einer Einführungskondition) — Termin und Anlass im eigenen Projekt-Entscheidungsprotokoll festhalten. Input: Telemetrie-Daten aus MP-20 (Task-Kosten je Rolle), Eskalationsquoten, Cache-Verhältnis. Gegenstand: das gesamte Preset in Abschnitt 1, der Goldfish-Effort-Default, die Eskalationskriterien.
- **Anpassungsvorbehalt:** Das Preset gilt unter Vorbehalt — Anpassung ausdrücklich vorbehalten, falls ein Tier sich als zu teuer für die erzielte Qualität erweist. Zwischenbefunde der periodischen Sichtung (MP-20) können den Review vorziehen.
- **Prüfweise:** Der Review-Termin ist im eigenen Projekt-Entscheidungsprotokoll verankert; die erste Sichtung nach Fälligkeit MUSS den Review-Befund dokumentieren.

---

*Formalisierung: Die tier- und workflow-übergreifenden Anteile dieser Policy werden bei Bedarf in `docs/adr/` als ADRs festgeschrieben (u. a. Workflow-Vorbedingungen für acceptEdits und die Hochrisiko-Projekt-Sonderregel). Rangfolge unverändert: das eigene Entscheidungsregister (falls vorhanden) > ADR > diese Policy-Ausformulierung.*
