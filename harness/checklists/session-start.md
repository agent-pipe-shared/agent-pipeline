# Checklist — Session Start

> Agent-Pipeline v0.1.0-draft · Phase 3 · Compact operative reference; why + verification per step live in the normative spec `harness/session-bootstrap.md`. Executable form: session-start skill in `plugins/pipeline-core` (authored in parallel; final name follows the plugin namespace, cf. session-bootstrap §3).

Role variants: Elephant = full · Goldfish/Critic = compact (`harness/session-bootstrap.md` §6). No work before the confirmation line.

## Elephant (full)

- [ ] 1 Plugin `pipeline-core` present; loaded SHA/version concretely identified
- [ ] 1a Role-path-only load: only the active role's section is read (`harness/session-bootstrap.md` §6.1/6.2/6.3, or the Elephant profile variant §6.4/§6.5) — not the other roles' full text; target context after bootstrap ≤ ~75k tokens, spot-checked via the statusline
- [ ] 2 Model/effort set + verified per chosen profile (bootstrap step 1b): profile `advisor` (cost/quality) → design-tier model + max effort + the optional advisor enabled from session start (MP-26 — recommended default while the advisor model is not covered by your subscription); profile `design-first` (cost+/quality+) → **phase-aware** — design already approved → design-tier model + max effort from session start; otherwise run the orchestrator on a higher-capability model + xhigh effort until the PRD-gate switch, then ONE switch to the design-tier model + max effort (EL-24) — session-only, set EVERY start; `max` effort NOT generically recommended — only for design-tier fallback operation, implement-tier dispatches, the PO-designated special tasks (or ultracode opt-in), or planned execution-phase high-tier operation; profile `speed` (mini-feature/hotfix) → model/effort/advisor per `policies/model-policy.md` (MP-28) from session start, light bootstrap + light process, hard scope ≤~5 files/no guardrail-canon files/no new deps, breach → mandatory escalation to full profile (`harness/session-bootstrap.md` §6.5); advisory duty = name the option when the PO designates such a task, the PO decides (MP-01/MP-17)
- [ ] 3 `CLAUDE_CODE_SUBAGENT_MODEL` NOT set (MP-04); usage/spend limit noted once (MP-16)
- [ ] 3b Role prohibitions (Elephant) loaded — EL-01/02/03/04/16/18/19 (`harness/session-bootstrap.md` Step 1d) + third confirmation line
- [ ] 4 Staleness check vs. marketplace remote (URL from committed `.claude/settings.json`)
- [ ] 5 Calibration `.claude/pipeline.json` exists + read; project denies present in `.claude/settings.json`/guard config
- [ ] 6 Handover/state file read completely (single source of truth); warn on handover drift
- [ ] 7 verify script exists + callable (`{{VERIFY_COMMAND}}` from calibration) — existence check, no full run
- [ ] 8 Confirmation line in the exact format + model/effort extra line (session-bootstrap §6.1)
- [ ] 9 PO orientation block posted at phase start / re-entry ≥ 3 days: compact phase table done / current / upcoming (roles/elephant.md EL-17d)

## Goldfish (compact)

- [ ] Guardrails active; ruleset SHA taken from the briefing (missing SHA = briefing defect → stop, do not research)
- [ ] Calibration only as referenced in the briefing
- [ ] NEVER read handover/state or history artifacts — the briefing replaces them
- [ ] verify callable (needed for the evidence artifact)
- [ ] Compact confirmation line (session-bootstrap §6.2)

## Critic (compact)

- [ ] Input = spec + diff + guardrails + evidence artifact ONLY — no handover, no chat history, no implementor reasoning
- [ ] Read-only confirmed: write tools absent (writable = bootstrap failed → abort)
- [ ] Compact confirmation line, state field "n/a" (session-bootstrap §6.3)

## Failure cases (details: session-bootstrap §4)

- F1 plugin missing → STOP; minimal-safe mode only (read-only)
- F2 stale → refresh; mandatory BEFORE work if the delta touches guardrails/hooks/permissions
- F3 offline → continue on cache, offline note in confirmation, re-check at next connectivity
- F4 calibration/handover missing → STOP for writing work; offer creation from central template
