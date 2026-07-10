# Token-Budget Guardrails

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 3 · 2026-07-03
> Audience: primarily the Elephant (dispatch and session decisions); Goldfish/Critic inherit their part via briefing/frontmatter.

**Distillation notice:** This file distills `policies/model-policy.md` (rules MP-01…MP-27) into dispatch-time guardrails. On any disagreement, the model-policy wins — fix this file, do not reinterpret the policy. Precedence and enforcement otherwise as in `guardrails/global.md` (header).

Rule IDs: `TB-xx`.

---

## TB-01 — Model discipline at every dispatch (MP-01/02/03/05/07/27)

- Every subagent dispatch **MUST** name model and effort explicitly in the briefing's dispatch-metadata field — never rely on silent inheritance of the session model.
- Role defaults: Elephant = the design-tier model (design phase at effort `xhigh`, execution phase at effort `max`) under one of two profiles (`advisor`: the top design tier from session start with the advisor model enabled; `design-first`: a lower-cost design-capable model during design, then one sanctioned switch up to the top design tier at the PRD gate, MP-01) — running the lower-cost design model for the whole session (skipping the switch-up) stays possible only as a named PO exception; Goldfish = the mechanic-tier model as a hard minimum (MP-02/03), effort per the MP-27 3-tier subagent matrix (`goldfish-mechanic` = `low`, `goldfish-implementor` = `medium`, `goldfish-deep` = `xhigh`); Critic = the review-tier model at `max`, escalated to a higher-capability model for architecture/guardrail/security reviews (canonical trigger wording: `docs/operating-model.md` §4.2). Concrete models per tier come from the shipped default preset (design → opus, implement/mechanic → sonnet, review → sonnet) in `pipeline.user.yaml` and are overridable there.
- A dispatch ABOVE the role default (e.g. a Goldfish running above the implement tier) **MUST** carry the "model justification" entry in the dispatch metadata (MP-05 criteria); Critic briefings carry "criticality → model" (MP-07).
- **MUST NOT** run any pipeline role below the implement-tier minimum capability — the cheapest "fast/cheap" model class is too weak for pipeline work (MP-03, hard).
- **MUST NOT** set `CLAUDE_CODE_SUBAGENT_MODEL` — it silently overrides ALL subagent frontmatter and voids the matrix (MP-04).
- **Why:** Subagents inherit the session model without an override — a Goldfish silently ran on the more expensive design-tier model for exactly this reason. Silent inheritance breaks both the cost model and the audit trail.
- **Verification:** Briefing format check (dispatch metadata is mandatory field 6, `docs/operating-model.md` §2.3); telemetry row shows model/effort per dispatch (TB-06); bootstrap step 1b confirms the env var is unset (`harness/session-bootstrap.md`).

## TB-02 — Effort and cache rules (MP-01/06/17/18/27)

- Elephant: **MUST** set model/effort per the chosen profile at session start and verify (bootstrap step 1b): profile `advisor` → the top design-tier model at effort `max` with the advisor model enabled, from session start; profile `design-first` → a lower-cost design-capable model at effort `xhigh`, then ONE sanctioned switch to the top design-tier model at effort `max` at the PRD gate. Effort is session-only and resets every start.
- Goldfish: effort follows the MP-27 3-tier subagent matrix, not a single dispatch-time dial — `goldfish-mechanic` runs at effort `low` (mechanical, uniform, fully-specified plan execution, no in-task design decisions), `goldfish-implementor` at effort `medium` (the standard for clearly-briefed implementation), `goldfish-deep` at effort `xhigh` (test-suite/verify authorship, guardrail/hook/canon code, genuine in-task design latitude, class-high risk work). Tier choice IS the escalation/de-escalation lever (MP-06) — pick the subagent matching the task's actual design latitude; never default every dispatch to the top tier "to be safe", and never stretch a low-tier dispatch onto guardrail/test-authorship work. **MUST NOT** compare effort levels across models (the scale is per-model).
- **MUST NOT** switch model or effort mid-session — both invalidate the entire prompt cache — **except the ONE sanctioned exception:** the single-direction switch up from the lower-cost design model to the top design-tier model at the PRD-gate in profile `design-first` (evidence = ledger entry + identity verification, EL-24/MP-17/MP-18). The reverse switch back down mid-session remains forbidden without exception. Need a different model or heavy token throughput otherwise? Cut a subagent (Goldfish/Critic) instead (MP-18); automatic mid-session model switching is not used in the pipeline.
- `/compact` only at task boundaries with a focus argument; `/clear` + `/rename` on topic switch; prefer `/rewind` over `/compact` when discarding a dead-end path (MP-19). **Checkpoint window:** at every handover moment (package/wave boundary, PRD gate, before the first dispatch of a new package) with context ≥ ~100k tokens, `/compact` is a MANDATORY checkpoint — target window 100–150k, >150k counts as an overdue cut. Precondition: handover file/ledger current (persisted state = compact-safe, `docs/operating-model.md` §5.1) — never compact with unpersisted state.
- **Why:** Cache economy is the second-largest cost lever after model choice: the Elephant context re-reads at 0.1× as cache; every mid-session switch pays full reprocessing of up to 1M tokens.
- **Verification:** Bootstrap confirmation line names model/effort (+ profile/advisor state, `harness/session-bootstrap.md` step 1b); cache health is measurable (high read-to-write ratio via `/usage`); mid-session model switches appear in telemetry as anomalies UNLESS they are the documented PRD-gate switch event (ledger entry present, MP-18).

