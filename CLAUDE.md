# CLAUDE.md — Agent-Pipeline

Central, versioned Operating Model for agentic development across the PO's projects (<PROJECT_A>, <PROJECT_B>, <PROJECT_C>, future ones). This file governs work **in this repo**. Per [ADR-0015](docs/adr/0015-selbstanwendung.md), the Pipeline's own working model applies to the Pipeline repo itself — there is no separate meta-ruleset for "building the Pipeline" versus "working under the Pipeline."

## Session bootstrap (mandatory, every session)

1. **Read `docs/state.md` first.** It is the single canonical handover file ([ADR-0012](docs/adr/0012-handover-kanonisierung.md)) — current phase, the decision register, open items, next steps. It wins on conflict with anything below.
2. **Run the bootstrap protocol:** [`harness/session-bootstrap.md`](harness/session-bootstrap.md) (full spec; executable form: `/pipeline-core:pipeline-start`, shipped in `plugins/pipeline-core`). It checks regelwerk staleness, project calibration, handover freshness, and verify-gate availability, and ends in a mandatory confirmation line — no work starts before that line is printed.
3. **Elephant sessions additionally:** set and verify model/effort per [`policies/model-policy.md`](policies/model-policy.md) (MP-01), confirm `CLAUDE_CODE_SUBAGENT_MODEL` is unset (MP-04).
4. Role definitions live in [`roles/`](roles/) (`elephant.md`, `goldfish.md`, `critic.md`); [`docs/operating-model.md`](docs/operating-model.md) §2 remains authoritative on conflict.

## Hard rules

- **Read-only toward the three project repos** (<PROJECT_A>, <PROJECT_B>, <PROJECT_C>) for the duration of Sprint 0: `git fetch/pull/clone` and reading only, never a write — until an explicitly approved Phase-4 migration changes this per project.
- **Push policy:** pushing `main` to origin at work-package boundaries is **standing-approved** in this repo — the PO holds both the PO and CEO role, not a developer; the agent commits AND pushes ("gerade im Automode musst du einfach pushen dürfen"). What stays forbidden is enforced by the guard union, not by asking: never force-push, never rewrite history, never delete protected branches/tags, never skip hooks. Project repos keep their own calibration rules (GIT-05).
- **Conventional Commits; small, atomic commits** — one concern per commit, per work package.
- **No secrets, tokens, or machine-specific absolute paths** in docs, prompts, or commits — this repo runs on two machines with different local paths. Reference paths repo-relative.
- **Language per [ADR-0011](docs/adr/0011-sprachen-policy.md):** agent-facing artifacts (this file, `guardrails/`, `roles/`, `templates/` incl. `templates/prompts/`, Skill/Agent/Hook frontmatter) in English; human-facing docs (`README.md`, backlog item prose, reviews, commit messages) in German. Mixed cases: primary-reader rule.
- **Model discipline:** every dispatch (Goldfish/Critic briefing) names its model explicitly in the "Dispatch-Metadaten" field ([`docs/operating-model.md`](docs/operating-model.md) §2.3) — the implement-tier model by default, the design-tier (higher-capability) model only with a stated rationale (MP-05/MP-07). Subagents otherwise silently inherit the session's model; that silent inheritance is the failure mode this rule closes.
- **Persist immediately; never rely on chat history.** Decisions, state changes, and insights go into files as they happen — a session is a cache on the persisted artifact, not the record of truth (operating-model §5.1).
- **Self-application:** this repo's own checkpoint deliverables get an independent Critic review (fresh context, structured findings, [ADR-0014](docs/adr/0014-critic-kontrakt.md)) BEFORE the PO's gate — the same contract the Pipeline imposes on the projects it governs.

## Where things live

- **Normative core:** [`docs/operating-model.md`](docs/operating-model.md) — roles (§2), SDLC (§3), review system (§4), session lifecycle (§5), handover (§6), feedback loop (§7), project calibration (§8).
- **Decision record (canonical on conflict):** [`docs/state.md`](docs/state.md) — the decision register, current phase, open items.
- **Formalized decisions:** [`docs/adr/`](docs/adr/) (index: `docs/adr/README.md`).
- **Policies:** [`policies/model-policy.md`](policies/model-policy.md) (model/effort/cost/telemetry), [`policies/tooling-policy.md`](policies/tooling-policy.md) (tool-type matrix, tooling radar).
- **Role contracts:** [`roles/`](roles/) — `elephant.md`, `goldfish.md`, `critic.md`.
- **Guardrails:** [`guardrails/`](guardrails/) — provable gebot/verbot rules: `global.md`, `git.md`, `security.md`, `quality-gates.md`, `token-budget.md`.
- **Templates/prompts:** [`templates/`](templates/) (+ `templates/prompts/`) — spec/ADR/roadmap/retro/CLAUDE.project templates, copy-paste-ready dispatch prompts.
- **Plugin:** `plugins/pipeline-core/` — git-guard-union hook (+ test script), skills `pipeline-start`/`critic-review`/`close-block`/`conventional-commit`/`advisor-consult`, agents `goldfish-implementor`/`critic`/`plan-verifier`/`consult-advisor`; marketplace manifest in `.claude-plugin/` (`claude plugin validate` passes). End-to-end install verification on both machines: OPEN (Phase 4).
- **Manifest (optional, additive):** `.claude/pipeline.yaml` — declarative phases/gates/security/model-routing/governance layer next to `.claude/pipeline.json` (zero field overlap); validator `harness/scripts/validate-manifest.mjs`; [ADR-0028](docs/adr/0028-manifest-ansatz.md).
- **Governance layer:** [`governance/examples/`](governance/examples/README.md) — advisory guidelines vs. enforcing policies for a hosted project; [ADR-0030](docs/adr/0030-governance-layer.md).
- **Improvement/feedback:** [`backlog/`](backlog/) — process in `backlog/README.md`.

## Environment note

If `git` is unexpectedly missing from a session's PATH, treat it as a stale shell environment, not a missing install — the verified install location and version live in `docs/state.md` (machine-specific; do not hardcode a path here).

---
*Kept intentionally short (context economy, operating-model §5.2/P5): nothing explained elsewhere is repeated here — follow the pointers instead.*
