# Tooling Policy — Tool Choice in the Claude Code Harness

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2

**Purpose.** This policy defines WHICH Claude Code primitive is used for WHICH kind of rule or work — so rules land where they are guaranteed to hold, and context is saved where it is scarcest. It applies to all projects (`<PROJECT_A>`, `<PROJECT_B>`, `<PROJECT_C>`, future ones) and, by self-application, to the Pipeline repo itself.

**Scope.** Roles, SDLC and session lifecycle: `docs/operating-model.md` · model/effort/cost incl. the Ultracode indication list: `policies/model-policy.md` · session-start protocol and plugin staleness check: `harness/session-bootstrap.md` · formalized individual decisions: `docs/adr/`. On conflict, the canonical decision record in `docs/state.md` wins. This policy operationalizes in particular: plugin distribution, Goldfish/Critic as subagents, workflows, permissions/worktree/plan mode, the git-guard union, and the tooling radar.

---

## 1. Principle

### G1 — Deterministic rules belong in settings/hooks, not in prose

- **MUST:** every rule that must ALWAYS hold (prohibitions, protected paths, gates) is implemented as a permission rule or a hook — never solely as text in CLAUDE.md or a policy.
- **Why:** CLAUDE.md is officially "context, not enforced configuration" — advisory, not an enforcement layer. Only a PreToolUse-deny hook blocks reliably, even in `bypassPermissions` mode. Prose rules have demonstrably failed in the PO's projects (→ anti-pattern AP-T2, §3).
- **How checked:** every rule phrased as MUST/NEVER/ALWAYS in CLAUDE.md or project docs has a named enforcing artifact (permission rule, hook, CI check) — or carries the explicit label "advisory". The Critic checks this in guardrail reviews; the drift check in `/close` checks it on rule changes.

### G2 — On agent failures, debug the harness first

- **MUST:** when an agent misbehaves, check in this order BEFORE switching model or effort: (1) is the briefing/spec complete and free of contradictions? (2) is context clean (CLAUDE.md length, state drift, topic mixing)? (3) are tools/permissions cut correctly — missing something, or too permissive? (4) are hooks/gates wired correctly and did they actually run?
- **Why:** "Agent = Model + Harness" — behavior is dominated by the harness; agent failures are usually configuration failures (Google guiding principle). Switching models on a broken harness burns tokens and masks the root cause.
- **How checked:** the two-failed-attempts rule escalates to the Elephant; the Elephant's escalation protocol (→ `docs/operating-model.md`) starts with this harness checklist. Model/effort changes as an error response require justification against `policies/model-policy.md`.

### G3 — Promised controls are contracts (watchdog duty)

- **MUST:** background runs without intermediate output are NEVER started without an automatic watchdog (monitor/timeout/idle detection with auto-kill and a loud failure report). A promised check ("I'll check again in 5 minutes") is **mechanized in the same step** (monitor, scheduler, hook) — or the promise is explicitly withdrawn. **The PO is never the watchdog.**
- **Why:** in a documented incident, a promised 5-minute check was never built; the PO had to poll manually twice, and two headless runs hung silently (15+ min, 0 bytes output). A promise is prose; only a mechanism controls — G1 logic applied to process promises instead of rules.
- **How checked:** every background start has a named, visible watchdog mechanism in the trajectory; the goldfish-dispatch checklist carries this item; the Critic flags background runs without a watchdog during trajectory review.

### G4 — Mandatory smoke test for new transport paths

- **MUST:** before an expensive or long run is attached to a NEW transport path (headless CLI, background execution, stdin/cwd/auth constellation, CI path), a ~30-second trivial call runs through the **full** path — same flags, same execution context (background yes/no, stdin source, working directory, credentials). Payload only follows a green smoke test.
- **Why:** all three documented headless defects (the `--bare` credential bug, the workspace deadlock without `--add-dir`, the stdin-pipe hang in background) would have been caught upfront by a 30-second full-path test — instead they cost two silent hangs in one work session.
- **How checked:** first use of a transport path shows the trivial call in the trajectory BEFORE the first real run; the telemetry column "peculiarities" notes the smoke test for new paths.

### G5 — Spec format: prose in Markdown, structured data stays flat (NEW)

*(English in the source — agent-facing authoring guideline, same convention as MP-22/23/24 in `policies/model-policy.md`.)*

- **MUST (advisory — no enforcing hook, see G1 "how checked"):** prose belongs in Markdown; structured data (frontmatter, config, checklists, enums, tables) stays FLAT — avoid deep nesting and format overhead. This is guidance on choosing the right flatness WITHIN the existing spec format, not a mandate to switch formats — no move to Gherkin/BDD is intended or in scope (no evidence surfaced that the existing format itself is the wrong choice).
- **Why:** deep nesting and format overhead cost tokens and readability without adding information; flat structured data reads and diffs cleaner for both agent and human reviewer.
- **How checked:** spec/template authoring review flags deeply-nested structured blocks that could be flattened; advisory only (no hook) — marked as such per the G1 advisory requirement, not silently assumed enforced.

---

## 2. Tool Matrix

Overview: task type → tool. The binding rules per tool (W1–W9) follow below.

| Task type | Tool | Why | Example from the PO's projects |
|---|---|---|---|
| Ritual/procedure, timed by a human | **Skill** with `disable-model-invocation: true` | Body loads only on invocation (progressive disclosure); human controls side effects | `/new-block-review` + `/close` (all three projects) |
| Procedural knowledge for the model | **Skill** (default resp. `user-invocable: false`) | Only the description costs context permanently | Spec-writing protocol, Critic invocation procedure (Phase 3) |
| Scoped implementation, fresh context | **Subagent** (Goldfish) | Own context window, no history leaks, summary return | A cut `<PROJECT_A>` block as a single-task run |
| Independent review | **Subagent read-only** (Critic); `--bare` tier for critical diffs | Context isolation from the build context; `--bare` = total input control | Adversarial reviews before `<PROJECT_B>` live changes (ad hoc so far) |
| Verbose work (test runs, logs, doc fetches) | **Subagent** | Output does not clog the main context | Playwright run analysis in `<PROJECT_A>` |
| Non-negotiable rule | **Hook** (PreToolUse-deny, stop gate, SessionStart) | Only layer that holds even in `bypassPermissions` | `guard-git`, `lint-on-stop` (`<PROJECT_A>`), `cpp-compile-on-stop` (`<PROJECT_C>`) |
| Permission boundaries per repo | **settings.json permissions** (committed) | allow/ask/deny deterministic, versioned, clone-reproducible | `<PROJECT_B>`: deny on `secrets.yaml`/`.storage`; `<PROJECT_A>`: allow `Bash(npm run *)` |
| Avoid expensive mistaken edits | **Plan Mode** (`defaultMode: plan`) | Read-only exploration before every edit | `<PROJECT_B>` (live house) + `<PROJECT_C>` (engine code) |
| Massively parallel research / audit / migration | **Dynamic Workflow / Ultracode** (task opt-in) | Intermediate results live in the script, not in context | `<PROJECT_C>`-wide API migration; `<PROJECT_B>` config audit; Sprint-0 deep research |
| Reproducible check run / CI | **Headless** `claude -p --bare` / GitHub Action | No auto-discovery, machine-readable verdict, per-run cost measurable | Critic `--bare` tier; prospectively PR checks in `<PROJECT_C>` |
| Isolating parallel write work | **git worktree** (per project calibration) | Parallel goldfish runs don't collide; revertible | `<PROJECT_A>`'s night-build pattern ("branch only") as worktree successor |
| Third-party system without a usable CLI | **MCP** (minimalism) | Only then does the context cost justify the connection | `mcp-unreal` in `<PROJECT_C>` (editor API has no CLI) |