## TB-03 — Ultracode/workflow preconditions (MP-08/10/11)

- Ultracode/Dynamic Workflows are a PER-TASK opt-in for the indication list only: initial research, approach/architecture exploration, audits, migrations. **MUST NOT** run ultracode as a session-permanent state; most coding tasks are the documented worst fit.
- A workflow that WRITES files **MUST NOT** start unless all three preconditions hold (hard, blocking):
  1. git-guard union installed as PreToolUse hook (the only layer that holds in `acceptEdits`),
  2. tight Bash allowlist for the session (only task-required commands),
  3. isolated worktree — never the main checkout.
- <PROJECT_B> additionally requires explicit PO approval for writing workflows until the guard migration completes (see the live-deploy-lock example policy, `governance/examples/policies/live-deploy-lock.md`).
- Parallel fan-out default: 3–5 agents; more only with explicit justification AND a prior calibration run (MP-11).
- **Why:** Workflow subagents always run in `acceptEdits` and inherit the session's tool allowlist — permission modes (`plan`/`ask`) do NOT apply there; hooks, allowlist, and isolation are the only effective protection (ADR-0007).
- **Verification:** The workflow start prompt names the three preconditions explicitly; the bootstrap check verifies hook installation; read-only workflows are exempt. OPEN (Phase 4): deterministic precondition check in the workflow start building block (ADR-0007 risk note). OPEN (Phase 4, from MP-10): whether the existing divergent project guards suffice transitionally until the union ships — until decided: ask the PO.

## TB-04 — Calibration run before novel large runs (MP-09/14, recommended)

- **SHOULD** run a small-slice calibration before any NOVEL large run (workflow or long autonomous single run): one directory instead of the repo, one narrow question instead of a broad one; watch spend via `/workflows`.
- Not a mandatory hurdle — but for novel workflows expected to exceed ~30 min, the telemetry row **MUST** record whether a calibration ran ("peculiarities" column).
- **Why:** Large-run consumption is barely estimable up front ("a single run can use meaningfully more tokens than the same task in conversation"); the small slice buys the projection before the budget is gone.
- **Verification:** Telemetry row of the large run references its calibration run.

## TB-05 — Budget escalation (MP-16/20)

- Budget overrun is defined: the `/usage-credits` monthly limit is reached, OR a calibration-run projection clearly exceeds expectation. Then: **MUST** stop and escalate to the PO (escalation ladder level 4, `docs/operating-model.md` §4.3) — do not "finish quickly first".
- Autonomous `/goal` runs **MUST** contain an explicit stop clause (e.g. "... or stop after {{N}} turns") (MP-15).
- **MUST NOT** base budget control on undocumented mechanisms (prompt directives like "+500k", unverified flags) — only documented instruments count: `/usage`, `/usage-credits`, workspace spend limits, `/workflows` live view.
- **Why:** Without a defined threshold and stop, a misdirected run has no structural upper bound; undocumented knobs are hope, not control.
- **Verification:** Escalation is documented in the session/telemetry ("peculiarities"); briefings for autonomous runs contain the stop clause (stop conditions are mandatory briefing field 5).

