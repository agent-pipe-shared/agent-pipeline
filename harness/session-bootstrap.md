# Session Bootstrap Protocol

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · as of 2026-07-03

**Status:** Binding harness protocol. Fulfills the mission requirement "bootstrap docs" — show the plugin state (SHA/version), check it against the remote state, and define offline behavior and the refresh ritual. Applies to **every new session in every connected project** (`<PROJECT_A>`, `<PROJECT_B>`, `<PROJECT_C>`, the Pipeline repo itself), on both machines, independent of local paths. The executable form is built in Phase 3 as a skill (agent-facing, English — → ADR-0011 Language, in `docs/adr/`); this document is the human-readable spec and is the reference on any discrepancy.

---

## 1. Purpose

Every new session must ensure three things **before** it starts working:

1. **Ruleset loaded and current:** the `pipeline-core` plugin (skills, agents, hook guardrails) is installed, and its state matches the remote state of the central repo.
2. **Project context loaded:** project calibration (the thin project-specific layer) and handover state have been read.
3. **Provable execution:** a formatted self-confirmation makes the bootstrap auditable — if the line is missing, no bootstrap happened.

**Why a dedicated protocol:** the plugin cache is a **copy per user per machine**. A push to the central repo does **not** propagate automatically — auto-update is off by default for custom marketplaces, and during the SHA phase every commit counts as a new version that only a manual refresh picks up. Across two machines this creates **cache drift**: machine B works with stale guardrails without noticing — the old copy-paste drift in a new form. The bootstrap check surfaces this drift at every session start instead of relying on discipline.

---

## 2. Mechanism decision: three layers

Condensed version; the full weighing of criteria → **ADR-0010** in `docs/adr/`.

| Layer | Carrier | Delivers | Why this carrier |
|---|---|---|---|
| **Behavior** | Plugin `pipeline-core` from the marketplace repo `agent-pipeline` | Skills, agents, hooks (hard guardrails) | The only mechanism with versioning, pinning **and** hook distribution; path-independent via the user cache |
| **Binding** | Committed `.claude/settings.json` per project (`extraKnownMarketplaces` + `enabledPlugins`) | Declaration "this project uses these standards" | Every project repo is self-describing: a fresh clone on machine 2 (or CI/cloud) carries the binding along; install prompt on trusting the folder |
| **State** | Handover file per project (canonical name/location → `docs/operating-model.md`); in the Pipeline repo: `docs/state.md` | What currently applies, what's open, what was last decided | ONE versioned source instead of a triple hand-maintained baton |

Versioning: initially **SHA-based** (every commit propagates on refresh), SemVer + tags from the stability phase onward.

**Evaluated alternatives** (one why-not-alone sentence each; details → ADR-0010 in `docs/adr/`):

- **Global `~/.claude` alone:** applies uniformly to all projects with no per-project binding, and projects aren't self-contained — a fresh clone (machine 2, CI) doesn't carry the standards along.
- **`@`-imports alone:** distribute only instruction text, no hooks/agents — hard guardrails would stay unenforced, since CLAUDE.md is officially "context, not enforced configuration."
- **Checked-in `.claude/` copies per project:** exactly the documented anti-pattern — several guard-git incarnations can provably diverge without any one being a superset of the others.
- **SessionStart hook alone:** can inject context, but the hook itself first has to reach the project — hooks only distribute via user settings or plugins, so it's chicken-and-egg without the plugin layer.

The SessionStart hook is therefore not the distribution mechanism but a **building block for enforcing** this protocol (see §3, Anchoring).

---

## 3. Bootstrap flow

Implemented as a skill (Phase 3): **`/pipeline-core:pipeline-start`** (canonical name; the resolution of earlier working names is documented in the skill header — `plugins/pipeline-core/skills/pipeline-start/SKILL.md`). Where the skill isn't installed, the flow serves as a manual checklist (`templates/prompts/session-bootstrap-check.md`).

**Anchoring (how the protocol enforces itself):**

1. A **SessionStart hook** from the plugin requests execution of the bootstrap skill — deterministically, as soon as the plugin is loaded (the "inject context" pattern).
2. **One line in the project's CLAUDE.md** ("Run `/pipeline-core:pipeline-start` first") as an advisory fallback. If the skill invocation fails ("unknown skill"), that is precisely the evidence of case **F1** (ruleset missing) — the fallback thus detects the absence of the main layer.
3. The **confirmation line** (Step 6) makes execution auditable for the PO and for hooks.

### Step 1 — Determine plugin presence + loaded state

- **Requirement:** determine whether `pipeline-core` is installed and loaded, and determine the loaded state: during the SHA phase the commit SHA, from the SemVer phase onward the version (resolution order: `plugin.json` version → marketplace entry → commit SHA).
- **Why:** without the plugin there are no hook guardrails — any write work would run unprotected (the same lesson as the acceptEdits precondition).
- **Verification:** plugin skills are callable (the bootstrap skill itself responding = presence proven); the state is nameable as a concrete SHA/version string, not "something is installed."
- **VERIFIED (main PC, 2026-07-04; laptop cross-check still open):** the machine-readable source for the installed SHA is `~/.claude/plugins/installed_plugins.json` → entry `pipeline-core@agent-pipeline`: field `gitCommitSha` (full SHA), plus `version` (12-char SHA prefix), `installPath` (the cache folder is named after the SHA prefix: `cache/agent-pipeline/pipeline-core/<sha12>/`), `scope` + `projectPath`. Secondary sources: the cache directory name itself; the marketplace clone (`git -C ~/.claude/plugins/marketplaces/agent-pipeline rev-parse HEAD`). **Semantics caveat:** the marketplace clone can run ahead of the installed cache (after `marketplace update` without `plugin update`) — for the LOADED state, `installed_plugins.json` is authoritative; the clone-vs-installed difference is exactly the staleness intermediate stage.

### Step 1b — Set and verify model/effort (Elephant duty)

- **Requirement (profile choice; THIRD OPTION `speed` NEW):** BEFORE setting model/effort, the bootstrap asks the hard profile question (AskUserQuestion UI, 3 options + free text = PO exception):

  > Profile choice (hard, AskUserQuestion, 3 options + free text = PO exception): "Session profile for this topic — Advisor (Cost/Quality) [advisor] (design-tier model throughout from session start + an attached advisor model — default, as long as the advisor model is billed outside your own plan quota) or Design-First (Cost+/Quality+) [design-first] (phase-aware: is the design for this topic ALREADY approved? → go straight to the execution phase, design-tier model at effort `max` from session start, otherwise the design-tier model only for T1 critics/readiness subagents; otherwise design-tier model at effort `xhigh` until the PRD approval gate, then EXACTLY ONE switch to effort `max` — cost consequence: a model outside your own plan quota can cost a noticeable share of an execution session as overage; check your own billing model beforehand, don't assume) or Speed (mini-feature/hotfix) [speed] (implement-tier model + a design-tier advisor active from session start — exact model/effort/advisor commands per `policies/model-policy.md` MP-28; light bootstrap: only ruleset SHA + calibration existence + verify availability + operational handover head, ONE confirmation line instead of three, no profile ceremony; scope ~≤5 files, NO guardrail/canon files, no new dependencies — breaching the boundary ⇒ mandatory escalation to the full profile; guard hooks always stay active; details → §6.5)?"

  The PO decides per the topic of the first prompt. A free-text answer = PO-exception path (e.g. a pure design-tier special session — stays PO-designatable, not a fourth button). Depending on the chosen profile, the commands to present verbatim are shown (shown with the bundled default preset for the design tier, `opus` — the actually configured names come from `pipeline.user.yaml` → `models.*`):

  > Profile advisor (from session start):
  > /model opus
  > /effort max
  > /advisor \<advisor model\>
  >
  > Profile design-first, design already approved (phase-aware) — from session start:
  > /model opus
  > /effort max
  >
  > Profile design-first, design not yet approved (switch at the PRD approval gate):
  > /model opus
  > /effort max
  >
  > Advisor hygiene (design-first, if an advisor is configured):
  > /advisor off
  >
  > Profile speed (from session start, details → §6.5):
  > Model/effort/advisor per `policies/model-policy.md` (MP-28) — fixed mapping, no further profile ceremony.

  **Advisor hygiene (new order):** if an advisor is already running under the `design-first` profile (a leftover from a prior `advisor` profile — an advisor-model user setting persists per machine), the bootstrap checks in this order: (1) ask about parallel advisor sessions of other projects on this machine; (2) prefer the project-local off switch `"advisorModel": ""` in `.claude/settings.local.json` (the live settings validator rejects `null` even though the docs mention it; `$comment` keys are invalid in `settings.local.json`); (3) `/advisor off` ONLY if no parallel session is affected; (4) **divergence = mandatory question (PO condition "one always decides"):** if the ACTUAL advisor state diverges from the intended state of the chosen profile (e.g. a machine-inherited advisor in a design-first session), the bootstrap presents the resolution as an AskUserQuestion (keep advisor / project-local off / `/advisor off`) — silent inheritance is a bootstrap defect; informing without asking does NOT fulfill the duty.