### W1 — Skill

- **MUST:** rituals and procedures live as versioned skills in the plugin — never as a prose section in CLAUDE.md. Skills with side effects that a human should time (close, merge, radar) get `disable-model-invocation: true`; pure background knowledge gets `user-invocable: false`.
- **Why:** progressive disclosure — only the description stays permanently in context, the body loads on invocation. This is exactly what resolves CLAUDE.md sprawl (AP-T2).
- **Example:** the ritual pair `/new-block-review` + `/close` already exists in all three projects as a skill — the Pipeline centralizes it, parametrized (mechanism → `docs/operating-model.md`).
- **How checked:** projects' CLAUDE.md contains facts, commands and references — no step-by-step procedures (length gate). Frontmatter review of the invocation switches in the Critic pass of Phase 3.

### W2 — Subagent (Goldfish / Critic / verbose work)

- **MUST:** Goldfish = custom subagent WITHOUT a `memory` field. Why no memory: the field auto-activates Write/Edit and contradicts the Goldfish definition "fresh context, forgets".
- **MUST:** Critic = read-only subagent (tool allowlist without Write/Edit, no memory); for architecture/guardrail/security diffs, the harder `--bare` tier (W7). The Critic never sees the chat history.
- **MUST:** verbose work (test suites, log analysis, doc fetches) is offloaded to subagents; only the summary returns.
- **MUST (enforce read-only technically):** dispatches that should write nothing (text-return drafts, research, review prep) run on a **read-only agent type** (tool allowlist without Write/Edit) — never with a mere "do not write" instruction in the briefing text. **Evidence:** in a documented incident, two drafters wrote directly to disk despite an explicit read-only instruction. Prose does not constrain; toolsets do. **How checked:** dispatch metadata names the agent type; a briefing with a write prohibition on a write-capable agent type is flagged by the Critic as an Elephant dispatch error.
- **Note:** custom subagents auto-load CLAUDE.md + git status — so the Goldfish briefing only needs the task spec, not the project rules; whoever needs full input isolation uses the `--bare` tier.
- **Example:** the effective ad-hoc adversarial reviews from `<PROJECT_A>`/`<PROJECT_B>` are institutionalized as a Critic subagent; a `<PROJECT_A>` block is implemented as a single-task Goldfish run instead of in the marathon session (AP-T3).
- **How checked:** frontmatter check of the plugin agents (Phase 3): `goldfish` without `memory`, `critic` without Write/Edit. The Critic contract additionally checks the trajectory.

### W3 — Hook

- **MUST:** non-negotiable rules as hooks: (1) git-guard as PreToolUse-deny — central **union** of all three project incarnations + project deny config; (2) stop gates that run the project's ONE verify script; (3) SessionStart reinjection (matcher `compact`) for the Pipeline state of long-lived Elephant sessions.
- **Design rules (carried over from existing practice):** fail-open as a safety net, exit 2 with a plain-text reason, a "why" header in every guard; observe the stop-hook block cap and `stop_hook_active`.
- **Why:** PreToolUse-deny holds even in `bypassPermissions` — the only layer that carries for workflow subagents in `acceptEdits` (W6).
- **Example:** `guard-git.mjs` exists triply diverged, no copy is a superset — the clearest evidence for why hooks must be centrally versioned and distributed.
- **How checked:** hooks live in the plugin's `hooks/hooks.json`; each deny rule has a test case (block + allow counter-case: `plugins/pipeline-core/hooks/guard-git.test.mjs`, run with `node`); hook execution is visible in the trajectory and checked by the Critic. The stop-hook gate framework (point 2) is OPEN (Phase 4).

### W4 — settings.json permissions

- **MUST:** allow/ask/deny per repo committed in `.claude/settings.json`; personal loosenings only in `settings.local.json` (not committed).
- **MUST NOT:** build security on fragile Bash argument patterns. Instead: tightly scoped denies + a `WebFetch(domain:…)` allowlist or a PreToolUse validator hook (official warning).
- **Why:** evaluation order deny → ask → allow, first match; a deny cannot be overridden at any level — hence cut denies narrow instead of broad-plus-exception.
- **Example:** `<PROJECT_B>`: deny on `secrets.yaml`/`.storage` (currently in guard-git, additionally as a permission going forward); `<PROJECT_C>`: content-pack denies; `<PROJECT_A>`: allow `Bash(npm run *)`.
- **How checked:** fresh-clone test: a freshly cloned project repo has identical permission boundaries with no manual work (bootstrap check → `harness/session-bootstrap.md`).

### W5 — Plan Mode

- **MUST:** `defaultMode: plan` in the committed settings.json of **`<PROJECT_B>` and `<PROJECT_C>`** — everywhere a wrong change is expensive (live alarm system/live devices, resp. engine code with build cost and PIE sign-off).
- **Why:** Plan Mode is a permission mode: read-only exploration, plan proposal, only approval switches to execution mode; the research runs in the plan subagent and does not flood the main context.
- **Honest gate boundary:** Plan Mode protects source code — approved exploratory Bash commands can still have side effects. It replaces neither git-guard nor consent rules.
- **How checked:** `defaultMode` is set in the committed settings.json of both repos (implementation in Phase 4).

### W6 — Dynamic Workflows / Ultracode

- **MUST:** low-threshold **task opt-in** per the positive indication list in `policies/model-policy.md`: initial research, approach/architecture exploration, audits, migrations. A calibration run for novel large workflows is recommended, not mandatory.
- **MUST NOT:** run write-capable workflows without the three preconditions: installed hook guardrails (git-guard union, W3) + tight Bash allowlist (W4) + worktree (W8). **Reason:** workflow subagents technically ALWAYS run in `acceptEdits` and inherit the tool allowlist — `plan`/`ask` do not apply there. The protection layer is therefore exclusively hook + allowlist + isolation.
- **Special rule `<PROJECT_B>`:** until the guard migration is done, write-capable workflows in `<PROJECT_B>` run only with explicit PO approval.
- **Version prerequisites (normative):** Dynamic Workflows ≥ Claude Code **2.1.154**; `/goal` ≥ **2.1.139**. The radar run (§4, R3) checks these min-version markers for currency.
- **Formalization:** workflow ADR with these preconditions → `docs/adr/`.
- **How checked:** before every write-capable workflow start: three-precondition check (part of the workflow ADR); token consumption lands in cost telemetry (→ `policies/model-policy.md`).

### W7 — Headless / CI