## TB-06 — Telemetry duty (MP-20)

- Every session/block close **MUST** append one row to the project's `telemetry/costs.md` — canonical column set and conventions are defined in `policies/model-policy.md` MP-20 (date, session/block, role, model/effort, task, tokens per `/usage`, first-pass y/n, interventions y/n, peculiarities). Do not fork the format here.
- Goldfish rows **MUST** fill the maturity-metric columns (first-pass, interventions); `--bare`/headless runs add `total_cost_usd` from `--output-format json`.
- The `close-block` skill (shipped, `plugins/pipeline-core`) writes the row as ritual step 8; wherever the skill is not installed/run, the row is a MANUAL mandatory step — in this repo from now on (`telemetry/costs.md`), in project repos from their migration (Phase 4).
- The first Elephant session of a month runs the monthly sighting (3–5 findings lines, first-pass quota, cache health) per MP-20.
- **Why:** "Cost telemetry from day 1" stayed a soft TODO without an instrument; the periodic price review needs task-level data, not $/MTok guesses (tokenizer trap, MP-13).
- **Verification:** File exists and grows (`git log telemetry/costs.md`); the `/close` drift check flags missing rows; monthly sighting section exists per month.

## TB-07 — Session lifecycle thresholds: planned cut, never emergency compaction (MP-19)