- **Requirement (Elephant, profile-bound):** set and **verify** model/effort per the profile chosen in Step 1b (`policies/model-policy.md` MP-01/MP-17): profile `design-first` → **phase-aware:** if the design for this topic is ALREADY approved (the normal case of a follow-up execution session after an EL-25 cut), the session starts DIRECTLY in the execution phase, `/model opus` + `/effort max` from session start, the design-tier model otherwise only for T1 critics/readiness subagents; otherwise `/model opus` + `/effort xhigh` until the PRD approval gate, then EXACTLY ONCE `/effort max` (EL-24, sanctioned exception MP-17/MP-18); profile `advisor` → already from session start `/model opus` + `/effort max` + advisor activated (MP-26 — default, as long as the advisor model is billed outside the plan quota); profile `speed` (NEW) → model/effort/advisor per `policies/model-policy.md` (MP-28) already from session start — fixed mapping, no phase switch, no advisor-hygiene flow check needed. Effort is **session-only** and must be set anew at every session start. **Notice duty:** `xhigh` remains the design-phase default; `max` is otherwise NOT generically recommended for guardrail/architecture/refactoring sessions — `max` applies only under model-fallback operation, for implement-/mechanic-tier dispatches, for PO-designated special tasks (e.g. initial sessions of entirely new topics; under MP-08 indication the Ultracode task opt-in remains an alternative), or for planned execution-phase operation on the design-tier model (profiles `design-first`/`advisor`). Notice duty now means: name the option when the PO themself flags such a special task — no more proactive pitching. The PO decides.
- **Requirement:** confirm that `CLAUDE_CODE_SUBAGENT_MODEL` is **NOT** set (MP-04) — the env var would override the frontmatter of all subagents and silently defeat the model matrix.
- **Roles:** mandatory for the Elephant (§6.1). Goldfish/Critic get model/effort from agent frontmatter resp. dispatch (MP-02/MP-07) — this step is skipped for them.
- **Model-identity hardening:** the active model identity is confirmed from OBSERVED evidence (`/model` output or explicit PO confirmation), never assumed — especially in the turns immediately following a credit/limit event (risk of a silent fallback to a different model).
- **Verification (profile-bound):** profile `design-first`: before the PRD gate the extra line confirms the design-tier model at `xhigh`; after the gate at `max` plus identity proof (`/model` output). Profile `advisor`: the extra line confirms the design-tier model at `max` AND an attached advisor from session start onward. The extra line of the Elephant confirmation (§6.1) names model/effort/profile/advisor (extended format, see Step 6); deviations from the role default require justification against `policies/model-policy.md`.
- **Requirement (advisor readiness probe, hardening of MP-26g — per PO finding: sessions don't pull the workaround on their own but "want to drop it or switch to the main model"):** in the `advisor` profile, the Elephant actively checks once, AFTER advisor activation, whether the advisor actually responds (a trivial advisor consult at session start — a single, cheap verification question suffices). If this first contact reports `unavailable`/an error, MP-26g applies in exactly this order: (a) IMMEDIATE notice to the PO within the same turn; (b) the `pipeline-core:advisor-consult` skill is set up as the advisory replacement channel for the rest of the session — the skill is the MANDATORY primary path, not an optional suggestion; (c) additionally (not alternatively) the Elephant offers the PO a switch block to an alternative advisor model. No silently continuing without an advisor channel, no unilateral main-model switch as a substitute action.
  - **Verification:** the session notes/handover name the probe result (analogous to the existing post-compact advisor-check convention above, no additional literally-checked line in Step 6) — a probe step skipped in the `advisor` profile is a bootstrap defect.
  - **Live-validation caveat:** the probe itself is so far only specified, not live-verified against a real advisor outage (follow-up — needs a real outage to observe, not a blocker for this specification).
- **Requirement (effort introspection limit):** session effort is NOT machine-introspectable from the inside — unlike the model half, which `/model` output confirms directly (model-identity hardening above). The only reliable source is this bootstrap step itself: a one-time set per the chosen profile + the explicit (possibly PO-confirmed) extra line — there is no introspection tool for it. This gap does NOT block read-only work: it may begin in parallel with a still-pending PO confirmation (a practiced, hereby codified handling).

### Step 1c — Spend/usage check (Elephant; optional-recommended)

- **Requirement (should):** at session start, check the budget situation: set `/usage-credits`/workspace limits, known weekly-limit pressure (MP-16). A set or near limit is **documented once in the confirmation output**; under acute budget pressure, name the consequence (delegation-first: execution on the implement-/mechanic tier, design tier for judgment only — MP-22). **Extra duty on model fallback:** if a model fallback (esp. to a different configured model) is on the table at session start, the limit claim MUST be verified against current `/usage` values — limit percentage AND reset time are named concretely to the PO; a fallback decision based on unverified/stale limit information is a violation. For the mechanic "`/usage` is a user command → ask once" see the sentence in Verification below (already included there, not duplicated; likewise in SKILL.md Step 1c). The switch/cutover itself remains the PO's situational decision — NO codified auto-cutover at reset (MP-17: a mid-session model switch invalidates the warm cache).
- **Why:** two documented incidents from this pipeline's own development: a spend-limit abort mid-run (resumed) and noticeable weekly-limit pressure in a later phase. Budget surprises mid-work cost runs and quality; the check belongs at session start, not at task end.
- **Verification (should-rule):** omitting the step is permitted (optional-recommended). IF it is executed, the confirmation output contains the limit note or explicitly "no limit set/known" — a false or invented note is a violation, a missing one is not. `/usage` is a user command: if the session cannot see the value itself, it asks once instead of guessing (three-valued honesty). **In a model-fallback session, the 1c output names BOTH values** (limit-% + reset time); a fallback note without both values counts as the step not executed. Evidence from this pipeline's own development: a multi-hour fallback session run against an unverified "main model locked" assumption, while the actual limit had long since had headroom again after an intervening reset.

### Step 1d — Role prohibitions (Elephant)

- **Requirement (Elephant):** before starting work, confirm the Elephant's role prohibitions as a compact, directly embedded list (NO extra file reading at runtime — token economy):
  - **EL-01** — no production code; sole exception: the Tier-0 fast path per `docs/operating-model.md` §3.3; further exceptions only by the PO.
  - **EL-02** — no step-by-step micromanagement; delegation happens once, via the 6-field briefing.
  - **EL-03** — judgment stays at the right level (never take over the PO's judgment, never push it down, never outsource the gate).
  - **EL-04** — no silent fundamental decisions (register + ADR, otherwise the decision doesn't exist).
  - **EL-16** — delegate-first in the execution phase: EVERY implementation runs as a briefed implement-/mechanic-tier Goldfish dispatch; "small/interlocked" is NOT an exception — interlocked mini-features get bundled into ONE briefing; design-phase thinking stays Elephant work.
  - **EL-18** — one repo, one Elephant; cross-repo needs go through the transfer path.
  - **EL-19** — PO gate: present the PRD PROACTIVELY readable after the readiness check (not just a file path; remote sessions: send/render to the device) and explicitly wait for the word "approved" — no implementation before it arrives.
- **Why:** exactly these prohibitions were actually violated in a real `<PROJECT_B>` session — neither bootstrap, close, nor Critic caught it, because the bootstrap never loaded the role prohibitions. The embedded list makes them unmissable at session start instead of relying on memory.
- **Roles:** mandatory for the Elephant. Goldfish/Critic get their prohibitions via the dispatch briefing (field 4 "prohibitions" resp. the respective role contract) — this step is skipped for them as a separate bootstrap act.
- **Verification:** the third confirmation line (→ §6.1) names the role prohibitions verbatim; its absence shows Step 1d wasn't executed.

This step ends in a **third mandatory confirmation line** (printed directly under the model/effort line; literally checked like line 1 — format → §6.1):

> "Role prohibitions loaded: EL-01/EL-02/EL-03/EL-04/EL-16/EL-18/EL-19 — implementation only via Goldfish dispatch (Tier-0 per OM §3.3; further exceptions only by the PO); PRD gate: present readably + wait for 'approved'"

### Step 2 — Staleness check against the marketplace remote

- **Requirement:** compare the installed state with the remote HEAD of the marketplace repo, e.g. `git ls-remote <marketplace-url> HEAD`. The URL is in the project's committed `.claude/settings.json` (`extraKnownMarketplaces` entry) — the skill can derive it from there, no hardcoding.
- **Note (mechanism, only on a STALE warning from the SessionStart hook):** if the plugin's SessionStart hook reports a STALE warning IN THIS SESSION naming the installed SHA and remote SHA by name, Step 2 may adopt that result as equivalent evidence instead of re-running `ls-remote` itself. The real hook output otherwise only has a constant fresh-path bootstrap line without SHAs — it looks identical whether the SHAs match or the hook fired fail-open for lack of resolvability, and is therefore NOT usable as substitution proof. If only that constant line is present, or no hook output exists at all, Step 2 still requires its own `ls-remote`.
- **Why:** third-party marketplaces don't auto-update; without this check, two-machine cache drift replaces the old copy-paste drift.
- **Verification:** SHA match = current. Mismatch = stale → case **F2**. Remote unreachable → case **F3**. The check needs network + credentials for the private repo (see §5).

### Step 3 — Read the project calibration file (existence check first!)

- **Requirement:** first check that the calibration file **exists** (working name, uniform: `.claude/pipeline.json`), then read it fully. Expected minimum required fields (field sketch → `docs/operating-model.md` §8): verify command(s), autonomy level, branch model, worktree rule, stakes rating, project constraints.
- **Requirement (denies):** project **denies** don't live in the calibration file, but in the committed `.claude/settings.json` resp. the git-guard config — this step checks the denies **there** (existence of the committed permission/guard entries).
- **Why:** the central skills are parameterized and read this file — without it, rituals run with wrong defaults, in the worst case with the wrong project's guardrails.
- **Verification:** file exists and contains the required fields; if missing or incomplete → case **F4**.
- **Decided:** mechanism + field sketch → `docs/operating-model.md` §8; **schema format:** JSON (`.claude/pipeline.json`, shipped with the plugin).

### Step 4 — Read the handover/state file

- **Requirement:** read the project's handover file in full (in the Pipeline repo: `docs/state.md`). It is the **sole authoritative state source**; memory is only a mirror.
- **Why:** the hand-maintained triple baton has provably lied; the pipeline replaces it with one source — so every session must read exactly that one.
- **Verification:** the last-update date is extractable (it goes into the confirmation line). **Drift threshold (default):** a warning applies if the project repo's last commit is NEWER than the handover state AND the delta since then contains at least one non-docs commit (pure docs deltas don't trigger a warning); a project can document a deviating threshold via a `$driftThreshold` comment field in `.claude/pipeline.json` (the default applies if the field is absent).

### Step 5 — Project gates available?

- **Requirement:** check that the project's **one** verify script exists and is basically runnable (existence + callability, e.g. a dry run/help call — not a full gate run at bootstrap).
- **Why:** without a runnable verify, the evidence duty can't be fulfilled — a Goldfish that can't deliver evidence later is wasted token budget; this should surface at session start, not at task end.
- **Verification:** path/command comes from the calibration file (Step 3); existence check passed. If the script is missing → treat like F4 (STOP for write work, offer to create it).

### Step 6 — Emit self-confirmation (format mandatory)

- **Requirement:** emit exactly this line:

  > **"Bootstrap check passed: ruleset \<version/SHA\> loaded · Project \<name\> · Calibration \<file\> · State \<handover-date\> · Role \<Elephant|Goldfish|Critic\>"**

  Defined additions (only these, each appended with "·"):
  - on F3: "· Staleness unchecked (offline, cache state)"
  - on accepted F2: "· NOTE: ruleset stale (\<n\> commits behind remote)"
  - on short bootstrap (same-day, §6.4): "· Staleness same-day cached (full check \<HH:MM\>)"
  - on speed bootstrap (§6.5): "· Profile speed — light bootstrap (details → §6.5)"; the extra lines for model/effort (§6.1) and role prohibitions (§6.1) are omitted here — they still apply unchanged in substance, they're just not repeated as separate lines on the speed path (ONE confirmation line instead of three).
  - on F4 (calibration and/or handover missing — the EXPECTED initial state in projects not yet migrated): the affected field carries the value "MISSING (F4)" instead of a placeholder — i.e. "Calibration MISSING (F4)" resp. "State MISSING (F4)" — PLUS the mandatory suffix "· F4: read-only analysis only until calibration/handover is created".
  - role variants for the "State" field → §6.
- **Why:** the line is the auditable proof of execution — the PO (or a hook) can check any session against it without reading the transcript.
- **Prohibition:** emitting the line without steps 1–5 actually having been carried out. That would be exactly the documented main failure mode "reported done but not checked" — and a Critic checks trajectories.
- **Verification:** the line begins literally with "Bootstrap check passed:" and contains all five fields with concrete values (no placeholder, no "unknown" except in the defined addition cases — F4's "MISSING (F4)" value counts as a defined addition, not a placeholder).

---

## 4. Defined failure modes

| Case | Finding | Behavior (mandatory) |
|---|---|---|
| **F1** | **Ruleset completely missing** (plugin not installed, skills not findable) | **STOP.** Inform the PO. Only **minimal-safe mode** permitted (definition below). No confirmation line — the session counts as not bootstrapped. **Self-application special case:** in the Pipeline repo itself, the checkout IS the source — F1 here only means "plugin not installed": working with the checkout files remains allowed (ruleset + guardrails exist as files), installation via the committed self-binding (`.claude/settings.json`) resp. `claude --plugin-dir` (§5.2) is recommended. |
| **F2** | **Plugin stale** (installed SHA ≠ remote HEAD) | Warn + offer a refresh with a concrete command: `/plugin marketplace update agent-pipeline` and `claude plugin update pipeline-core` (for **project-scoped** installs: `claude plugin update pipeline-core@agent-pipeline --scope project` — the unscoped command fails there with "not found," default scope is user; empirically observed), then `/reload-plugins`. Continuing work is allowed, **except** the delta contains guardrail/hook changes (paths `hooks/`, `agents/`, permission specs) — then refresh first, then work. Verification for the delta: in the local checkout of the central repo, `git fetch` + `git log --name-only <installed>..origin/main`; if no checkout exists, default-safe applies: **when in doubt, refresh** (the refresh is cheap, the risk of stale guardrails is not). The confirmation line carries the NOTE addition. |
| **F3** | **Offline / remote unreachable** | Warn + continue working with the cache state (the cache is a complete copy, everyday operation is offline-capable). Catch up the staleness check at the next connectivity (at the latest at the next bootstrap). The confirmation line carries the offline addition. |
| **F4** | **Calibration or handover file missing** | **STOP for write work.** Offer to create it from the central template (templates live in the Pipeline repo/plugin). Read-only analysis remains allowed. **The confirmation line is still printed** (F4 is the expected initial state, not a bootstrap failure — unlike F1): affected field = "MISSING (F4)" + mandatory suffix, format in Step 6. Newly created files must be named to the PO for confirmation (new calibration = a project policy decision, not a unilateral agent act). |
| **F5** | **Crash recovery** (traces of a not-cleanly-closed run: orphaned worktrees per `git worktree list`, open WIP/🟡 items, or in-flight dispatches per the handover, unresolved "to be filled in at close" telemetry placeholders) | **Report BEFORE starting work.** The bootstrap scans for worktree remnants and open WIP items while reading the handover (Step 4) and lists findings explicitly — never clean up silently, never pass over silently. The PO or the Elephant decides: clean up, continue, or log as an open item in the handover. Then normal bootstrap completion. |

**Why F2 has the guardrail exception:** a stale ruleset with old hooks means the session works under **weaker protection rules than decided** — exactly the state the pipeline is meant to abolish. Feature/docs deltas can wait; protection deltas cannot.

**Minimal-safe mode (F1 only):**

- **Allowed:** reading (Read/Glob/Grep), read-only git (`status`, `log`, `diff`), diagnosing the plugin install (`/plugin` menu, settings inspection).
- **Forbidden:** edits/writes, commits, push, running write-scripts, any change to `.claude/` files or settings.
- **Why:** without hook guardrails there is no technical enforcement layer — only reading is defensible without it.

---

## 5. Refresh ritual and initial binding per machine

### 5.1 Initial binding (once per machine per project)

**Preconditions (requirement, check first):**

1. **Online** — the initial binding clones the marketplace repo; it fails offline.
2. **Credentials for the private marketplace repo** present: `gh auth status` green resp. a Git credential-manager entry for github.com (check on every own machine beforehand).

**Flow:**

1. **Deterministic path (recommended, for kickoffs/fresh clones — scriptable, non-interactive, idempotent, documented CLI subcommands):** clone/pull the project repo, then `claude plugin marketplace add {{REPO_OWNER}}/agent-pipeline --scope project` → `claude plugin install pipeline-core@agent-pipeline --scope project` (**`--scope project` is mandatory:** the subcommands default to `--scope user`, but the binding lives in the project scope, otherwise "not installed at scope user") → readback proof `claude plugin list --json` (install + version + enabled status) → session restart resp. `/reload-plugins`, then `/pipeline-core:pipeline-start` as load proof (F1 check).
2. **Trust path — not reliable, don't use as the sole mechanism:** trusting the folder in Claude Code CAN trigger the install prompt from the committed `.claude/settings.json` (`extraKnownMarketplaces` + `enabledPlugins`) — but the prompt is tied to the trust-dialog **event**, not to session start: a folder already trusted earlier gets NO prompt for a binding committed only later (documented gap, GitHub issues #23737/#13096). If it does appear and is confirmed, that fulfills the same mandatory step as the deterministic path above — since v2.1.195 an externally sourced, project-side-enabled plugin must be **explicitly installed once per user**, but only the deterministic path above fulfills this duty without depending on the prompt; hence it is the standard, not the trust path.
3. **Set once:** `CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE=1` (user env on every own machine). Why: without the switch, Claude Code discards the marketplace clone on a failed `git pull` (e.g. triggered offline) — the last good state would be lost.
4. Deliberately leave auto-update **on the "off" default.** Why: explicit, deterministic refreshes instead of background magic; the staleness check (Step 2) makes drift visible regardless, and offline robustness stays maximal. (⚠ UNCERTAIN whether `autoUpdate` in project settings even has an effect. Also why: don't rely on it.) **Private marketplaces:** should auto-update ever be enabled, its background updates run WITHOUT the git credential helper and need `GITHUB_TOKEN`/`GH_TOKEN` in the environment — otherwise a silent failure at startup (documented, plugin-marketplaces.md §Private repositories). Manual commands (like the deterministic path above) use the normal git credentials from the preconditions instead.

**If the install prompt doesn't appear (state "binding committed, project install missing," i.e. the trust path above — step 2 — was tried and produced no prompt):** empirically confirmed (in a real `<PROJECT_B>` session): trusted folder + committed binding + a plain session RESTART do NOT reliably trigger the install prompt (cost a session start + detour there). **Primary rescue path for this trust branch** (interactive, no improvising): open the `/plugin` menu → confirm install → `/reload-plugins`. For kickoffs/fresh clones the deterministic CLI path (step 1) is the standard anyway and sidesteps this prompt problem entirely; this menu path is the reliable interactive way out when the trust path was used instead and the prompt didn't appear.

### 5.2 Ongoing refresh ritual

| Situation | Ritual |
|---|---|
| **Normal case** (a pipeline change was pushed on machine A) | On machine B, at the next bootstrap, Step 2 reports "stale" → `/plugin marketplace update agent-pipeline` + `claude plugin update pipeline-core`, in the running session `/reload-plugins`. |
| **Committed binding, project install missing** (trust + a plain session restart do NOT reliably trigger the install prompt — real `<PROJECT_B>` finding) | **PRIMARY path** (see §5.1): `/plugin` menu → confirm install → `/reload-plugins`. |
| **Working on the ruleset itself** (only on the machine with an active checkout of the central repo) | `claude --plugin-dir <checkout>/plugins/pipeline-core` + `/reload-plugins` — the local copy overrides the installed version for the session. Rolling out = commit + push; the other machine catches up via the normal-case ritual. |
| **After every refresh** | Repeat bootstrap steps 1–2 (new SHA in the confirmation line) — otherwise the refresh isn't proven. |

**Requirement:** the refresh is an **explicit act with a protocol trace** (confirmation line with the new SHA), not a side effect. **Why:** during the SHA phase, the refresh timestamp is the only version boundary — without a trace it's not reconstructible which ruleset state accompanied a piece of work (relevant for Critic trajectory review and cost/error analysis).

**Expectation note (`/reload-plugins`):** the command can report "0 skills" (or an apparently empty skill count) even though the skills are then perfectly callable (real `<PROJECT_B>` finding) — this is not a bug indicator. Effectiveness is checked by actually calling a skill, not by the message.

---

## 6. Role variants

**Loading principle (lean session start):** a session loads/reads ONLY the section for its ACTIVE role (§6.1 Elephant, §6.2 Goldfish, §6.3 Critic, plus §6.4/§6.5 as Elephant profile variants where applicable) — not the full role text of all three roles up front. This applies to this document as well as to the executable form (`plugins/pipeline-core/skills/pipeline-start/SKILL.md`). No step is dropped by this — it just means no foreign role material gets read along. **Measurable goal: context after bootstrap ≤ ~75k tokens (measured via status line), versus previously >150k.**

| Step | Elephant | Goldfish | Critic |
|---|---|---|---|
| 1 Plugin presence + state | ✓ full | ✓ compact (guardrails active? state = SHA named in the briefing) | ✓ compact (confirm read-only toolset) |
| 1b Set + verify model/effort (incl. `CLAUDE_CODE_SUBAGENT_MODEL` unset) | ✓ mandatory | — n/a (frontmatter/dispatch, MP-02) | — n/a (frontmatter/dispatch, MP-07) |
| 1c Spend/usage check (MP-16, limit note once) | ✓ recommended | — n/a | — n/a |
| 1d Role prohibitions (embedded, compact) | ✓ mandatory | — n/a (prohibitions come via the dispatch briefing) | — n/a (prohibitions come via the dispatch briefing) |
| 2 Staleness check | ✓ mandatory | — n/a (Elephant fixed the state at dispatch) | — n/a |
| 3 Calibration | ✓ mandatory | ✓ as far as referenced in the briefing | partial: only guardrail/constraint portions as a check standard |
| 4 Handover/state | ✓ mandatory (full) | **✗ forbidden** — briefing replaces handover | **✗ forbidden** — no handover, no history |
| 5 verify gates | ✓ mandatory | ✓ mandatory (needs it for evidence) | — n/a (Critic runs no gates, it checks their evidence) |
| 6 Confirmation | ✓ full + extra line | ✓ compact (one line) | ✓ compact (one line) |

### 6.1 Elephant bootstrap (full)

All mandatory steps including **1b** (set and verify model/effort per model-policy — effort `xhigh` is session-only; confirm `CLAUDE_CODE_SUBAGENT_MODEL` unset) and **1d** (role prohibitions, see below); plus — optional-recommended, not a mandatory part — **1c** (spend/usage check: document a set/near limit once). Additionally, per MP-17 ("fix model + effort at session start") and the profile/advisor extension from Step 1b, a **second line** directly under the confirmation:

> Model/Effort: {{MODEL}} / {{EFFORT}} (per policies/model-policy.md) · Profile {{advisor|design-first|PO exception}} · Advisor {{ADVISOR|off}}

Directly below that, per **1d**, a **third line**:

> "Role prohibitions loaded: EL-01/EL-02/EL-03/EL-04/EL-16/EL-18/EL-19 — implementation only via Goldfish dispatch (Tier-0 per OM §3.3; further exceptions only by the PO); PRD gate: present readably + wait for 'approved'"

The Elephant must additionally be able to speak to the session-lifecycle policy (Elephant retention at full context, Goldfish cadence — a mandatory part of the operating model, → `docs/operating-model.md`); the bootstrap loads no extra files for this, the policy ships with the ruleset.

### 6.2 Goldfish bootstrap (briefing instead of handover)

- **The Elephant's briefing replaces reading the handover.** Prohibition: reading the handover/state file or history artifacts. Why: context economy and contract clarity — the briefing (goal · context files · DoD checks · prohibitions · stop conditions · dispatch metadata; canonical field list: `docs/operating-model.md` §2.3) is the complete assignment; whatever isn't in it doesn't belong in the Goldfish's context.
- The briefing **must name the ruleset SHA** (mandatory field "dispatch metadata," → `docs/operating-model.md` §2.3) under which it was dispatched; the Goldfish carries it into its confirmation (no own remote check — network/time cost sits with the Elephant, once per dispatch wave instead of once per Goldfish).
- **Compact confirmation** (one line, field "State" carries the briefing reference):

  > "Bootstrap check passed: ruleset \<SHA from briefing\> loaded · Project \<name\> · Calibration \<file\> · State briefing \<task-id/date\> · Role Goldfish"

- **Verification:** if the SHA is missing from the briefing, that's a briefing defect → back to the Elephant (stop condition), not researched independently.

### 6.3 Critic bootstrap (spec + diff + guardrails only)

- **Input is exhaustively defined:** spec, diff, guardrails/constraints (incl. relevant calibration portions as a check standard) and the evidence artifacts of the work under review. **Explicitly NO handover, NO chat history, NO implementor rationale.** Why: the Critic is meant to judge independently — history context creates exactly the anchoring effects it's meant to neutralize.
- No staleness check: the Critic checks against the state the assignment names it; keeping the ruleset current is the Elephant's duty.
- Confirmation that **no write tools** are available (read-only subagent, possibly `--bare` tier for critical diffs) — if writing is possible, the bootstrap has failed (wrong agent definition loaded).
- **Compact confirmation** (field "State" deliberately omitted):

  > "Bootstrap check passed: ruleset \<SHA from assignment\> loaded · Project \<name\> · Calibration \<file|n/a\> · State n/a (Critic sees no history) · Role Critic"

### 6.4 Short bootstrap (same-day light bootstrap, Elephant)

**Preconditions (ALL must hold, otherwise full bootstrap):**

1. Same machine AND same calendar day as a documented FULL bootstrap (evidence: the topmost session block of the project's handover file records this bootstrap with a date).
2. Loaded ruleset SHA unchanged versus that full bootstrap.
3. No plugin refresh/reload since (after every F2 refresh or `/reload-plugins`, the full path applies again mandatorily — unchanged contract).

**Light form** (deviates from the full path in §3 ONLY as follows; all unlisted steps run unchanged):

- **Step 1:** local SHA only (no `ls-remote`).
- **Step 1b:** unchanged (mandatory) — **the profile question repeats at EVERY bootstrap**, even on the short path: it's cheap (one UI question) and a profile switch mid-day is a new session anyway.
- **Step 1d:** unchanged (embedded, cheap).
- **Step 2:** SKIPPED, with mandatory suffix `· Staleness same-day cached (full check <HH:MM>)` (see Step 6, list of permitted additions).
- **Step 3:** existence check only.
- **Step 4:** only the handover HEAD block + topmost session block — UNLESS the handover file has changed since the full bootstrap (newer commits/date) → then full reading.
- **Step 5:** existence check only.
- **Step 6:** confirmation line as usual + the suffix from Step 2 above.

**Why:** a full bootstrap already completed the same calendar day on the same machine makes the expensive check steps (remote staleness, full handover reading) redundant — PROVIDED ruleset state and handover state are provably unchanged since; the three preconditions are the proof duty for that, not a shortcut by feel.

### 6.5 Speed bootstrap (mini-feature/hotfix, Elephant)

**Origin:** the third profile option alongside `advisor`/`design-first` in Step 1b (§3) — for genuinely small, tightly scoped diffs (mini-feature/hotfix), not for architecture/guardrail work.

**Precondition:** the PO selects the `speed` option in the Step-1b profile question. Unlike the short bootstrap (§6.4), speed is NOT tied to "same day/same machine" — it's a question of task sizing (mini-feature/hotfix), not cache freshness.

**Scope (hard limits — breach triggers mandatory escalation):**

- Mini-feature/hotfix scope only: **~≤5 affected files.**
- **NO guardrail/canon files** in scope — canonical list of forbidden file-classes for the `speed` profile: `policies/model-policy.md` (MP-28); not re-enumerated here to avoid divergence.
- **No new dependencies.**
- If any of these limits becomes visible during the session (scope grows beyond the sizing): **mandatory escalation to the full profile** — switch immediately to the full bootstrap/full process, don't keep working on the speed path (escalation logic analogous to `harness/checklists/small-session.md`, section "Escalation rule").
- **The guard hooks stay fully active in EVERY profile, including `speed`** (deterministic, free) — speed saves ceremony, not safety.

**Light form of the bootstrap** (deviates from the full path in §3 ONLY as follows; all unlisted steps run unchanged resp. are dropped as specified below):

- **Step 1:** local ruleset SHA only (no `ls-remote`).
- **Step 1b:** the profile question itself runs normally (that IS already the speed choice); afterward the advisor-hygiene check and the readiness probe are DROPPED (both are `advisor`-profile-specific) — the model/effort/advisor pairing is fixed in the speed profile (`policies/model-policy.md`, MP-28), set once, no extra questions.
- **Step 1c:** dropped (no spend/usage check as a separate act).
- **Step 1d:** dropped as a separate confirmation line — the role prohibitions (EL-01/EL-02/EL-03/EL-04/EL-16/EL-18/EL-19) still apply unchanged in substance, they're just not repeated as their own line on the speed path.
- **Step 2:** dropped entirely (no remote staleness check).
- **Step 3:** existence check of the calibration file only (no full reading).
- **Step 4:** only the operational head of the handover file (no full reading of the session history).
- **Step 5:** existence/callability check of verify only.
- **Step 6:** **ONE confirmation line instead of three** (format → Step 6, suffix "· Profile speed — light bootstrap").

**Light process** (not just the bootstrap — applies to the whole task): no PRD document; direct dispatch, or for very small fixes a mini-edit (Tier-0 fast path per `docs/operating-model.md` §3.3); a light review tier instead of a full design-tier review — the existing Critic trigger matrix decides as before, not reinvented (→ `harness/checklists/small-session.md` step 3); short close via the **close-light variant** of the `close-block` skill (`plugins/pipeline-core/skills/close-block/SKILL.md`) — its own hard eligibility gate applies unchanged, speed doesn't override it.

**Why:** a mini-feature or a hotfix used to run through the same heavy ceremony as an architecture overhaul — a breach of the proportionality guardrail. Speed saves the ceremony without touching a single deterministic guardrail.

---

## 7. Open items

- **PARTIALLY DONE:** the machine-readable source for the installed plugin SHA is verified on the main PC: `~/.claude/plugins/installed_plugins.json`, field `gitCommitSha` (details → Step 1). Naming the source in the `/pipeline-core:pipeline-start` skill has been backfilled. **Only the laptop cross-check remains OPEN** (two-machine validation, Sprint 1).
- **DONE:** SessionStart hook wired up — `plugins/pipeline-core/hooks/staleness-check.mjs` (matcher `startup|resume|clear`, timeout 15s, fail-open, read-only) injects the bootstrap prompt line (anchoring 1) and, on staleness, the SHA finding (Step-2 substitution, see there); passed the T1 Critic path. Only the two-machine E2E remains open (laptop; Sprint 1).
- **Decided:** mechanism and field sketch of the project calibration file are in `docs/operating-model.md` §8 (working name `.claude/pipeline.json`). **Schema format decided (shipped with the plugin):** JSON (`.claude/pipeline.json`); the `pipeline-start`/`close-block` skills read this format.
- **Decided:** handover file canonicalized (convention `docs/state.md`), relationship to HISTORY fixed — → `docs/operating-model.md` §6 + ADR-0012. **OPEN (Phase 4):** only the handover template + the final template name per project remain.
- **DONE:** the handover drift-check threshold (Step 4) calibrated — default "HEAD newer than handover AND ≥1 non-docs commit in the delta," per-project override via `$driftThreshold` in `.claude/pipeline.json`.
- **⚠ UNCERTAIN:** whether `autoUpdate` on the `extraKnownMarketplaces` entry has any effect outside managed settings — hence this protocol relies on explicit refreshes; re-evaluate the ritual in §5 if the docs situation changes.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# Session-Bootstrap-Protokoll

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · Stand 2026-07-03

**Status:** Verbindliches Harness-Protokoll. Erfüllt die Missions-Pflicht „Bootstrap-Doku" — den Plugin-Stand (SHA/Version) anzeigen, ihn gegen den Remote-Stand prüfen, Offline-Verhalten und Refresh-Ritual definieren. Gilt für **jede neue Session in jedem angebundenen Projekt** (<PROJECT_A>, <PROJECT_B>, <PROJECT_C>, Pipeline-Repo selbst), auf beiden Rechnern, unabhängig von lokalen Pfaden. Die ausführbare Form entsteht in Phase 3 als Skill (agent-facing, englisch — → ADR-0011 Sprache in docs/adr/); dieses Dokument ist die menschenlesbare Spezifikation und bei Abweichungen die Referenz.

---

## 1. Zweck

Jede neue Session muss drei Dinge sicherstellen, **bevor** sie arbeitet:

1. **Regelwerk geladen und aktuell:** Das Plugin `pipeline-core` (Skills, Agents, Hook-Guardrails) ist installiert, und sein Stand entspricht dem Remote-Stand des zentralen Repos.
2. **Projekt-Kontext geladen:** Projekt-Kalibrierung (die dünne projektspezifische Schicht) und Handover-Stand sind gelesen.
3. **Prüfbarer Vollzug:** Eine formatierte Selbstbestätigung macht den Bootstrap auditierbar — fehlt die Zeile, hat kein Bootstrap stattgefunden.

**Warum ein eigenes Protokoll:** Der Plugin-Cache ist eine **Kopie pro User pro Maschine**. Ein Push ins zentrale Repo propagiert **nicht** automatisch — Auto-Update ist für eigene Marketplaces per Default aus, und in der SHA-Phase zählt jeder Commit als neue Version, die erst ein manueller Refresh abholt. Auf zwei Rechnern entsteht so **Cache-Drift**: Rechner B arbeitet mit alten Guardrails, ohne es zu merken — die alte Copy-Paste-Drift in neuer Form. Der Bootstrap-Check macht diese Drift bei jedem Sessionstart sichtbar, statt auf Disziplin zu hoffen.

---

## 2. Mechanismus-Entscheid: drei Schichten

Kompaktfassung; vollständige Abwägung mit allen Kriterien → **ADR-0010** in docs/adr/.

| Schicht | Träger | Liefert | Warum dieser Träger |
|---|---|---|---|
| **Verhalten** | Plugin `pipeline-core` aus dem Marketplace-Repo `agent-pipeline` | Skills, Agents, Hooks (harte Guardrails) | Einziger Mechanismus mit Versionierung, Pinning **und** Hook-Verteilung; pfadunabhängig via User-Cache |
| **Bindung** | Committete `.claude/settings.json` je Projekt (`extraKnownMarketplaces` + `enabledPlugins`) | Deklaration „dieses Projekt nutzt diese Standards" | Jedes Projekt-Repo ist self-describing: frischer Klon auf Rechner 2 (oder CI/Cloud) trägt die Bindung mit; Install-Prompt beim Bestätigen des Ordners als vertrauenswürdig |
| **Stand** | Handover-Datei je Projekt (kanonischer Name/Ort → docs/operating-model.md); im Pipeline-Repo: docs/state.md | Was gerade gilt, was offen ist, was zuletzt entschieden wurde | EINE versionierte Quelle statt dreifach handgepflegtem Staffelstab |

Versionierung: zunächst **SHA-basiert** (jeder Commit propagiert bei Refresh), SemVer + Tags ab Stabilitätsphase.

**Bewertete Alternativen** (je 1 Satz Warum-nicht-allein; Details → ADR-0010 in docs/adr/):

- **Globales `~/.claude` allein:** wirkt auf alle Projekte gleich ohne Pro-Projekt-Bindung, und die Projekte sind nicht self-contained — ein frischer Klon (Rechner 2, CI) trägt die Standards nicht mit.
- **`@`-Imports allein:** verteilen nur Instruktionstext, keine Hooks/Agents — harte Guardrails blieben unerzwungen, denn CLAUDE.md ist offiziell „context, not enforced configuration".
- **Eingecheckte `.claude/`-Kopien je Projekt:** exakt das belegte Anti-Pattern — mehrere guard-git-Inkarnationen können nachweislich divergieren, ohne dass eine davon Superset der anderen ist.
- **SessionStart-Hook allein:** kann Kontext injizieren, aber der Hook selbst muss erst einmal ins Projekt kommen — Hooks verteilen sich nur über User-Settings oder Plugins, also Henne-Ei ohne die Plugin-Schicht.

Der SessionStart-Hook ist deshalb nicht der Verteilmechanismus, sondern ein **Baustein der Durchsetzung** dieses Protokolls (siehe §3, Verankerung).

---

## 3. Bootstrap-Ablauf

Als Skill implementiert (Phase 3): **`/pipeline-core:pipeline-start`** (kanonischer Name; die Auflösung der früheren Arbeitsnamen ist im Skill-Kopf dokumentiert — `plugins/pipeline-core/skills/pipeline-start/SKILL.md`). Wo der Skill nicht installiert ist, gilt der Ablauf als manuelle Checkliste (`templates/prompts/session-bootstrap-check.md`).

**Verankerung (wie das Protokoll sich selbst durchsetzt):**

1. Ein **SessionStart-Hook** aus dem Plugin fordert die Ausführung des Bootstrap-Skills an — deterministisch, sobald das Plugin geladen ist (Muster „Kontext injizieren").
2. **Eine Zeile in der Projekt-CLAUDE.md** („Führe zuerst `/pipeline-core:pipeline-start` aus") als advisory Fallback. Schlägt die Skill-Invokation fehl („unknown skill"), ist genau das der Nachweis von Fall **F1** (Regelwerk fehlt) — der Fallback detektiert also die Abwesenheit der Hauptschicht.
3. Die **Bestätigungszeile** (Schritt 6) macht den Vollzug für den PO und für Hooks prüfbar.

### Schritt 1 — Plugin-Präsenz + geladenen Stand ermitteln

- **Gebot:** Stelle fest, ob `pipeline-core` installiert und geladen ist, und ermittle den geladenen Stand: in der SHA-Phase den Commit-SHA, ab SemVer-Phase die Version (Auflösungsreihenfolge: `plugin.json`-Version → Marketplace-Eintrag → Commit-SHA).
- **Warum:** Ohne Plugin keine Hook-Guardrails — jede schreibende Arbeit liefe ungeschützt (dieselbe Lektion wie die acceptEdits-Vorbedingung).
- **Prüfweise:** Plugin-Skills sind aufrufbar (der Bootstrap-Skill selbst antwortet = Präsenz belegt); der Stand ist als konkreter SHA/Versionsstring benennbar, nicht als „irgendwas ist installiert".
- **VERIFIZIERT (Haupt-PC, 2026-07-04; Laptop-Gegenprobe noch offen):** Maschinenlesbare Quelle für den installierten SHA ist `~/.claude/plugins/installed_plugins.json` → Eintrag `pipeline-core@agent-pipeline`: Feld `gitCommitSha` (voller SHA), dazu `version` (12-stelliges SHA-Präfix), `installPath` (der Cache-Ordner ist nach dem SHA-Präfix benannt: `cache/agent-pipeline/pipeline-core/<sha12>/`), `scope` + `projectPath`. Sekundärquellen: der Cache-Verzeichnisname selbst; der Marketplace-Klon (`git -C ~/.claude/plugins/marketplaces/agent-pipeline rev-parse HEAD`). **Achtung Semantik:** Der Marketplace-Klon kann dem installierten Cache vorauslaufen (nach `marketplace update` ohne `plugin update`) — für den GELADENEN Stand ist `installed_plugins.json` maßgeblich; die Klon-vs-installed-Differenz ist genau die Staleness-Zwischenstufe.

### Schritt 1b — Modell/Effort setzen und verifizieren (Elephant-Pflicht)

- **Gebot (Profilwahl; DRITTE OPTION `speed` NEU):** VOR der Modell-/Effort-Setzung stellt der Bootstrap die harte Profil-Frage (AskUserQuestion-UI, 3 Optionen + Freitext = PO-Ausnahme):

  > Profilwahl (hart, AskUserQuestion, 3 Optionen + Freitext = PO-Ausnahme): „Session-Profil für dieses Thema — Advisor (Cost/Quality) [advisor] (Design-Tier-Modell durchgehend ab Sessionbeginn + angehängtem Advisor-Modell — Standard, solange das Advisor-Modell außerhalb des eigenen Plan-Kontingents abgerechnet wird) oder Design-First (Cost+/Quality+) [design-first] (phasenbewusst: Design für dieses Thema BEREITS freigegeben? → direkt Ausführungsphase, Design-Tier-Modell bei Effort `max` ab Sessionbeginn, Design-Tier-Modell sonst nur für T1-Critics/Readiness-Subagenten; sonst Design-Tier-Modell bei Effort `xhigh` bis zum PRD-Freigabe-Gate, dann GENAU EIN Wechsel auf Effort `max` — Kostenfolge: ein Modell außerhalb des eigenen Plan-Kontingents kann einen spürbaren Anteil einer Ausführungssession als Overage kosten; das eigene Abrechnungsmodell vorher prüfen, nicht annehmen) oder Speed (Mini-Feature/Hotfix) [speed] (Implement-Tier-Modell + ein ab Sessionbeginn aktiver Design-Tier-Advisor — exakte Modell-/Effort-/Advisor-Kommandos gemäß `policies/model-policy.md` MP-28; leichter Bootstrap: nur Regelwerk-SHA + Kalibrierungs-Existenz + verify-Verfügbarkeit + operativer Handover-Kopf, EINE Bestätigungszeile statt drei, keine Profil-Zeremonie; Geltungsbereich ~≤5 Dateien, KEINE Guardrail-/Kanon-Dateien, keine neuen Abhängigkeiten — Grenze gerissen ⇒ Pflicht-Eskalation ins Vollprofil; Guard-Hooks bleiben immer aktiv; Details → §6.5)?"

  Der PO entscheidet je Thema des ersten Prompts. Freitext-Antwort = PO-Ausnahme-Pfad (z. B. eine reine Design-Tier-Sondersession — bleibt PO-designierbar, kein vierter Button). Je nach gewähltem Profil werden die verbatim vorzulegenden Kommandos präsentiert (gezeigt mit dem mitgelieferten Default-Preset für das Design-Tier, `opus` — die tatsächlich konfigurierten Namen stammen aus `pipeline.user.yaml` → `models.*`):

  > Profil advisor (ab Sessionbeginn):
  > /model opus
  > /effort max
  > /advisor \<advisor model\>
  >
  > Profil design-first, Design bereits freigegeben (phasenbewusst) — ab Sessionbeginn:
  > /model opus
  > /effort max
  >
  > Profil design-first, Design noch nicht freigegeben (Wechsel am PRD-Freigabe-Gate):
  > /model opus
  > /effort max
  >
  > Advisor-Hygiene (design-first, falls Advisor konfiguriert):
  > /advisor off
  >
  > Profil speed (ab Sessionbeginn, Details → §6.5):
  > Modell/Effort/Advisor gemäß `policies/model-policy.md` (MP-28) — fixe Zuordnung, keine weitere Profil-Zeremonie.

  **Advisor-Hygiene (neue Reihenfolge):** Läuft im Profil `design-first` bereits ein Advisor (Rest eines vorherigen `advisor`-Profils — ein Advisor-Modell-User-Setting persistiert je Maschine), prüft der Bootstrap in dieser Reihenfolge: (1) Frage nach parallelen Advisor-Sessions anderer Projekte auf dieser Maschine; (2) bevorzuge den projekt-lokalen Off-Schalter `"advisorModel": ""` in `.claude/settings.local.json` (der Live-Settings-Validator lehnt `null` ab, obwohl die Doku es nennt; `$comment`-Schlüssel sind in `settings.local.json` ungültig); (3) `/advisor off` NUR, wenn keine parallele Session betroffen ist; (4) **Divergenz = Pflichtfrage (PO-Bedingung „man entscheidet immer"):** weicht der TATSÄCHLICHE Advisor-Zustand vom beabsichtigten Zustand des gewählten Profils ab (z. B. maschinen-vererbter Advisor in einer design-first-Session), legt der Bootstrap die Auflösung als AskUserQuestion vor (Advisor behalten / projekt-lokal aus / `/advisor off`) — stille Vererbung ist ein Bootstrap-Defekt, Informieren ohne Fragen erfüllt die Pflicht NICHT.
- **Gebot (Elephant, profilgebunden):** Setze und **verifiziere** Modell/Effort gemäß dem in Schritt 1b gewählten Profil (`policies/model-policy.md` MP-01/MP-17): Profil `design-first` → **phasenbewusst:** ist das Design für dieses Thema BEREITS freigegeben (Regelfall einer Folge-Ausführungssession nach EL-25-Schnitt), startet die Session DIREKT in der Ausführungsphase, `/model opus` + `/effort max` ab Sessionbeginn, das Design-Tier-Modell sonst nur für T1-Critics/Readiness-Subagenten; sonst `/model opus` + `/effort xhigh` bis zum PRD-Freigabe-Gate, danach GENAU EINMAL `/effort max` (EL-24, sanktionierte Ausnahme MP-17/MP-18); Profil `advisor` → bereits ab Sessionbeginn `/model opus` + `/effort max` + Advisor aktiviert (MP-26 — Standard, solange das Advisor-Modell außerhalb des Plan-Kontingents abgerechnet wird); Profil `speed` (NEU) → Modell/Effort/Advisor gemäß `policies/model-policy.md` (MP-28) bereits ab Sessionbeginn — fixe Zuordnung, kein Phasenwechsel, keine Advisor-Hygiene-Ablaufprüfung nötig. Effort ist **session-only** und muss bei jedem Sessionstart neu gesetzt werden. **Hinweispflicht:** `xhigh` bleibt der Design-Phase-Standard; `max` wird sonst NICHT generisch für Guardrail-/Architektur-/Refactoring-Sessions empfohlen — `max` gilt nur bei Modell-Fallback-Betrieb, bei Implement-/Mechanic-Tier-Dispatches, für vom PO benannte Sondertasks (z. B. initiale Sessions ganz neuer Themen; bei MP-08-Indikation weiterhin alternativ der Ultracode-Task-Opt-in), oder bei geplantem Ausführungsphasen-Betrieb auf dem Design-Tier-Modell (Profile `design-first`/`advisor`). Hinweispflicht heißt jetzt: die Option benennen, wenn der PO selbst einen solchen Sondertask ausweist — kein proaktives Anpreisen mehr. Der PO entscheidet.
- **Gebot:** Bestätige, dass `CLAUDE_CODE_SUBAGENT_MODEL` **NICHT** gesetzt ist (MP-04) — die Env-Var würde das Frontmatter aller Subagents überschreiben und die Modell-Matrix still aushebeln.
- **Rollen:** Pflicht für den Elephant (§6.1). Goldfish/Critic beziehen Modell/Effort aus Agent-Frontmatter bzw. Dispatch (MP-02/MP-07) — für sie entfällt der Schritt.
- **Modell-Identitäts-Härtung:** Die aktive Modell-Identität wird aus BEOBACHTETER Evidenz bestätigt (`/model`-Ausgabe oder explizite PO-Bestätigung), nie angenommen — insbesondere in den Turns unmittelbar nach einem Credit-/Limit-Ereignis (Risiko eines stillen Fallbacks auf ein anderes Modell).
- **Prüfweise (profilgebunden):** Profil `design-first`: vor dem PRD-Gate bestätigt die Zusatzzeile das Design-Tier-Modell bei `xhigh`; nach dem Gate bei `max` plus Identitätsnachweis (`/model`-Ausgabe). Profil `advisor`: die Zusatzzeile bestätigt von Sessionbeginn an das Design-Tier-Modell bei `max` UND einen angehängten Advisor. Die Zusatzzeile der Elephant-Bestätigung (§6.1) nennt Modell/Effort/Profil/Advisor (erweitertes Format, s. Schritt 6); Abweichungen vom Rollen-Default sind begründungspflichtig gegen `policies/model-policy.md`.
- **Gebot (Advisor-Bereitschaftsprobe, Härtung zu MP-26g — nach PO-Befund: Sessions ziehen den Workaround nicht von selbst, sondern „wollen es weglassen oder auf das Hauptmodell wechseln"):** Im Profil `advisor` prüft der Elephant NACH Advisor-Aktivierung einmalig aktiv, ob der Advisor tatsächlich antwortet (ein trivialer Advisor-Consult zu Sessionbeginn — eine einzige, billige Verifikationsfrage genügt). Meldet dieser erste Kontakt `unavailable`/einen Fehler, gilt MP-26g in genau dieser Reihenfolge: (a) SOFORT-Meldung an den PO binnen desselben Turns; (b) der Skill `pipeline-core:advisor-consult` wird für den Rest der Session als Advisory-Ersatzkanal aufgesetzt — der Skill ist der PFLICHT-Primärpfad, kein optionaler Vorschlag; (c) zusätzlich (nicht alternativ) bietet der Elephant dem PO einen Umschalt-Block auf ein alternatives Advisor-Modell an. Kein stilles Weiterlaufen ohne Advisor-Kanal, kein einseitiger Hauptmodell-Wechsel als Ersatzhandlung.
  - **Prüfweise:** Die Session-Notizen/das Handover nennen das Probe-Ergebnis (analog zur bestehenden Post-Compact-Advisor-Check-Konvention oben, keine zusätzliche literal-geprüfte Zeile in Schritt 6) — ein im Profil `advisor` übersprungener Probe-Schritt ist ein Bootstrap-Mangel.
  - **Live-Validierungs-Vorbehalt:** Die Probe selbst ist bislang nur spezifiziert, nicht live gegen einen echten Advisor-Ausfall verifiziert (Follow-up — braucht einen echten Ausfall zur Beobachtung, kein Blocker für diese Spezifikation).
- **Gebot (Effort-Introspektions-Grenze):** Der Session-Effort ist von innen NICHT maschinen-introspektierbar — anders als die Modell-Hälfte, die `/model`-Ausgabe direkt bestätigt (Modell-Identitäts-Härtung oben). Die einzige verlässliche Quelle ist dieser Bootstrap-Schritt selbst: einmaliges Setzen gemäß dem gewählten Profil + die explizite (ggf. PO-bestätigte) Zusatzzeile — kein Introspektions-Tool, das es nicht gibt. Diese Lücke blockiert read-only-Arbeit NICHT: sie darf parallel zu einer noch ausstehenden PO-Bestätigung beginnen (praktizierter, hiermit kodifizierter Umgang).

### Schritt 1c — Spend-/Usage-Check (Elephant; optional-empfohlen)

- **Gebot (soll):** Prüfe zu Sessionbeginn die Budget-Lage: gesetzte `/usage-credits`-/Workspace-Limits, bekannter Wochenlimit-Druck (MP-16). Ein gesetztes oder nahes Limit wird **einmalig in der Bestätigungs-Ausgabe dokumentiert**; bei akutem Budget-Druck wird die Konsequenz benannt (Delegation-first: Ausführung auf dem Implement-/Mechanic-Tier, Design-Tier nur Judgment — MP-22). **Zusatzpflicht bei Modell-Fallback:** Steht bei Sessionbeginn ein Modell-Fallback (insb. auf ein anderes konfiguriertes Modell) im Raum, MUSS die Limit-Behauptung gegen aktuelle `/usage`-Werte verifiziert werden — Limit-Prozentsatz UND Reset-Zeitpunkt werden dem PO konkret benannt; eine Fallback-Entscheidung auf Basis unverifizierter/veralteter Limit-Information ist ein Verstoß. Für die Mechanik „/usage ist ein User-Kommando → einmalig nachfragen" gilt der Satz in der Prüfweise unten (dort bereits enthalten, nicht duplizieren; ebenso in SKILL.md Schritt 1c). Der Switch/Schnitt selbst bleibt des PO situativer Entscheid — KEINE kodifizierte Schnitt-Automatik am Reset (MP-17: Mid-Session-Modellwechsel invalidiert den warmen Cache).
- **Warum:** Zwei belegte Vorfälle aus der eigenen Entwicklung dieser Pipeline: ein Spend-Limit-Abbruch mitten in einem laufenden Arbeitslauf (per Resume fortgesetzt) und spürbarer Wochenlimit-Druck in einer späteren Phase. Budget-Überraschungen mitten in der Arbeit kosten Läufe und Qualität; der Check gehört an den Sessionstart, nicht ans Taskende.
- **Prüfweise (Soll-Regel):** Das Weglassen des Schritts ist zulässig (optional-empfohlen). WIRD er ausgeführt, enthält die Bestätigungs-Ausgabe den Limit-Vermerk oder explizit „kein Limit gesetzt/bekannt" — ein falscher oder erfundener Vermerk ist ein Verstoß, ein fehlender nicht. `/usage` ist ein User-Kommando: Kann die Session den Wert nicht selbst einsehen, fragt sie einmalig nach, statt zu raten (dreiwertige Ehrlichkeit). **In einer Modell-Fallback-Session nennt die 1c-Ausgabe BEIDE Werte** (Limit-% + Reset-Zeitpunkt); ein Fallback-Vermerk ohne beide Werte gilt als Schritt nicht ausgeführt. Beleg aus der eigenen Entwicklung: eine mehrstündige Fallback-Session gegen eine ungeprüfte „Hauptmodell gesperrt"-Annahme, während das eigentliche Limit nach einem zwischenzeitlichen Reset längst wieder Spielraum hatte.

### Schritt 1d — Rollen-Verbote (Elephant)

- **Gebot (Elephant):** Bestätige vor Arbeitsbeginn die Rollen-Verbote des Elephant als kompakte, direkt eingebettete Liste (KEIN Zusatz-Dateilesen zur Laufzeit — Token-Ökonomie):
  - **EL-01** — kein Produktionscode; einzige Ausnahme: Stufe-0-Fast-Path gemäß `docs/operating-model.md` §3.3; weitere Ausnahmen nur durch den PO.
  - **EL-02** — kein Schritt-für-Schritt-Mikromanagement; Delegation erfolgt einmalig, über das 6-Felder-Briefing.
  - **EL-03** — Urteilsvermögen bleibt auf der richtigen Ebene (nie das PO-Urteil übernehmen, nie nach unten abschieben, nie das Gate outsourcen).
  - **EL-04** — keine stillen Grundsatzentscheidungen (Register + ADR, sonst existiert die Entscheidung nicht).
  - **EL-16** — Delegate-first in der Ausführungsphase: JEDE Implementierung läuft als gebriefter Implement-/Mechanic-Tier-Goldfish-Dispatch; „klein/verzahnt" ist KEINE Ausnahme — verzahnte Kleinfeatures werden zu EINEM Briefing gebündelt; Design-Phase-Denken bleibt Elephant-Arbeit.
  - **EL-18** — ein Repo, ein Elephant; repo-übergreifende Bedarfe laufen über den Transfer-Pfad.
  - **EL-19** — PO-Gate: PRD nach Readiness-Check PROAKTIV lesbar vorlegen (kein bloßer Datei-Pfad; Remote-Sessions: ans Gerät senden/rendern) und explizit auf das Wort „freigegeben" warten — keine Implementierung vor dessen Eintreffen.
- **Warum:** Genau diese Verbote wurden in einer <PROJECT_B>-Session real verletzt — weder Bootstrap noch Close noch Critic fingen es auf, weil der Bootstrap die Rollen-Verbote nie lud. Die eingebettete Liste macht sie am Sessionstart unübergehbar sichtbar, statt auf Erinnerung zu hoffen.
- **Rollen:** Pflicht für den Elephant. Goldfish/Critic erhalten ihre Verbote über das Dispatch-Briefing (Feld 4 „Verbote" bzw. den jeweiligen Rollenvertrag) — für sie entfällt dieser Schritt als eigener Bootstrap-Akt.
- **Prüfweise:** Die dritte Bestätigungszeile (→ §6.1) nennt die Rollen-Verbote wörtlich; ihr Fehlen zeigt, dass Schritt 1d nicht ausgeführt wurde.

Dieser Schritt endet in einer **dritten verbindlichen Bestätigungszeile** (Deutsch, wörtlich, direkt unter der Modell/Effort-Zeile gedruckt; literal geprüft wie Zeile 1 — Format → §6.1):

> „Rollen-Verbote geladen: EL-01/EL-02/EL-03/EL-04/EL-16/EL-18/EL-19 — Implementierung nur per Goldfish-Dispatch (Stufe-0 per OM §3.3; weitere Ausnahmen nur durch den PO); PRD-Gate: lesbar vorlegen + auf ‚freigegeben' warten"

### Schritt 2 — Staleness-Check gegen den Marketplace-Remote

- **Gebot:** Vergleiche den installierten Stand mit dem Remote-HEAD des Marketplace-Repos, z. B. `git ls-remote <marketplace-url> HEAD`. Die URL steht in der committeten `.claude/settings.json` des Projekts (`extraKnownMarketplaces`-Eintrag) — der Skill kann sie von dort ableiten, kein Hardcoding.
- **Hinweis (Mechanismus, nur bei STALE-Warnung des SessionStart-Hooks):** Meldet der SessionStart-Hook des Plugins in DIESER Session eine STALE-Warnung, die installierten SHA und Remote-SHA namentlich nennt, darf Schritt 2 dieses Ergebnis als gleichwertige Evidenz übernehmen statt `ls-remote` selbst erneut auszuführen. Die reale Hook-Ausgabe kennt sonst nur eine konstante Fresh-Pfad-Bootstrap-Zeile ohne SHAs — sie fällt identisch aus, ob die SHAs übereinstimmen oder der Hook mangels Auflösbarkeit fail-open ausgelöst hat, und taugt deshalb NICHT als Substitutionsnachweis. Liegt nur diese konstante Zeile vor oder fehlt jede Hook-Ausgabe, gilt Schritt 2 unverändert per eigenem `ls-remote`.
- **Warum:** Drittanbieter-Marketplaces auto-updaten nicht; ohne diesen Check ersetzt Zwei-Rechner-Cache-Drift die alte Copy-Paste-Drift.
- **Prüfweise:** SHA-Gleichheit = aktuell. Abweichung = stale → Fall **F2**. Remote nicht erreichbar → Fall **F3**. Der Check braucht Netz + Credentials fürs private Repo (siehe §5).

### Schritt 3 — Projekt-Kalibrierungsdatei lesen (Existenz-Check zuerst!)

- **Gebot:** Prüfe zuerst, dass die Kalibrierungsdatei **existiert** (Arbeitsname einheitlich: `.claude/pipeline.json`), dann lies sie vollständig. Erwartetes Pflichtfeld-Minimum (Feldskizze → docs/operating-model.md §8): verify-Kommando(s), Autonomie-Stufe, Branch-Modell, Worktree-Regel, Stakes-Einstufung, Projekt-Constraints.
- **Gebot (Denies):** Projekt-**Denies** leben NICHT in der Kalibrierungsdatei, sondern in der committeten `.claude/settings.json` bzw. der Guard-Config des git-guard — dieser Schritt prüft die Denies **dort** (Existenz der committeten Permission-/Guard-Einträge).
- **Warum:** Die zentralen Skills sind parametrisiert und lesen diese Datei — ohne sie laufen Rituale mit falschen Defaults, im schlimmsten Fall mit den Guardrails des falschen Projekts.
- **Prüfweise:** Datei existiert und enthält die Pflichtfelder; fehlt sie oder ist sie unvollständig → Fall **F4**.
- **Entschieden:** Mechanismus + Feldskizze → docs/operating-model.md §8; **Schema-Format:** JSON (`.claude/pipeline.json`, mit der Plugin-Lieferung).

### Schritt 4 — Handover-/State-Datei lesen

- **Gebot:** Lies die Handover-Datei des Projekts vollständig (im Pipeline-Repo: docs/state.md). Sie ist die **einzige maßgebliche Stand-Quelle**; Memory ist nur Spiegel.
- **Warum:** Der handgepflegte Dreifach-Staffelstab hat nachweislich gelogen; die Pipeline ersetzt ihn durch eine Quelle — dann muss jede Session genau diese lesen.
- **Prüfweise:** Das Datum der letzten Aktualisierung ist extrahierbar (es geht in die Bestätigungszeile). **Drift-Schwellwert (Default):** Warnung liegt vor, wenn der letzte Commit des Projekt-Repos NEUER ist als der Handover-Stand UND das Delta seither mindestens einen Nicht-Doku-Commit enthält (reine Doku-Deltas lösen keine Warnung aus); ein Projekt kann einen abweichenden Schwellwert per `$driftThreshold`-Kommentarfeld in `.claude/pipeline.json` dokumentieren (Default gilt, wenn das Feld fehlt).

### Schritt 5 — Projekt-Gates verfügbar?

- **Gebot:** Prüfe, dass das **eine** verify-Skript des Projekts existiert und grundsätzlich lauffähig ist (Existenz + Aufrufbarkeit, z. B. Trockenlauf/Hilfe-Aufruf — kein vollständiger Gate-Lauf beim Bootstrap).
- **Warum:** Ohne lauffähiges verify ist die Evidenzpflicht nicht erfüllbar — ein Goldfish, der später nicht abgeben kann, ist verschwendetes Token-Budget; das soll am Sessionstart auffallen, nicht am Taskende.
- **Prüfweise:** Pfad/Kommando stammt aus der Kalibrierungsdatei (Schritt 3); Existenz-Check bestanden. Fehlt das Skript → wie F4 behandeln (STOP für schreibende Arbeit, Anlage anbieten).

### Schritt 6 — Selbstbestätigung ausgeben (Format verbindlich)

- **Gebot:** Gib exakt diese Zeile aus:

  > **„Bootstrap-Check bestanden: Regelwerk \<version/SHA\> geladen · Projekt \<name\> · Kalibrierung \<datei\> · Stand \<handover-datum\> · Rolle \<Elephant|Goldfish|Critic\>"**

  Definierte Zusätze (nur diese, jeweils angehängt mit „·"):
  - bei F3: „· Staleness ungeprüft (offline, Cache-Stand)"
  - bei akzeptiertem F2: „· HINWEIS: Regelwerk stale (\<n\> Commits hinter Remote)"
  - bei Kurz-Bootstrap (same-day, §6.4): „· Staleness same-day gecacht (voller Check \<HH:MM\>)"
  - bei Speed-Bootstrap (§6.5): „· Profil speed — Leicht-Bootstrap (Details → §6.5)"; die Zusatzzeilen für Modell/Effort (§6.1) und Rollen-Verbote (§6.1) entfallen dabei — sie gelten inhaltlich unverändert weiter, werden im Speed-Pfad nur nicht als eigene Zeilen wiederholt (EINE Bestätigungszeile statt drei).
  - bei F4 (Kalibrierung und/oder Handover fehlt — der ERWARTETE Erstzustand in noch nicht migrierten Projekten): das betroffene Feld trägt statt eines Platzhalters den Wert „FEHLT (F4)" — also „Kalibrierung FEHLT (F4)" bzw. „Stand FEHLT (F4)" —, PLUS Pflicht-Suffix „· F4: nur Read-only-Analyse bis Kalibrierung/Handover angelegt".
  - Rollen-Varianten für das Feld „Stand" → §6.
- **Warum:** Die Zeile ist der auditierbare Beweis des Vollzugs — der PO (oder ein Hook) kann jede Session daran prüfen, ohne den Verlauf zu lesen.
- **Verbot:** Die Zeile ohne tatsächlich durchgeführte Schritte 1–5 ausgeben. Das wäre exakt der dokumentierte Haupt-Failure-Mode „fertig gemeldet, aber nicht geprüft" — und ein Critic prüft Trajektorien.
- **Prüfweise:** Zeile beginnt wörtlich mit „Bootstrap-Check bestanden:" und enthält alle fünf Felder mit konkreten Werten (kein Platzhalter, kein „unbekannt" außer in den definierten Zusatz-Fällen — F4s „FEHLT (F4)"-Wert zählt als definierter Zusatz-Fall, nicht als Platzhalter).

---

## 4. Definiertes Fehlverhalten

| Fall | Befund | Verhalten (verbindlich) |
|---|---|---|
| **F1** | **Regelwerk fehlt komplett** (Plugin nicht installiert, Skills nicht auffindbar) | **STOP.** Den PO informieren. Nur **Minimal-Safe-Mode** erlaubt (Definition unten). Keine Bestätigungszeile — die Session gilt als nicht gebootstrapped. **Selbstanwendungs-Sonderfall:** Im Pipeline-Repo selbst ist der Checkout die Quelle — F1 bedeutet hier nur „Plugin nicht installiert": Arbeit mit den Checkout-Dateien bleibt erlaubt (Regelwerk + Guardrails liegen als Dateien vor), Installation über die committete Selbst-Bindung (`.claude/settings.json`) bzw. `claude --plugin-dir` (§5.2) wird empfohlen. |
| **F2** | **Plugin stale** (installierter SHA ≠ Remote-HEAD) | Warnen + Refresh anbieten mit konkretem Kommando: `/plugin marketplace update agent-pipeline` und `claude plugin update pipeline-core` (bei **projekt-scoped** Installationen: `claude plugin update pipeline-core@agent-pipeline --scope project` — das unscoped Kommando schlägt dort mit „not found" fehl, Default-Scope ist user; empirisch beobachtet), danach `/reload-plugins`. Weiterarbeit erlaubt, **außer** das Delta enthält Guardrail-/Hook-Änderungen (Pfade `hooks/`, `agents/`, Permission-Vorgaben) — dann erst Refresh, dann Arbeit. Prüfweise fürs Delta: im lokalen Checkout des zentralen Repos `git fetch` + `git log --name-only <installiert>..origin/main`; ist kein Checkout vorhanden, gilt Default-Safe: **im Zweifel refreshen** (der Refresh ist billig, das Risiko veralteter Guardrails nicht). Bestätigungszeile trägt den HINWEIS-Zusatz. |
| **F3** | **Offline / Remote nicht erreichbar** | Warnen + mit Cache-Stand weiterarbeiten (der Cache ist eine vollständige Kopie, Alltagsbetrieb ist offline-fähig). Staleness-Check bei nächster Konnektivität **nachholen** (spätestens beim nächsten Bootstrap). Bestätigungszeile trägt den Offline-Zusatz. |
| **F4** | **Kalibrierungs- oder Handover-Datei fehlt** | **STOP für schreibende Arbeit.** Anlage aus dem zentralen Template anbieten (Templates liegen im Pipeline-Repo/Plugin). Read-only-Analyse bleibt erlaubt. **Die Bestätigungszeile wird trotzdem gedruckt** (F4 ist der erwartete Erstzustand, kein Bootstrap-Versagen — anders als F1): betroffenes Feld = „FEHLT (F4)" + Pflicht-Suffix, Format in Schritt 6. Neu angelegte Dateien sind dem PO zur Bestätigung zu nennen (neue Kalibrierung = Projekt-Policy-Entscheidung, kein Agenten-Alleingang). |
| **F5** | **Crash-Recovery** (Spuren eines nicht sauber geschlossenen Laufs: verwaiste Worktrees per `git worktree list`, offene WIP-/🟡-Vorgänge oder in-flight-Dispatches laut Handover, unaufgelöste „wird beim Close ergänzt"-Telemetrie-Platzhalter) | **Melden VOR Arbeitsbeginn.** Der Bootstrap scannt beim Handover-Lesen (Schritt 4) auf Worktree-Leichen und offene WIP-Vorgänge und listet Funde explizit — nie still aufräumen, nie still übergehen. Der PO bzw. der Elephant entscheidet: aufräumen, fortsetzen oder als offenen Punkt ins Handover. Danach normaler Bootstrap-Abschluss. |

**Warum F2 die Guardrail-Ausnahme hat:** Ein stales Regelwerk mit alten Hooks bedeutet, dass die Session unter **schwächeren Schutzregeln arbeitet als beschlossen** — genau der Zustand, den die Pipeline abschaffen soll. Feature-/Doku-Deltas dürfen warten, Schutz-Deltas nicht.

**Minimal-Safe-Mode (nur F1):**

- **Erlaubt:** Lesen (Read/Glob/Grep), read-only git (`status`, `log`, `diff`), Diagnose der Plugin-Installation (`/plugin`-Menü, Settings-Inspektion).
- **Verboten:** Edits/Writes, Commits, Push, Ausführung schreibender Skripte, jede Änderung an `.claude/`-Dateien oder Settings.
- **Warum:** Ohne Hook-Guardrails gibt es keine technische Durchsetzungsebene — nur Lesen ist ohne sie vertretbar.

---

## 5. Refresh-Ritual und Erstbindung je Maschine

### 5.1 Erstbindung (einmalig je Maschine je Projekt)

**Voraussetzungen (Gebot, vorher prüfen):**

1. **Online** — die Erstbindung klont das Marketplace-Repo; offline schlägt sie fehl.
2. **Credentials für das private Marketplace-Repo** vorhanden: `gh auth status` grün bzw. Git-Credential-Manager-Eintrag für github.com (auf jeder eigenen Maschine vorab prüfen).

**Ablauf:**

1. **Deterministischer Weg (empfohlen, für Kickoffs/frische Klone — skriptbar, nicht-interaktiv, idempotent, dokumentierte CLI-Subkommandos):** Projekt-Repo klonen/pullen, dann `claude plugin marketplace add {{REPO_OWNER}}/agent-pipeline --scope project` → `claude plugin install pipeline-core@agent-pipeline --scope project` (**`--scope project` ist Pflicht:** die Subkommandos verwenden standardmäßig `--scope user`, die Bindung liegt aber im Projekt-Scope, sonst „not installed at scope user") → Readback-Beweis `claude plugin list --json` (Install + Version + enabled-Status) → Session-Neustart bzw. `/reload-plugins`, dann `/pipeline-core:pipeline-start` als Ladebeweis (F1-Check).
2. **Trust-Weg — nicht verlässlich, nicht als alleiniger Mechanismus verwenden:** Ordner in Claude Code trusten KANN den Install-Prompt aus der committeten `.claude/settings.json` auslösen (`extraKnownMarketplaces` + `enabledPlugins`) — der Prompt hängt aber am Trust-Dialog-**Event**, nicht am Session-Start: ein bereits vorher getrusteter Ordner bekommt bei einer erst später committeten Bindung KEINEN Prompt (dokumentierte Lücke, GitHub-Issues #23737/#13096). Erscheint er dennoch und wird bestätigt, erfüllt das denselben Pflichtschritt wie der deterministische Weg oben — seit v2.1.195 muss ein extern bezogenes, projektseitig aktiviertes Plugin **einmal pro User explizit installiert** werden, aber nur der deterministische Weg oben erfüllt diese Pflicht ohne Prompt-Abhängigkeit; deshalb ist er Standard, nicht der Trust-Weg.
3. **Einmalig setzen:** `CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE=1` (User-Env jeder eigenen Maschine). Warum: Ohne den Schalter verwirft Claude Code bei fehlgeschlagenem `git pull` (z. B. offline ausgelöstes Update) den Marketplace-Klon — der letzte gute Stand ginge verloren.
4. Auto-Update **bewusst auf dem Default „aus" belassen.** Warum: explizite, deterministische Refreshes statt Hintergrund-Magie; der Staleness-Check (Schritt 2) macht Drift trotzdem sichtbar, und die Offline-Robustheit bleibt maximal. (⚠ UNSICHER, ob `autoUpdate` in Projekt-Settings überhaupt wirkt. Auch deshalb: nicht darauf bauen.) **Private Marketplaces:** Sollte Auto-Update je aktiviert werden, laufen dessen Hintergrund-Updates OHNE Git-Credential-Helper und brauchen `GITHUB_TOKEN`/`GH_TOKEN` in der Umgebung — sonst stiller Fehlschlag beim Start (dokumentiert, plugin-marketplaces.md §Private repositories). Manuelle Kommandos (wie der deterministische Weg oben) nutzen dagegen die normalen Git-Credentials aus den Voraussetzungen.

**Wenn der Install-Prompt ausbleibt (Zustand „Bindung committet, Projekt-Install fehlt", d. h. der Trust-Weg oben — Schritt 2 — wurde versucht und lieferte keinen Prompt):** Empirisch belegt (in einer <PROJECT_B>-Session): getrusteter Ordner + committete Bindung + reiner Session-NEUSTART lösen den Install-Prompt NICHT verlässlich aus (kostete dort einen Session-Start + Umweg). **Primärer Rettungsweg dieses Trust-Zweigs** (interaktiv, keine Improvisation): `/plugin`-Menü öffnen → Install bestätigen → `/reload-plugins`. Für Kickoffs/frische Klone ist der deterministische CLI-Weg (Schritt 1) ohnehin der Standard und umgeht dieses Prompt-Problem ganz; dieser Menü-Weg ist der verlässliche interaktive Ausweg, wenn stattdessen der Trust-Weg genutzt wurde und der Prompt ausblieb.

### 5.2 Laufendes Refresh-Ritual

| Situation | Ritual |
|---|---|
| **Normalfall** (Pipeline-Änderung wurde auf Rechner A gepusht) | Auf Rechner B beim nächsten Bootstrap meldet Schritt 2 „stale" → `/plugin marketplace update agent-pipeline` + `claude plugin update pipeline-core`, in laufender Session `/reload-plugins`. |
| **Committete Bindung, Projekt-Install fehlt** (Trust + reiner Session-Neustart lösen den Install-Prompt NICHT verlässlich aus — <PROJECT_B>-Befund) | **PRIMÄRER Weg** (s. §5.1): `/plugin`-Menü → Install bestätigen → `/reload-plugins`. |
| **Arbeit am Regelwerk selbst** (nur auf der Maschine mit aktivem Checkout des zentralen Repos) | `claude --plugin-dir <checkout>/plugins/pipeline-core` + `/reload-plugins` — die lokale Kopie überschreibt die installierte Version für die Session. Ausrollen = commit + push; die andere Maschine holt per Normalfall-Ritual nach. |
| **Nach jedem Refresh** | Bootstrap-Schritte 1–2 wiederholen (neuer SHA in der Bestätigungszeile) — sonst ist der Refresh nicht belegt. |

**Gebot:** Der Refresh ist ein **expliziter Akt mit Protokollspur** (Bestätigungszeile mit neuem SHA), kein Nebenbei-Effekt. **Warum:** In der SHA-Phase ist der Refresh-Zeitpunkt die einzige Versionsgrenze — ohne Spur ist nicht rekonstruierbar, welcher Regelwerk-Stand eine Arbeit begleitet hat (relevant für Critic-Trajektorienprüfung und Kosten-/Fehleranalyse).

**Erwartungs-Hinweis (`/reload-plugins`):** Das Kommando kann „0 skills" (bzw. eine scheinbar leere Skill-Zahl) melden, obwohl die Skills danach ganz normal aufrufbar sind (<PROJECT_B>-Befund) — das ist kein Bug-Indikator. Die Wirkung wird durch tatsächlichen Aufruf eines Skills geprüft, nicht durch die Meldung.

---

## 6. Rollen-Varianten

**Ladeprinzip (schlanker Sessionstart):** Eine Session lädt/liest NUR den Abschnitt ihrer AKTIVEN Rolle (§6.1 Elephant, §6.2 Goldfish, §6.3 Critic, ggf. §6.4/§6.5 als Elephant-Profilvarianten) — nicht den vollen Rollentext aller drei Rollen vorab. Das gilt für dieses Dokument wie für die ausführbare Form (`plugins/pipeline-core/skills/pipeline-start/SKILL.md`). Kein Schritt entfällt dadurch — es wird nur kein fremdes Rollenmaterial mehr mitgelesen. **Messbares Ziel: Kontext nach Bootstrap ≤ ~75k Tokens (gemessen per Statusline), gegenüber bisher >150k.**

| Schritt | Elephant | Goldfish | Critic |
|---|---|---|---|
| 1 Plugin-Präsenz + Stand | ✓ voll | ✓ kompakt (Guardrails aktiv? Stand = im Briefing genannter SHA) | ✓ kompakt (read-only-Toolset bestätigen) |
| 1b Modell/Effort setzen + verifizieren (inkl. `CLAUDE_CODE_SUBAGENT_MODEL` ungesetzt) | ✓ Pflicht | — entfällt (Frontmatter/Dispatch, MP-02) | — entfällt (Frontmatter/Dispatch, MP-07) |
| 1c Spend-/Usage-Check (MP-16, Limit-Vermerk einmalig) | ✓ empfohlen | — entfällt | — entfällt |
| 1d Rollen-Verbote (eingebettet, kompakt) | ✓ Pflicht | — entfällt (Verbote kommen über das Dispatch-Briefing) | — entfällt (Verbote kommen über das Dispatch-Briefing) |
| 2 Staleness-Check | ✓ Pflicht | — entfällt (Stand hat der Elephant beim Dispatch fixiert) | — entfällt |
| 3 Kalibrierung | ✓ Pflicht | ✓ soweit im Briefing referenziert | teilweise: nur Guardrail-/Constraint-Anteile als Prüfmaßstab |
| 4 Handover/State | ✓ Pflicht (vollständig) | **✗ Verbot** — Briefing ersetzt Handover | **✗ Verbot** — kein Handover, kein Verlauf |
| 5 verify-Gates | ✓ Pflicht | ✓ Pflicht (braucht es für Evidenz) | — entfällt (Critic führt keine Gates aus, er prüft deren Evidenz) |
| 6 Bestätigung | ✓ voll + Zusatzzeile | ✓ kompakt (eine Zeile) | ✓ kompakt (eine Zeile) |

### 6.1 Elephant-Bootstrap (voll)

Alle Pflicht-Schritte inklusive **1b** (Modell/Effort gemäß model-policy setzen und verifizieren — Effort `xhigh` ist session-only; `CLAUDE_CODE_SUBAGENT_MODEL` ungesetzt bestätigen) und **1d** (Rollen-Verbote, s. u.); dazu — optional-empfohlen, kein Pflichtteil — **1c** (Spend-/Usage-Check: gesetztes/nahes Limit einmalig dokumentieren). Zusätzlich, gemäß MP-17 („Modell + Effort am Sessionanfang fixieren") und der Profil-/Advisor-Erweiterung aus Schritt 1b, eine **zweite Zeile** direkt unter der Bestätigung:

> Modell/Effort: {{MODEL}} / {{EFFORT}} (gemäß policies/model-policy.md) · Profil {{advisor|design-first|PO-Ausnahme}} · Advisor {{ADVISOR|aus}}

Direkt darunter, gemäß **1d**, eine **dritte Zeile**:

> „Rollen-Verbote geladen: EL-01/EL-02/EL-03/EL-04/EL-16/EL-18/EL-19 — Implementierung nur per Goldfish-Dispatch (Stufe-0 per OM §3.3; weitere Ausnahmen nur durch den PO); PRD-Gate: lesbar vorlegen + auf ‚freigegeben' warten"

Der Elephant muss außerdem zur Session-Lifecycle-Politik auskunftsfähig sein (Elephant-Erhalt bei vollem Kontext, Goldfish-Kadenz — Pflichtteil des Operating Model, → docs/operating-model.md); der Bootstrap lädt dafür keine Zusatzdateien, die Politik kommt mit dem Regelwerk.

### 6.2 Goldfish-Bootstrap (Briefing statt Handover)

- **Das Briefing des Elephant ersetzt die Handover-Lektüre.** Verbot: Handover-/State-Datei oder Verlaufsartefakte lesen. Warum: Kontext-Ökonomie und Kontrakt-Klarheit — das Briefing (Ziel · Kontext-Dateien · DoD-Checks · Verbote · Stop-Bedingungen · Dispatch-Metadaten; kanonische Feldliste: docs/operating-model.md §2.3) ist der vollständige Auftrag; was nicht drinsteht, gehört nicht in den Goldfish-Kontext.
- Das Briefing **muss den Regelwerk-SHA nennen** (Pflichtfeld „Dispatch-Metadaten", → docs/operating-model.md §2.3), unter dem dispatcht wurde; der Goldfish übernimmt ihn in seine Bestätigung (kein eigener Remote-Check — Netz-/Zeitkosten liegen beim Elephant, einmal pro Dispatch-Welle statt einmal pro Goldfish).
- **Kompakte Bestätigung** (eine Zeile, Feld „Stand" trägt die Briefing-Referenz):

  > „Bootstrap-Check bestanden: Regelwerk \<SHA aus Briefing\> geladen · Projekt \<name\> · Kalibrierung \<datei\> · Stand Briefing \<task-id/datum\> · Rolle Goldfish"

- **Prüfweise:** Fehlt der SHA im Briefing, ist das ein Briefing-Mangel → zurück an den Elephant (Stop-Bedingung), nicht selbst recherchieren.

### 6.3 Critic-Bootstrap (nur Spec + Diff + Guardrails)

- **Input ist abschließend definiert:** Spec, Diff, Guardrails/Constraints (inkl. relevanter Kalibrierungs-Anteile als Prüfmaßstab) und die Evidenz-Artefakte des Prüflings. **Explizit KEIN Handover, KEIN Chat-Verlauf, KEINE Implementor-Begründungen.** Warum: Der Critic soll unabhängig urteilen — Verlaufskontext erzeugt genau die Ankereffekte, die er neutralisieren soll.
- Kein Staleness-Check: Der Critic prüft gegen den Stand, den ihm der Auftrag nennt; Aktualität des Regelwerks zu sichern ist Elephant-Pflicht.
- Bestätigung, dass **keine Schreib-Tools** verfügbar sind (read-only Subagent, ggf. `--bare`-Stufe für kritische Diffs) — ist Schreiben möglich, ist der Bootstrap gescheitert (falsche Agent-Definition geladen).
- **Kompakte Bestätigung** (Feld „Stand" entfällt bewusst):

  > „Bootstrap-Check bestanden: Regelwerk \<SHA aus Auftrag\> geladen · Projekt \<name\> · Kalibrierung \<datei|n/a\> · Stand n/a (Critic sieht keinen Verlauf) · Rolle Critic"

### 6.4 Kurz-Bootstrap (Same-Day-Light-Bootstrap, Elephant)

**Voraussetzungen (ALLE müssen zutreffen, sonst voller Bootstrap):**

1. Gleiche Maschine UND gleicher Kalendertag wie ein dokumentierter VOLLER Bootstrap (Beleg: der oberste Session-Block der Handover-Datei des Projekts verzeichnet diesen Bootstrap mit Datum).
2. Geladener Regelwerk-SHA unverändert gegenüber diesem vollen Bootstrap.
3. Kein Plugin-Refresh/-Reload seither (nach jedem F2-Refresh oder `/reload-plugins` gilt zwingend wieder der volle Pfad — unveränderter Kontrakt).

**Leichtform** (weicht NUR wie folgt vom Vollpfad in §3 ab; alle nicht genannten Schritte laufen unverändert):

- **Schritt 1:** nur lokaler SHA (kein `ls-remote`).
- **Schritt 1b:** unverändert (Pflicht) — **die Profil-Frage wird bei JEDEM Bootstrap wiederholt**, auch im Kurz-Pfad: sie ist billig (eine UI-Frage) und ein Profilwechsel mitten am Tag ist ohnehin eine neue Session.
- **Schritt 1d:** unverändert (eingebettet, billig).
- **Schritt 2:** ÜBERSPRUNGEN, mit Pflicht-Suffix `· Staleness same-day gecacht (voller Check <HH:MM>)` (siehe Schritt 6, Liste der erlaubten Zusätze).
- **Schritt 3:** nur Existenz-Check.
- **Schritt 4:** nur Handover-HEAD-Block + oberster Session-Block — AUSSER die Handover-Datei hat sich seit dem vollen Bootstrap geändert (neuere Commits/Datum) → dann vollständige Lektüre.
- **Schritt 5:** nur Existenz-Check.
- **Schritt 6:** Bestätigungszeile wie gewohnt + der Suffix aus Schritt 2 oben.

**Warum:** Ein am selben Tag auf derselben Maschine bereits vollständig durchgeführter Bootstrap macht die teuren Prüfschritte (Remote-Staleness, volle Handover-Lektüre) redundant — SOFERN Regelwerk-Stand und Handover-Stand seither nachweislich unverändert sind; die drei Voraussetzungen sind die Nachweispflicht dafür, keine Abkürzung nach Gefühl.

### 6.5 Speed-Bootstrap (Mini-Feature/Hotfix, Elephant)

**Herkunft:** dritte Profiloption neben `advisor`/`design-first` in Schritt 1b (§3) — für genuinely kleine, eng begrenzte Diffs (Mini-Feature/Hotfix), nicht für Architektur-/Guardrail-Arbeit.

**Voraussetzung:** Der PO wählt in der Schritt-1b-Profilfrage die Option `speed`. Anders als der Kurz-Bootstrap (§6.4) ist Speed NICHT an „gleicher Tag/gleiche Maschine" gebunden — es ist eine Zuschnittsfrage des Tasks (Mini-Feature/Hotfix), keine Cache-Frische-Frage.

**Geltungsbereich (harte Grenzen — Bruch löst Pflicht-Eskalation aus):**

- Nur für Mini-Feature-/Hotfix-Umfang: **~≤5 betroffene Dateien.**
- **KEINE Guardrail-/Kanon-Dateien** im Scope — kanonische Liste der verbotenen Datei-Klassen für das `speed`-Profil: `policies/model-policy.md` (MP-28); hier nicht separat aufgeführt, um Divergenz zu vermeiden.
- **Keine neuen Abhängigkeiten.**
- Wird eine dieser Grenzen während der Session sichtbar (Scope wächst über den Zuschnitt hinaus): **Pflicht-Eskalation ins Vollprofil** — sofort auf den vollen Bootstrap/vollen Prozess wechseln, nicht im Speed-Pfad weiterarbeiten (Eskalationslogik analog `harness/checklists/small-session.md`, Abschnitt „Escalation rule").
- **Die Guard-Hooks bleiben in JEDEM Profil, auch `speed`, uneingeschränkt aktiv** (deterministisch, kostenlos) — Speed spart Zeremonie, nicht Sicherheit.

**Leichtform des Bootstraps** (weicht NUR wie folgt vom Vollpfad in §3 ab; alle nicht genannten Schritte laufen unverändert bzw. entfallen wie unten spezifiziert):

- **Schritt 1:** nur lokaler Regelwerk-SHA (kein `ls-remote`).
- **Schritt 1b:** die Profilfrage selbst läuft normal (das IST bereits die Speed-Wahl); danach ENTFÄLLT die Advisor-Hygiene-Prüfung und die Bereitschaftsprobe (beide sind `advisor`-Profil-spezifisch) — Modell/Effort/Advisor-Pairing ist im Speed-Profil fix (`policies/model-policy.md`, MP-28), einmal gesetzt, keine Zusatzfragen.
- **Schritt 1c:** entfällt (kein Spend-/Usage-Check als eigener Akt).
- **Schritt 1d:** entfällt als eigene Bestätigungszeile — die Rollen-Verbote (EL-01/EL-02/EL-03/EL-04/EL-16/EL-18/EL-19) gelten inhaltlich unverändert, werden im Speed-Pfad nur nicht als eigene Zeile wiederholt.
- **Schritt 2:** entfällt vollständig (kein Remote-Staleness-Check).
- **Schritt 3:** nur Existenz-Check der Kalibrierungsdatei (kein Vollständig-Lesen).
- **Schritt 4:** nur der operative Kopf der Handover-Datei (kein vollständiges Lesen der Session-Historie).
- **Schritt 5:** nur Existenz-/Aufrufbarkeits-Check von verify.
- **Schritt 6:** **EINE Bestätigungszeile statt drei** (Format → Schritt 6, Suffix „· Profil speed — Leicht-Bootstrap").

**Leichter Prozess** (nicht nur der Bootstrap — gilt für den ganzen Task): kein PRD-Dokument; direkter Dispatch, oder bei ganz kleinen Fixes ein Mini-Edit (Stufe-0-Fast-Path per `docs/operating-model.md` §3.3); leichte Review-Stufe statt vollem Design-Tier-Review — die bestehende Critic-Trigger-Matrix entscheidet wie gehabt, nicht neu erfunden (→ `harness/checklists/small-session.md` Schritt 3); Kurz-Abschluss über die **close-light-Variante** des `close-block`-Skills (`plugins/pipeline-core/skills/close-block/SKILL.md`) — deren eigenes hartes Eligibility-Gate gilt unverändert, Speed übersteuert es nicht.

**Warum:** Für ein Mini-Feature oder einen Hotfix lief bislang dieselbe schwere Zeremonie wie für einen Architektur-Umbau — die überschrittene Proportionalitäts-Leitplanke. Speed spart die Zeremonie, ohne eine einzige deterministische Guardrail zu berühren.

---

## 7. Offene Punkte

- **TEILERLEDIGT:** Maschinenlesbare Quelle für den installierten Plugin-SHA ist auf dem Haupt-PC verifiziert: `~/.claude/plugins/installed_plugins.json`, Feld `gitCommitSha` (Details → Schritt 1). Die Quellen-Nennung im `/pipeline-core:pipeline-start`-Skill ist nachgezogen. **OFFEN bleibt nur die Laptop-Gegenprobe** (Zwei-Rechner-Validierung, Sprint 1).
- **ERLEDIGT:** SessionStart-Hook verdrahtet — `plugins/pipeline-core/hooks/staleness-check.mjs` (Matcher `startup|resume|clear`, Timeout 15 s, fail-open, read-only) injiziert die Bootstrap-Aufforderungszeile (Verankerung 1) und bei Staleness den SHA-Befund (Schritt-2-Substitution, s. dort); T1-Critic-Pfad durchlaufen. Offen nur noch Zwei-Rechner-E2E (Laptop; Sprint 1).
- **Entschieden:** Mechanismus und Feldskizze der Projekt-Kalibrierungsdatei stehen in docs/operating-model.md §8 (Arbeitsname `.claude/pipeline.json`). **Schema-Format entschieden (mit der Plugin-Lieferung):** JSON (`.claude/pipeline.json`); die Skills `pipeline-start`/`close-block` lesen dieses Format.
- **Entschieden:** Handover-Datei kanonisch (Konvention `docs/state.md`), Verhältnis zu HISTORY festgeschrieben — → docs/operating-model.md §6 + ADR-0012. **OFFEN (Phase 4):** nur noch das Handover-Template + der endgültige Template-Name je Projekt.
- **ERLEDIGT:** Schwellwert des Handover-Drift-Checks (Schritt 4) kalibriert — Default „HEAD neuer als Handover UND ≥1 Nicht-Doku-Commit im Delta", per-Projekt-Override via `$driftThreshold` in `.claude/pipeline.json`.
- **⚠ UNSICHER:** Ob `autoUpdate` am `extraKnownMarketplaces`-Eintrag außerhalb managed settings wirkt — deshalb setzt dieses Protokoll auf explizite Refreshes; falls sich die Doku-Lage ändert, Ritual in §5 neu bewerten.