- **MUST:** reproducible check runs as `claude -p --bare` with `--json-schema` and `--permission-mode dontAsk`: no auto-discovery of hooks/skills/plugins/MCP/CLAUDE.md → total input control, machine-readable verdict. This is the Critic's `--bare` tier for critical diffs.
- **MUST:** `total_cost_usd` from `--output-format json` flows into cost telemetry (instrument → `policies/model-policy.md`).
- **GitHub Action:** where CI automation is wanted: `anthropics/claude-code-action@v1` with the official security defaults — tight `--allowedTools`, `--max-turns`, least-privilege permissions, secrets instead of keys. Actions are SHA-pinned (lesson from `<PROJECT_B>`'s never-completed pin TODO).
- **OPEN (Phase 4):** whether and in which projects the GitHub Action is used (only `<PROJECT_C>` has a PR flow as a natural docking point; cost/benefit per project in the migration dossier).
- **How checked:** the Critic `--bare` call exists as a versioned script with a fixed `--json-schema` — OPEN (Phase 4); until then the comment contract in `templates/prompts/critic-review.md` applies. CI workflows reference actions only by SHA.

### W8 — git worktree

- **MUST:** write-capable goldfish runs are isolated via worktree (`isolation: worktree` resp. `claude --worktree`) — **per project calibration, not blanket.**
- **Why:** parallel write work without collision, officially first-class supported. Windows practice (long paths, node_modules duplication) is ⚠ UNCERTAIN — community experience only, no official statement; hence calibration instead of a blanket rule.
- **Project caveats:** `<PROJECT_C>`: the editor-bound compile gate is fail-open in the worktree — worktree use there only after a validated fallback tier. `<PROJECT_A>`: budget setup cost per worktree (npm install), `.worktreeinclude` for `.env.local`.
- **OPEN (Phase 4):** validate worktree tier + fallback per project and lock it into the project calibration file. `<PROJECT_C>`'s stale-worktree check from `/close` is generalized (WIP rule → `docs/operating-model.md`).
- **How checked:** the project calibration file names the worktree tier explicitly; `/close` contains the stale-worktree check.

### W9 — MCP

- **MUST:** connect MCP ONLY where no CLI and no versioned script can do the same. Rule of thumb: **"gh beats MCP"** — GitHub operations run everywhere over the `gh` CLI, not a GitHub MCP server (official heuristic "connect a server when you find yourself copying data into chat").
- **MUST:** leave Tool Search on (default: deferred loading); `alwaysLoad` only with justification. Why: tool definitions of many servers can cost hundreds of thousands of tokens; progressive disclosure reduced an official example by 98.7%.
- **MUST:** scope by context cost: project-specific servers committed in the project's `.mcp.json`; role-specific servers via `mcpServers:` frontmatter ONLY in the subagent that needs them — the Elephant context stays free.
- **Example:** `<PROJECT_C>`'s `mcp-unreal` stays — the editor API has no CLI, exactly the legitimate MCP case. Deterministic tool bridges like `<PROJECT_B>`'s `<project-b>-*.ps1` scripts are the preferred non-MCP path.
- **OPEN (Phase 4):** check each project's MCP inventory against these criteria; whether `<PROJECT_B>` justifies an MCP server for the home-automation platform is decided there by CLI comparison.
- **How checked:** every committed MCP server carries a justification comment "why no CLI"; the tooling radar (§4) re-checks the existing server inventory on MCP-relevant releases.

---

## 3. Anti-Patterns (Prohibitions)

All four are evidenced in existing practice — they are the reason this policy exists.

### AP-T1 — Inheriting a way of working via copy-paste

- **MUST NOT:** no `.claude/` artifact of the Pipeline (hooks, skills, agents, settings blocks) is manually copied between repos.
- **Evidence:** `guard-git` exists triply diverged, no copy is a superset — every gap in a copy is an unprotected project.
- **Structural fix:** distribution exclusively via plugin/marketplace with a committed binding per project; updates = git push in the Pipeline repo.
- **How checked:** Pipeline artifacts exist exactly once (in the plugin); project repos contain only binding + calibration. Staleness check at bootstrap (→ `harness/session-bootstrap.md`).

### AP-T2 — Rules only in prose

- **MUST NOT:** hard rules without an enforcing artifact (= violation of G1).
- **Evidence:** `<PROJECT_B>`'s CLAUDE.md grew to 578 lines and violated its own lean rule — prose does not even discipline its own author; CLAUDE.md is officially advisory.
- **Structural fix:** the G1 mapping in this matrix; a CLAUDE.md length gate as a deterministic check.
- **How checked:** as G1.

### AP-T3 — Marathon sessions with mixed topics

- **MUST NOT:** work through multiple topics in one session/one context instead of cutting and delegating.
- **Evidence:** in `<PROJECT_B>`, one session mixed evcc bring-up + dashboard + sidebar + tariff analysis + §14a (~30 commits) — revert granularity lost, context poisoned.
- **Structural fix (tooling answer):** one Goldfish = ONE task in a subagent (W2); topic switch in the Elephant = `/clear` + `/rename` instead of muddling on; session hygiene rules in detail → `docs/operating-model.md`.
- **How checked:** blocks are individually revertible (one merge/PR per task); the Critic flags diffs with a recognizable topic mix.

### AP-T4 — Unversioned memory dependencies

- **MUST NOT:** no ritual, skill or briefing may require mandatory artifacts outside the repo (user-scope memory, machine-specific paths).
- **Evidence:** `<PROJECT_A>` mandates reading two memory files that don't exist; `<PROJECT_B>`'s memory path is missing on a fresh clone; `<PROJECT_C>`'s memory is bound to the local repo path — the workflow breaks on every other machine. Directly practice-relevant for the PO's two-machine setup.
- **Structural fix:** ONE versioned handover file per project, memory is only a mirror; Goldfish without a `memory` field; central artifacts path-independent.
- **How checked:** existence check of all referenced mandatory artifacts in the start ritual (missing → name it, don't skip it); fresh-clone test as a bootstrap criterion (→ `harness/session-bootstrap.md`).

---

## 4. Tooling Radar

Claude Code evolves faster than any policy: features like Dynamic Workflows, Tool Search or the `if` field are all younger than a year. Without an institutionalized radar, ADR foundations go stale unnoticed — and unanchored "check regularly" intentions turn into permanent TODOs. Hence:

### R1 — Storage location

Own backlog category **`tooling-radar`** in `backlog/` of the Pipeline repo. The backlog structure is created in Phase 3; this policy defines the category and its contract in advance.

### R2 — Interval and anchor

- **MUST:** check interval **monthly**. Fixed anchor: the **first `/close` of a calendar month in the Pipeline repo** MUST include the radar run; additionally an explicit **`/radar`** run is possible at any time.
- **Catch-up rule:** `/close` compares the date of the last logged radar run against the current month; if the last run is more than one calendar month in the past, it is caught up — so the anchor cannot silently lapse. **Anchor implemented:** check step "Tooling radar due?" in the close-block skill, step 7 (`plugins/pipeline-core/skills/close-block/SKILL.md`) + checklist item in `harness/checklists/session-close.md`.
- **Why this anchor:** `/close` is the only deterministically recurring ritual in the Pipeline repo; a calendar reminder would be an unversioned dependency (AP-T4).

### R3 — Check sources (fixed list)

1. **Claude Code changelog / release notes** (official claude-code repo) — new features, breaking changes, min-version markers.
2. **Anthropic News + engineering blog** — new products/patterns (e.g. Dynamic Workflows appeared there first).
3. **Model/pricing overview of the official docs** — new models, price changes, expiring introductory prices.

The list is extended only via a backlog item, never ad hoc.

### R4 — Output contract

- **MUST:** exactly ONE backlog item per relevant feature, with three mandatory fields:
  1. **What's new** — 1–3 sentences + source + version number/date.
  2. **Affects which Pipeline rule/ADR** — concrete reference (policy section, ADR number, hook/skill) or explicitly "none".
  3. **Recommendation** — exactly one of `review` / `adopt` / `ignore`, with a one-sentence justification.
- **MUST:** result-free runs still produce a zero item ("Radar run YYYY-MM: no relevant changes") — otherwise "did not run" is indistinguishable from "found nothing".

### R5 — Special rule: ADR resubmission

- **MUST:** features that **change the foundation of an existing ADR** — e.g. permission semantics, subagent frontmatter fields, hook events, plugin/marketplace mechanics, model pricing/availability — trigger an **ADR resubmission**: the backlog item is marked accordingly, the affected ADR gets status "resubmission", and the decision (confirm/revise) goes through the Elephant + PO gate — never silently inside the radar run itself.
- **Typical trigger:** a **pricing review**, as soon as the introductory price of a configured model expires (instrument and data → `policies/model-policy.md`). Such an item is created with a due date in the `tooling-radar` category as soon as `backlog/` exists (Phase 3).

### Radar candidates (flagged, NOT to be built)

*(English in the source — agent-facing radar-candidate entries, formatted per the R4 output contract above: what's new / affects which Pipeline rule/ADR / recommendation. These are CANDIDATES ONLY — building either is explicitly out of scope for now (radar pre-flagging only, no build).)*

**Candidate 1 — Scheduled Audit:**
1. What's new: a periodic self-check of the pipeline's own state/guards (drift detection run on a schedule, not only reactively).
2. Affects which Pipeline rule/ADR: this radar (§4) and the `/close` radar anchor (R2) — a scheduled audit would sit alongside, not replace, the existing monthly radar cadence.
3. Recommendation: `review` — trigger: drift accumulates between radar runs, or manual audits keep finding the same class of gap repeatedly (a signal that periodic self-checking, not just the monthly radar, is needed).

**Candidate 2 — Semantic Pre-Execution-Gating:**
1. What's new: a cheap pre-intent check run before a risky single action (e.g. a Bash command against real devices), verifying the action matches the stated intent before it executes.
2. Affects which Pipeline rule/ADR: `guardrails/` (git-guard union, W3) — this would sit ABOVE the deterministic regex/pattern guard layer, not replace it (G1 stays the enforcement floor).
3. Recommendation: `review` — trigger: a class-high project (e.g. `<PROJECT_B>`, real devices) needs intent verification that a regex/pattern guard structurally cannot give (it can block a command SHAPE, not verify the command's semantic intent).

Both candidates share the same discipline: **the lowest level that catches the important thing** — neither is authorized to build here, radar-only for now.

### How checked (entire radar)

The `backlog/` category `tooling-radar` contains at least one item per calendar month (possibly a zero item) — mechanically checkable; the consistency pass resp. the Critic can find gaps mechanically. Resubmission items reference an existing ADR number.

**OPEN (Phase 4):** implementation of the `/radar` skill and the formal file schema of backlog items (frontmatter fields). The `/close` integration of the catch-up rule is delivered: check step "Tooling radar due?" in `plugins/pipeline-core/skills/close-block/SKILL.md` step 7 + `harness/checklists/session-close.md`.

---

## Change log

| Date | Change |
|---|---|
| 2026-07-03 | First version (Sprint 0 Phase 2). |
| 2026-07-09 | Added G5 (spec format: prose in Markdown, structured data flat) + two radar candidates (Scheduled Audit, Semantic Pre-Execution-Gating). |

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# Tooling-Policy — Werkzeugwahl im Claude-Code-Harness

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2

**Zweck.** Diese Policy legt fest, WELCHES Claude-Code-Primitiv für WELCHE Art von Regel oder Arbeit eingesetzt wird — damit Regeln dort landen, wo sie garantiert gelten, und Kontext dort gespart wird, wo er am knappsten ist. Sie gilt für alle Projekte (<PROJECT_A>, <PROJECT_B>, <PROJECT_C>, künftige) und per Selbstanwendung für das Pipeline-Repo selbst.

**Einordnung.** Rollen, SDLC und Session-Lifecycle: `docs/operating-model.md` · Modell/Effort/Kosten inkl. Ultracode-Indikationsliste: `policies/model-policy.md` · Session-Start-Protokoll und Plugin-Staleness-Check: `harness/session-bootstrap.md` · Formalisierte Einzelentscheidungen: `docs/adr/`. Bei Konflikt gilt der kanonische Entscheidungsstand in `docs/state.md`. Diese Policy operationalisiert insbesondere die Plugin-Verteilung, Goldfish/Critic als Subagents, Workflows, Permissions/Worktree/Plan Mode, die git-guard-Union sowie den Tooling-Radar.

---

## 1. Grundsatz

### G1 — Deterministisches gehört in Settings/Hooks, nicht in Prosa

- **Gebot:** Jede Regel, die IMMER gelten muss (Verbote, Schutzpfade, Gates), wird als Permission-Rule oder Hook implementiert — nie ausschließlich als Text in CLAUDE.md oder einer Policy.
- **Warum:** CLAUDE.md ist offiziell „context, not enforced configuration" — advisory, kein Enforcement-Layer. Nur ein PreToolUse-deny-Hook blockiert garantiert, sogar im `bypassPermissions`-Modus. Prosa-Regeln haben in the PO's Projekten nachweislich versagt (→ Anti-Pattern AP-T2, §3).
- **Prüfweise:** Jede als MUSS/NIE/IMMER formulierte Regel in CLAUDE.md oder Projekt-Doku hat ein benanntes durchsetzendes Artefakt (Permission-Rule, Hook, CI-Check) — oder trägt die explizite Markierung „advisory". Der Critic prüft das bei Guardrail-Reviews; der Drift-Check im `/close` bei Regeländerungen.

### G2 — Bei Agent-Fehlern zuerst den Harness debuggen

- **Gebot:** Wenn ein Agent falsch arbeitet, wird in dieser Reihenfolge geprüft, BEVOR Modell oder Effort gewechselt wird: (1) Briefing/Spec vollständig und widerspruchsfrei? (2) Kontext sauber (CLAUDE.md-Länge, Stand-Drift, Themenmix)? (3) Tools/Permissions passend geschnitten — fehlt etwas oder ist etwas zu weit offen? (4) Hooks/Gates korrekt verdrahtet und wirklich gelaufen?
- **Warum:** „Agent = Model + Harness" — das Verhalten wird vom Harness dominiert, Agent-Fehler sind meist Konfigurationsfehler (Google-Leitprinzip). Ein Modellwechsel bei kaputtem Harness verbrennt Tokens und maskiert die Ursache.
- **Prüfweise:** Die Zwei-Fehlversuche-Regel eskaliert an den Elephant; dessen Eskalationsprotokoll (→ `docs/operating-model.md`) beginnt mit dieser Harness-Checkliste. Modell-/Effort-Änderungen als Fehlerreaktion sind begründungspflichtig gegen `policies/model-policy.md`.

### G3 — Zugesagte Kontrollen sind Verträge (Watchdog-Pflicht)

- **Gebot:** Hintergrund-Läufe ohne Zwischenoutput werden NIE ohne automatischen Watchdog gestartet (Monitor/Timeout/Idle-Erkennung mit Auto-Kill und lautem Fehlreport). Eine zugesagte Kontrolle („ich prüfe in 5 Minuten") wird **im selben Zug mechanisiert** (Monitor, Scheduler, Hook) — oder die Zusage wird explizit zurückgezogen. **Der PO ist nie der Watchdog.**
- **Warum:** In einem dokumentierten Vorfall wurde eine versprochene 5-Minuten-Kontrolle nicht gebaut; the PO musste zweimal selbst pollen, zwei Headless-Läufe hingen still (15+ min, 0 Bytes Output). Ein Versprechen ist Prosa; nur ein Mechanismus kontrolliert — G1-Logik, angewandt auf Prozess-Zusagen statt Regeln.
- **Prüfweise:** Jeder Background-Start hat in der Trajektorie einen benannten, sichtbaren Watchdog-Mechanismus; die goldfish-dispatch-Checkliste führt den Punkt; der Critic flaggt Background-Läufe ohne Watchdog in der Trajektorienprüfung.

### G4 — Smoke-Test-Pflicht für neue Transportwege

- **Gebot:** Bevor ein teurer oder langer Lauf an einen NEUEN Transportweg gehängt wird (Headless-CLI, Background-Ausführung, stdin-/cwd-/Auth-Konstellation, CI-Pfad), läuft ein ~30-Sekunden-Trivialaufruf durch den **vollen** Pfad — gleiche Flags, gleicher Ausführungskontext (Background ja/nein, stdin-Quelle, Arbeitsverzeichnis, Credentials). Erst grüner Smoke-Test, dann Nutzlast.
- **Warum:** Alle drei dokumentierten Headless-Defekte (`--bare`-Credential-Bug, Workspace-Deadlock ohne `--add-dir`, stdin-Pipe-Hänger im Background) hätte ein 30-Sekunden-Test durch den vollen Pfad vorab gefunden — stattdessen kosteten sie zwei stille Hänger in einer Arbeitssession.
- **Prüfweise:** Die Erstnutzung eines Transportwegs zeigt in der Trajektorie den Trivialaufruf VOR dem Erstlauf; die Telemetrie-Spalte „Besonderheiten" vermerkt den Smoke-Test bei neuen Pfaden.

### G5 — Spec-Format: prose in Markdown, structured data stays flat (NEU)

*(English in the source — agent-facing authoring guideline, same convention as MP-22/23/24 in `policies/model-policy.md`.)*

- **Gebot (advisory — no enforcing hook, see G1 Prüfweise):** Prose belongs in Markdown; structured data (frontmatter, config, checklists, enums, tables) stays FLAT — avoid deep nesting and format overhead. This is guidance on choosing the right flatness WITHIN the existing spec format, not a mandate to switch formats — no move to Gherkin/BDD is intended or in scope (no evidence surfaced that the existing format itself is the wrong choice).
- **Warum:** Deep nesting and format overhead cost tokens and readability without adding information; flat structured data reads and diffs cleaner for both agent and human reviewer.
- **Prüfweise:** Spec/template authoring review flags deeply-nested structured blocks that could be flattened; advisory only (no hook) — marked as such per the G1 advisory requirement, not silently assumed enforced.

---

## 2. Werkzeug-Matrix

Übersicht: Aufgabentyp → Werkzeug. Die verbindlichen Regeln je Werkzeug (W1–W9) folgen darunter.

| Aufgabentyp | Werkzeug | Warum | Beispiel aus the PO's Projekten |
|---|---|---|---|
| Ritual/Prozedur, vom Menschen getimed | **Skill** mit `disable-model-invocation: true` | Body lädt erst bei Aufruf (Progressive Disclosure); Mensch kontrolliert Nebenwirkungen | `/new-block-review` + `/close` (alle drei Projekte) |
| Prozedurales Wissen für das Modell | **Skill** (default bzw. `user-invocable: false`) | Nur die description kostet dauerhaft Kontext | Spec-Schreib-Protokoll, Critic-Aufrufprozedur (Phase 3) |
| Abgegrenzte Umsetzung, frischer Kontext | **Subagent** (Goldfish) | Eigenes Kontextfenster, keine History-Leaks, Summary-Rückgabe | Ein geschnittener <PROJECT_A>-Block als Ein-Auftrag-Run |
| Unabhängige Prüfung | **Subagent read-only** (Critic); `--bare`-Stufe für kritische Diffs | Kontext-Isolation vom Bau-Kontext; `--bare` = totale Input-Kontrolle | Adversariale Reviews vor <PROJECT_B>-Live-Umbauten (bisher ad hoc) |
| Verbose Arbeit (Testläufe, Logs, Doku-Fetches) | **Subagent** | Output verstopft nicht den Hauptkontext | Playwright-Lauf-Analyse in <PROJECT_A> |
| Unverhandelbare Regel | **Hook** (PreToolUse-deny, Stop-Gate, SessionStart) | Einzige Ebene, die auch in `bypassPermissions` hält | `guard-git`, `lint-on-stop` (<PROJECT_A>), `cpp-compile-on-stop` (<PROJECT_C>) |
| Erlaubnis-Grenzen je Repo | **settings.json-Permissions** (committed) | allow/ask/deny deterministisch, versioniert, klon-reproduzierbar | <PROJECT_B>: deny auf `secrets.yaml`/`.storage`; <PROJECT_A>: allow `Bash(npm run *)` |
| Teure Fehländerungen vermeiden | **Plan Mode** (`defaultMode: plan`) | Read-only-Exploration vor jedem Edit | <PROJECT_B> (lebendes Haus) + <PROJECT_C> (Engine-Code) |
| Massiv-parallele Recherche / Audit / Migration | **Dynamic Workflow / Ultracode** (Task-Opt-in) | Zwischenergebnisse leben im Skript, nicht im Kontext | <PROJECT_C>-weite API-Migration; <PROJECT_B>-Config-Audit; Sprint-0-Tiefenrecherche |
| Reproduzierbarer Prüflauf / CI | **Headless** `claude -p --bare` / GitHub Action | Kein Auto-Discovery, maschinenlesbares Verdikt, Kosten pro Lauf messbar | Critic-`--bare`-Stufe; perspektivisch PR-Checks in <PROJECT_C> |
| Schreibende Parallel-Arbeit isolieren | **git worktree** (gemäß Projekt-Kalibrierung) | Parallele Goldfische kollidieren nicht; revertierbar | Nacht-Build-Muster der <PROJECT_A> („nur auf Branch") als Worktree-Nachfolger |
| Fremdsystem ohne brauchbare CLI | **MCP** (Minimalismus) | Nur dann rechtfertigt der Kontextpreis den Anschluss | `mcp-unreal` in <PROJECT_C> (Editor-API hat keine CLI) |

### W1 — Skill

- **Gebot:** Rituale und Prozeduren leben als versionierte Skills im Plugin — nie als Prosa-Abschnitt in CLAUDE.md. Skills mit Nebenwirkungen, die der Mensch timen soll (Close, Merge, Radar), bekommen `disable-model-invocation: true`; reines Hintergrundwissen `user-invocable: false`.
- **Warum:** Progressive Disclosure — nur die description ist dauerhaft im Kontext, der Body lädt bei Invokation. Genau das löst die CLAUDE.md-Wucherung (AP-T2).
- **Beispiel:** Das Ritual-Paar `/new-block-review` + `/close` existiert bereits in allen drei Projekten als Skill — die Pipeline zentralisiert es parametrisiert (Mechanismus → `docs/operating-model.md`).
- **Prüfweise:** CLAUDE.md der Projekte enthält Fakten, Kommandos und Verweise — keine Schritt-für-Schritt-Prozeduren (Längen-Gate). Frontmatter-Review der Invocation-Schalter im Critic-Durchgang von Phase 3.

### W2 — Subagent (Goldfish / Critic / verbose Arbeit)

- **Gebot:** Goldfish = Custom Subagent OHNE `memory`-Feld. Warum kein memory: Das Feld aktiviert automatisch Write/Edit und widerspricht der Goldfish-Definition „frischer Kontext, vergisst".
- **Gebot:** Critic = read-only Subagent (Tool-Allowlist ohne Write/Edit, kein memory); für Architektur-/Guardrail-/Security-Diffs die härtere `--bare`-Stufe (W7). Der Critic sieht nie den Chat-Verlauf.
- **Gebot:** Verbose Arbeit (Testsuiten, Log-Analysen, Doku-Fetches) in Subagents auslagern; nur die Summary kehrt zurück.
- **Gebot (Read-only technisch erzwingen):** Dispatches, die nichts schreiben sollen (Text-Return-Drafts, Recherche, Review-Vorbereitung), laufen auf einem **read-only Agent-Typ** (Tool-Allowlist ohne Write/Edit) — nie mit bloßem Schreibverbot im Briefing-Text. **Beleg:** In einem dokumentierten Vorfall schrieben zwei Drafter trotz expliziter Read-only-Anweisung direkt auf Disk. Prosa begrenzt nicht; Toolsets begrenzen. **Prüfweise:** Dispatch-Metadaten nennen den Agent-Typ; ein Briefing mit Schreibverbot auf schreibfähigem Agent-Typ flaggt der Critic als Dispatch-Fehler des Elephant.
- **Achtung:** Custom Subagents laden CLAUDE.md + Git-Status automatisch — das Goldfish-Briefing muss also nur die Task-Spec enthalten, nicht die Projektregeln; wer volle Input-Isolation braucht, nimmt die `--bare`-Stufe.
- **Beispiel:** Die wirksamen Ad-hoc-Adversarial-Reviews aus <PROJECT_A>/<PROJECT_B> werden als Critic-Subagent institutionalisiert; ein <PROJECT_A>-Block wird als Ein-Auftrag-Goldfish umgesetzt statt in der Marathon-Session (AP-T3).
- **Prüfweise:** Frontmatter-Kontrolle der Plugin-Agents (Phase 3): `goldfish` ohne `memory`, `critic` ohne Write/Edit. Der Critic-Kontrakt prüft zusätzlich die Trajektorie.

### W3 — Hook

- **Gebot:** Unverhandelbare Regeln als Hooks: (1) git-guard als PreToolUse-deny — zentrale **Union** aller drei Projekt-Inkarnationen + Projekt-Deny-Config; (2) Stop-Gates, die das EINE verify-Skript des Projekts fahren; (3) SessionStart-Reinjection (Matcher `compact`) für den Pipeline-Zustand langlebiger Elephant-Sessions.
- **Design-Regeln (aus dem Bestand übernommen):** fail-open als Sicherheitsnetz, exit 2 mit Klartext-Begründung, Warum-Header in jedem Guard; Stop-Hook-Block-Cap und `stop_hook_active` beachten.
- **Warum:** PreToolUse-deny hält auch in `bypassPermissions` — die einzige Ebene, die für Workflow-Subagents in `acceptEdits` trägt (W6).
- **Beispiel:** `guard-git.mjs` existiert dreifach divergiert, keine Kopie ist Superset — der klarste Beleg, warum Hooks zentral versioniert und verteilt werden müssen.
- **Prüfweise:** Hooks liegen in `hooks/hooks.json` des Plugins; je Deny-Regel existiert ein Testfall (Block- + Allow-Gegenfall: `plugins/pipeline-core/hooks/guard-git.test.mjs`, Lauf mit `node`); Hook-Ausführung ist in der Trajektorie sichtbar und wird vom Critic geprüft. Das Stop-Hook-Gate-Framework (Punkt 2) ist OFFEN (Phase 4).

### W4 — settings.json-Permissions

- **Gebot:** allow/ask/deny je Repo in `.claude/settings.json` committed; persönliche Lockerungen nur in `settings.local.json` (nicht committet).
- **Verbot:** Sicherheit über fragile Bash-Argument-Patterns bauen. Stattdessen: eng geschnittene denies + `WebFetch(domain:…)`-Allowlist oder PreToolUse-Validator-Hook (offizielle Warnung).
- **Warum:** Auswertung deny → ask → allow, first match; ein deny ist auf keiner Ebene aufhebbar — deshalb denies eng schneiden statt breit + Ausnahme.
- **Beispiel:** <PROJECT_B>: deny auf `secrets.yaml`/`.storage` (heute im guard-git, künftig zusätzlich als Permission); <PROJECT_C>: Content-Pack-Denies; <PROJECT_A>: allow `Bash(npm run *)`.
- **Prüfweise:** Frischer-Klon-Test: ein frisch geklontes Projekt-Repo hat identische Permission-Grenzen ohne Handarbeit (Bootstrap-Check → `harness/session-bootstrap.md`).

### W5 — Plan Mode

- **Gebot:** `defaultMode: plan` in der committeten settings.json von **<PROJECT_B> und <PROJECT_C>** — überall, wo eine falsche Änderung teuer ist (scharfes Alarmsystem/Live-Geräte bzw. Engine-Code mit Buildkosten und PIE-Abnahme).
- **Warum:** Plan Mode ist ein Permission-Mode: read-only-Exploration, Plan-Vorschlag, erst die Freigabe schaltet in den Ausführungsmodus; die Recherche läuft im Plan-Subagent und flutet den Hauptkontext nicht.
- **Gate-Grenze ehrlich benennen:** Plan Mode schützt Quellcode — genehmigte explorative Bash-Kommandos können trotzdem Seiteneffekte haben. Er ersetzt weder git-guard noch Zustimmungsregeln.
- **Prüfweise:** `defaultMode` steht in der committeten settings.json beider Repos (Umsetzung in Phase 4).

### W6 — Dynamic Workflows / Ultracode

- **Gebot:** Niedrigschwelliger **Task-Opt-in** gemäß der positiven Indikationsliste in `policies/model-policy.md`: initiale Recherchen, Vorgehensmodell-/Architektur-Exploration, Audits, Migrationen. Kalibrierlauf bei neuartigen großen Workflows empfohlen, keine Pflicht.
- **Verbot:** Schreibende Workflows ohne die drei Vorbedingungen: installierte Hook-Guardrails (git-guard-Union, W3) + enge Bash-Allowlist (W4) + Worktree (W8). **Grund:** Workflow-Subagents laufen technisch IMMER in `acceptEdits` und erben die Tool-Allowlist — `plan`/`ask` greifen dort nicht. Die Schutzebene ist also ausschließlich Hook + Allowlist + Isolation.
- **Sonderregel <PROJECT_B>:** Bis zur Guard-Migration laufen schreibende Workflows in <PROJECT_B> nur mit expliziter the PO-Freigabe.
- **Versionsvoraussetzungen (normativ):** Dynamic Workflows ≥ Claude Code **2.1.154**; `/goal` ≥ **2.1.139**. Der Radar-Lauf (§4, R3) prüft diese min-version-Marker auf Aktualität.
- **Formalisierung:** Workflow-ADR mit diesen Vorbedingungen → `docs/adr/`.
- **Prüfweise:** Vor jedem schreibenden Workflow-Start: Drei-Vorbedingungen-Check (Teil des Workflow-ADR); Token-Verbrauch landet in der Kosten-Telemetrie (→ `policies/model-policy.md`).

### W7 — Headless / CI

- **Gebot:** Reproduzierbare Prüfläufe als `claude -p --bare` mit `--json-schema` und `--permission-mode dontAsk`: kein Auto-Discovery von Hooks/Skills/Plugins/MCP/CLAUDE.md → totale Input-Kontrolle, maschinenlesbares Verdikt. Das ist die `--bare`-Stufe des Critic für kritische Diffs.
- **Gebot:** `total_cost_usd` aus `--output-format json` fließt in die Kosten-Telemetrie (Instrument → `policies/model-policy.md`).
- **GitHub Action:** Wo CI-Automation gewünscht ist: `anthropics/claude-code-action@v1` mit den offiziellen Sicherheits-Defaults — enge `--allowedTools`, `--max-turns`, Least-Privilege-Permissions, Secrets statt Keys. Actions werden SHA-gepinnt (Lehre aus <PROJECT_B>s nie erledigtem Pin-TODO).
- **OFFEN (Phase 4):** Ob und in welchen Projekten die GitHub Action eingesetzt wird (nur <PROJECT_C> hat einen PR-Flow als natürlichen Andockpunkt; Kosten-Nutzen je Projekt im Migrationsdossier).
- **Prüfweise:** Der Critic-`--bare`-Aufruf existiert als versioniertes Skript mit festem `--json-schema` — OFFEN (Phase 4); bis dahin gilt der Kommentar-Kontrakt in `templates/prompts/critic-review.md`. CI-Workflows referenzieren Actions nur per SHA.

### W8 — git worktree

- **Gebot:** Schreibende Goldfische werden per Worktree isoliert (`isolation: worktree` bzw. `claude --worktree`) — **gemäß Projekt-Kalibrierung, nicht pauschal**.
- **Warum:** Parallele Schreibarbeit ohne Kollision, offiziell first-class unterstützt. Die Windows-Praxis (lange Pfade, node_modules-Duplizierung) ist ⚠ UNSICHER — nur Community-Erfahrung, keine offizielle Aussage; deshalb Kalibrierung statt Pauschale.
- **Projekt-Vorbehalte:** <PROJECT_C>: das Editor-gebundene Compile-Gate ist im Worktree fail-open — Worktree-Einsatz dort erst nach validierter Fallback-Stufe. <PROJECT_A>: Setup-Kosten je Worktree (npm install) einkalkulieren, `.worktreeinclude` für `.env.local`.
- **OFFEN (Phase 4):** Worktree-Stufe + Fallback je Projekt validieren und in der Projekt-Kalibrierungsdatei festschreiben. <PROJECT_C>s Stale-Worktree-Check aus dem `/close` wird generalisiert (WIP-Regel → `docs/operating-model.md`).
- **Prüfweise:** Die Projekt-Kalibrierungsdatei nennt die Worktree-Stufe explizit; `/close` enthält den Stale-Worktree-Check.

### W9 — MCP

- **Gebot:** MCP NUR anschließen, wo keine CLI und kein versioniertes Skript dasselbe leisten. Merkregel: **„gh schlägt MCP"** — GitHub-Operationen laufen überall über die `gh`-CLI, nicht über einen GitHub-MCP-Server (offizielle Heuristik „connect a server when you find yourself copying data into chat").
- **Gebot:** Tool Search angelassen (Default: deferred loading); `alwaysLoad` nur mit Begründung. Warum: Tool-Definitionen vieler Server können Hunderttausende Tokens kosten; Progressive Disclosure reduzierte ein offizielles Beispiel um 98,7 %.
- **Gebot:** Scoping nach Kontextpreis: projektspezifische Server committed in `.mcp.json` des Projekts; rollenspezifische Server per `mcpServers:`-Frontmatter NUR im Subagent, der sie braucht — der Elephant-Kontext bleibt frei.
- **Beispiel:** <PROJECT_C>s `mcp-unreal` bleibt — die Editor-API hat keine CLI, genau der legitime MCP-Fall. Deterministische Tool-Brücken wie <PROJECT_B>s `<project-b>-*.ps1`-Skripte sind der bevorzugte Nicht-MCP-Weg.
- **OFFEN (Phase 4):** MCP-Bestand jedes Projekts gegen diese Kriterien prüfen; ob <PROJECT_B> einen MCP-Server für die home-automation platform rechtfertigt, entscheidet der CLI-Vergleich dort.
- **Prüfweise:** Jeder committete MCP-Server trägt einen Begründungs-Kommentar „warum keine CLI"; der Tooling-Radar (§4) prüft Bestandsserver bei MCP-relevanten Releases erneut.

---

## 3. Anti-Patterns (Verbote)

Alle vier sind im Bestand nachgewiesen — sie sind der Grund, warum diese Policy existiert.

### AP-T1 — Arbeitsweise per Copy-Paste vererben

- **Verbot:** Kein `.claude/`-Artefakt der Pipeline (Hooks, Skills, Agents, Settings-Blöcke) wird manuell zwischen Repos kopiert.
- **Beleg:** `guard-git` existiert dreifach divergiert, keine Kopie ist Superset — jede Lücke einer Kopie ist ein ungeschütztes Projekt.
- **Struktureller Weg:** Verteilung ausschließlich über Plugin/Marketplace mit committeter Bindung je Projekt; Updates = git push im Pipeline-Repo.
- **Prüfweise:** Pipeline-Artefakte existieren genau einmal (im Plugin); Projekt-Repos enthalten nur Bindung + Kalibrierung. Staleness-Check beim Bootstrap (→ `harness/session-bootstrap.md`).

### AP-T2 — Regeln nur in Prosa

- **Verbot:** Harte Regeln ohne durchsetzendes Artefakt (= Verstoß gegen G1).
- **Beleg:** <PROJECT_B>s CLAUDE.md wucherte auf 578 Zeilen und verletzte die eigene Schlank-Regel — Prosa diszipliniert nicht einmal ihren eigenen Autor; CLAUDE.md ist offiziell advisory.
- **Struktureller Weg:** G1-Zuordnung dieser Matrix; CLAUDE.md-Längen-Gate als deterministischer Check.
- **Prüfweise:** wie G1.

### AP-T3 — Marathon-Sessions mit Themenmix

- **Verbot:** Mehrere Themen in einer Session/einem Kontext abarbeiten, statt zu schneiden und zu delegieren.
- **Beleg:** In <PROJECT_B> mischte eine Session evcc-Bringup + Dashboard + Sidebar + Tarif-Analyse + §14a (~30 Commits) — Revert-Granularität verloren, Kontext vergiftet.
- **Struktureller Weg (Tooling-Antwort):** Ein Goldfish = EIN Auftrag im Subagent (W2); Themenwechsel im Elephant = `/clear` + `/rename` statt Weiterwursteln; Session-Hygiene-Regeln im Detail → `docs/operating-model.md`.
- **Prüfweise:** Blöcke sind einzeln revertierbar (ein Merge/PR je Auftrag); der Critic flaggt Diffs mit erkennbarem Themenmix.

### AP-T4 — Unversionierte Memory-Abhängigkeiten

- **Verbot:** Kein Ritual, Skill oder Briefing darf Pflicht-Artefakte außerhalb des Repos voraussetzen (User-Scope-Memory, maschinenspezifische Pfade).
- **Beleg:** <PROJECT_A> verlangt Pflichtlektüre zweier Memory-Dateien, die nicht existieren; <PROJECT_B>s Memory-Pfad fehlt auf frischem Klon; <PROJECT_C>s Memory ist an den lokalen Repo-Pfad gekoppelt — der Workflow bricht auf jeder zweiten Maschine. Für the PO's Zwei-Rechner-Betrieb unmittelbar praxisrelevant.
- **Struktureller Weg:** EINE versionierte Handover-Datei je Projekt, Memory ist nur Spiegel; Goldfish ohne `memory`-Feld; zentrale Artefakte pfadunabhängig.
- **Prüfweise:** Existenz-Check aller referenzierten Pflicht-Artefakte im Start-Ritual (fehlt → benennen, nicht überspringen); Frischer-Klon-Test als Bootstrap-Kriterium (→ `harness/session-bootstrap.md`).

---

## 4. Tooling-Radar

Claude Code entwickelt sich schneller als jede Policy: Features wie Dynamic Workflows, Tool Search oder das `if`-Feld sind alle jünger als ein Jahr. Ohne institutionalisierten Radar veralten ADR-Grundlagen unbemerkt — und ungeankerte „regelmäßig prüfen"-Vorsätze werden zu permanenten TODOs. Deshalb:

### R1 — Ablageort

Eigene Backlog-Kategorie **`tooling-radar`** in `backlog/` des Pipeline-Repos. Die Backlog-Struktur entsteht in Phase 3; diese Policy definiert Kategorie und Kontrakt vorab.

### R2 — Intervall und Anker

- **Gebot:** Prüfintervall **monatlich**. Fester Anker: der **erste `/close` eines Kalendermonats im Pipeline-Repo** MUSS den Radar-Lauf enthalten; zusätzlich ist jederzeit ein expliziter **`/radar`-Lauf** möglich.
- **Nachhol-Regel:** Der `/close` vergleicht das Datum des letzten protokollierten Radar-Laufs mit dem aktuellen Monat; liegt der letzte Lauf länger als einen Kalendermonat zurück, wird nachgeholt — der Anker kann also nicht still verfallen. **Anker implementiert:** Prüfschritt „Tooling-Radar fällig?" im close-block-Skill, Schritt 7 (`plugins/pipeline-core/skills/close-block/SKILL.md`) + Checklisten-Punkt in `harness/checklists/session-close.md`.
- **Warum dieser Anker:** `/close` ist das einzige deterministisch wiederkehrende Ritual im Pipeline-Repo; ein Kalender-Reminder wäre eine unversionierte Abhängigkeit (AP-T4).

### R3 — Prüfquellen (feste Liste)

1. **Claude-Code-Changelog / Release Notes** (offizielles claude-code-Repo) — neue Features, Breaking Changes, min-version-Marker.
2. **Anthropic News + Engineering-Blog** — neue Produkte/Muster (z. B. war Dynamic Workflows dort zuerst).
3. **Modell-/Preisübersicht der offiziellen Docs** — neue Modelle, Preisänderungen, auslaufende Einführungspreise.

Erweiterung der Liste nur per Backlog-Item, nicht ad hoc.

### R4 — Output-Kontrakt

- **Gebot:** Je relevantem Feature genau EIN Backlog-Item mit drei Pflichtfeldern:
  1. **Was ist neu** — 1–3 Sätze + Quelle + Versionsnummer/Datum.
  2. **Betrifft welche Pipeline-Regel/ADR** — konkrete Referenz (Policy-Abschnitt, ADR-Nummer, Hook/Skill) oder explizit „keine".
  3. **Empfehlung** — genau eines von `prüfen` / `adoptieren` / `ignorieren`, mit Ein-Satz-Begründung.
- **Gebot:** Ergebnislose Läufe erzeugen ein Null-Item („Radar-Lauf YYYY-MM: keine relevanten Änderungen") — sonst ist Nicht-Gelaufen von Nichts-Gefunden nicht unterscheidbar.

### R5 — Sonderregel: ADR-Wiedervorlage

- **Gebot:** Features, die die **Grundlage einer bestehenden ADR ändern** — z. B. Permission-Semantik, Subagent-Frontmatter-Felder, Hook-Events, Plugin-/Marketplace-Mechanik, Modellpreise/-verfügbarkeit — triggern eine **ADR-Wiedervorlage**: Das Backlog-Item wird entsprechend markiert, die betroffene ADR erhält den Status „Wiedervorlage", und der Entscheid (bestätigen/revidieren) fällt durch Elephant + the PO-Gate — nie still im Radar-Lauf selbst.
- **Typischer Auslöser:** eine **Preis-Review**, sobald der Einführungspreis eines konfigurierten Modells ausläuft (Instrument und Daten → `policies/model-policy.md`). Ein solches Item wird mit Fälligkeitsdatum in der Kategorie `tooling-radar` angelegt, sobald `backlog/` existiert (Phase 3).

### Radar-Kandidaten (vorgemerkt, KEIN Bau)

*(English in the source — agent-facing radar-candidate entries, formatted per the R4 output contract above: Was ist neu / Betrifft welche Pipeline-Regel/ADR / Empfehlung. These are CANDIDATES ONLY — building either is explicitly out of scope for now (radar pre-flagging only, no build).)*

**Candidate 1 — Scheduled Audit:**
1. Was ist neu: a periodic self-check of the pipeline's own state/guards (drift detection run on a schedule, not only reactively).
2. Betrifft welche Pipeline-Regel/ADR: this radar (§4) and the `/close` radar anchor (R2) — a scheduled audit would sit alongside, not replace, the existing monthly radar cadence.
3. Empfehlung: `prüfen` — trigger: drift accumulates between radar runs, or manual audits keep finding the same class of gap repeatedly (a signal that periodic self-checking, not just the monthly radar, is needed).

**Candidate 2 — Semantic Pre-Execution-Gating:**
1. Was ist neu: a cheap pre-intent check run before a risky single action (e.g. a Bash command against real devices), verifying the action matches the stated intent before it executes.
2. Betrifft welche Pipeline-Regel/ADR: `guardrails/` (git-guard-Union, W3) — this would sit ABOVE the deterministic regex/pattern guard layer, not replace it (G1 stays the enforcement floor).
3. Empfehlung: `prüfen` — trigger: a class-high project (e.g. <PROJECT_B>, real devices) needs intent verification that a regex/pattern guard structurally cannot give (it can block a command SHAPE, not verify the command's semantic intent).

Both candidates share the same discipline: **the lowest level that catches the important thing** — neither is authorized to build here, radar-only for now.

### Prüfweise (gesamter Radar)

`backlog/`-Kategorie `tooling-radar` enthält je Kalendermonat mindestens ein Item (ggf. Null-Item) — maschinell prüfbar; der Konsistenz-Pass bzw. Critic kann Lücken mechanisch finden. Wiedervorlage-Items referenzieren eine existierende ADR-Nummer.

**OFFEN (Phase 4):** Implementierung des `/radar`-Skills und das formale Dateischema der Backlog-Items (Frontmatter-Felder). Die `/close`-Integration der Nachhol-Regel ist geliefert: Prüfschritt „Tooling-Radar fällig?" in `plugins/pipeline-core/skills/close-block/SKILL.md` Schritt 7 + `harness/checklists/session-close.md`.

---

## Änderungsverlauf

| Datum | Änderung |
|---|---|
| 2026-07-03 | Erstfassung (Sprint 0 Phase 2). |
| 2026-07-09 | G5 (Spec-Format: Prosa in Markdown, Strukturdaten flach) + zwei Radar-Kandidaten (Scheduled Audit, Semantic Pre-Execution-Gating) ergänzt. |