- **MUST** check `/context` at task boundaries. At ~70–80 % fill OR at a natural phase/block boundary: planned session cut — update handover file → commit → end session → fresh session bootstraps from the file (`harness/session-bootstrap.md`). Second indicator: > 80 messages → consider a cut.
- **MUST (checkpoint window):** the planned cut is a GENUINE checkpoint, not an emergency valve — at every handover moment (package/wave boundary, PRD gate, before the first dispatch of a new package) with context ~100–150k, present the compact block (verbatim `/compact` + one-line focus hint); >150k is an overdue cut, named honestly. This is a planned cut, never an emergency compaction.
- **MUST NOT** plan for auto-compaction: it is a lossy, uncontrolled safety net. A session that runs into auto-compaction is a process failure → retro question "why was the cut missed?".
- The planned cut is loss-free ONLY if `guardrails/global.md` GL-07 was lived (everything persisted); re-bootstrapping is then a 30-second operation.
- **Why:** What auto-compaction discards is not the PO's decision; the planned cut at a boundary keeps the artifact complete and the cache economics sane (`docs/operating-model.md` §5.2).
- **Verification:** `/context` check is a step in the close/block-change ritual; a session-end commit with the updated handover file exists; auto-compaction incidents are flagged in the retro and telemetry.
- **Elephant self-check:** do NOT rely solely on the Stop-hook context-warning or the PO to raise a checkpoint. At every package/phase boundary the Elephant READS `.claude/.usage-<session_id>.json` (`usedPct`/`totalTokens`/`contextWindowSize`/`updatedAt`) and self-assesses using the same tiers the Stop hook applies (>=50% warn, >=75% overdue, >=85% emergency), proactively proposing `/compact`. **Heed `updatedAt` freshness:** the snapshot only refreshes when the statusLine renders, so on long/remote/autonomous stretches it can be STALE — when `updatedAt` is old relative to work done since, treat real usage as HIGHER than the snapshot and checkpoint conservatively rather than trusting a stale low percentage. The percentage is window-relative (a 1M-token window's 50% is ~500k tokens, not 150k — the 150k figure is a 200k-window number).
- **Two-stage threshold, made explicit:** **~120k context = WARN** — start planning a checkpoint now (what does the handover file need, is a natural boundary close). **BEFORE 150k = MANDATORY cut** — write the checkpoint, then `/compact` or restart; do NOT wait until 200k "because there's still room" — that reasoning is exactly what produced an expensive session observed here (71% of its usage ran at >150k context). **After every dispatch WAVE** (not only at package/phase boundaries), the Elephant actively checks whether a cut is due, instead of discovering it only once already deep inside a large context. The statusline token-field bug behind the live signal is already fixed (`statusline-context.mjs`) — these thresholds now have a working live signal to fire against, not a silently-zeroed gauge.
- **ABSOLUTE soft-nudge ladder in the Stop hook (Elephant decision, 2026-07-10, `stop-suggest.mjs`'s `absoluteContextTier`/`effectiveContextTier`):** the hard emergency brake (`decision:"block"`) stays PERCENT-based (EL-04, 2026-07-08, preserved verbatim — never a spurious hard brake on a large, lightly-used window). Layered ON TOP, orthogonally, the hook now ALSO tiers the SOFT proactive nudge (`warn`/`overdue`) on the REAL, window-independent token count: **≥ 180k → warn** ("look for the next good cut"), **≥ 200k → overdue** ("clearly time to checkpoint"), **≥ 250k → overdue** (same tier, strongest-soft framing). The two ladders combine via "more severe wins" (`none < warn < overdue < block`) — because the absolute ladder structurally never returns `block`, this can only ever ADD a soft nudge, never trigger or strengthen the hard brake; EL-04 stays intact automatically, with no special-casing. **Re-arm:** once a soft nudge fires, it re-emits again every time real usage grows by **≥ 50k tokens** since that nudge, even if the phase+tier fingerprint is otherwise unchanged (`lastEmittedTotalTokens` in the session marker) — a session sitting at "overdue" for hundreds of thousands more tokens because nothing else changed must not go silent. **Every emitted nudge carries a copyable `/compact <summary prompt>` line**, appended once inside `buildContextMessage()` so every reuse/downgrade path gets it automatically — the goal is one copy-paste away from the checkpoint, not just a warning that names the problem.

## TB-08 — Workflow-agent tool-call budget; script-first for bulk edits

- When dispatching **Workflow** subagents, size each agent's task to complete within **<= 45 tool calls**. There is an observed hard cap of ~50 tool calls per workflow agent: on reaching it the agent is truncated mid-task, returns **NO StructuredOutput** (its result is `null`), and that agent's work is lost -- forcing a re-dispatch that spends the tokens twice.
- For bulk edits across many files, use **script-first**: one `node`/replacement script in a single Bash call instead of N per-file `Edit` calls. Per-line editing exhausts the budget after ~15-20 files; a script processes hundreds in one call.
- The cap is per **workflow** agent. **Direct** Agent-tool dispatches (outside a Workflow) do NOT share it (observed 59 tool calls in one dispatch) -- pressure is lower there, but script-first stays the token-efficient default for mass edits.
- **Why:** In an observed run, five parallel workflow agents each hit exactly 50 tool calls doing per-line edits, were truncated without structured output, and had to be re-dispatched; the re-run as script-first direct agents finished in one pass. Budgeting <=45 + script-first avoids the double spend.
- **Verification:** Bulk-edit workflow briefings specify a script-first method; a workflow agent returning `null` with `toolCalls~=50` in the progress log is the failure signature to flag in retro.

## TB-09 — Tool-call budget is a MANDATORY field in every dispatch, not only Workflow agents

- The <= 45 tool-call budget (TB-08) is **NOT limited to Workflow agents.** It is a **MANDATORY field in every Goldfish briefing** (and every other subagent dispatch) — stated as an explicit number in the briefing's dispatch-metadata field (canonical field 6, `docs/operating-model.md` §2.3), not left implicit.
- **MUST** pair the number with a STOP rule: on reaching the stated budget, the agent stops cleanly and reports what is done and what remains — it does **NOT** keep digging past the number to "just finish this one thing." A justified stop on budget is a first-class result, not a failure to route around.
- **Honest limit, stated plainly:** there is (still) no hard per-subagent technical tool-call counter outside the observed ~50-call Workflow-agent truncation behavior described in TB-08. TB-09 is a briefing/behaviour rule, carried by the agent's own discipline and by the Elephant reading the completion report (`toolUsesApprox`) — **it is NOT a hook and NOT technically enforced.** No dispatch, briefing, doc, or report may claim or imply otherwise; a claimed-but-unimplemented technical block is exactly the credibility failure this rule exists to close.
- **Why:** TB-08 was scoped to Workflow agents because that is where the ~50-call truncation was observed and measured; the same discipline — bounded task, report-early, no unbounded digging — is equally valuable for every other dispatch, where no equivalent technical truncation exists to catch an overrun for you.
- **Verification:** Goldfish/subagent briefings carry the tool-budget number as a stated field; completion reports state `toolUsesApprox`; a report that blows far past its stated budget without a clean stop-and-report is the TB-09 failure signature to flag in retro — self-reported here, unlike TB-08's `null`-result truncation signature.
