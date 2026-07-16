# Checklist — Critic Review

> Agent-Pipeline v0.1.0-draft · Phase 3 · Compact operative reference; why + verification live in the normative spec `harness/review-protocol.md` (+ OM §4, ADR-0003/0014). Executable form: critic skill (`critic-review`) in `plugins/pipeline-core` (authored in parallel).

## Before dispatch (Elephant)

- [ ] Stage 1 green: verify passed + evidence artifact exists (no Critic on red builds)
- [ ] Trigger row determined (`harness/review-protocol.md` §2.1) and recorded for the gate decision
- [ ] Ownership annotation recorded for each mandatory check: deterministic verify / semantic Critic / trajectory Critic / human risk; any exact assertion-fingerprint overlap is reported, never used to remove a check
- [ ] Model per row: the review-tier model standard · escalate to a higher-capability model for risk class high or any architecture/guardrail/security diff (MP-07)
- [ ] Isolation: A/G/S diff → `--bare` + JSON-schema verdict MANDATORY; otherwise read-only subagent
- [ ] Dispatch contains ONLY paths/refs + metadata: spec path, diff ref, guardrail paths, evidence path, rigor/risk, trigger row, regelwerk SHA — no justifications, no chat history, no prior verdicts
- [ ] Uncommitted review target (B6): exact reviewed diff archived as an evidence artifact BEFORE dispatch (`git diff` snapshot, path named in the dispatch) — reviews stay reproducible and A/B-testable

## Run (Critic)

- [ ] Construct your input YOURSELF: run `git diff`, read spec + guardrails + evidence — nothing else
- [ ] Read-only bootstrap confirmed (write tools absent; else abort)
- [ ] Search harshly, report honestly — findings only with evidence
- [ ] Per finding: Gap · Risk (blocker/major/minor) · Evidence `file:line` · Spec/guardrail ref
- [ ] Trajectory section: were claimed checks actually executed per evidence (command + commit state + exit code)?
- [ ] Authorship (standard check, EL-01/EL-16): production diffs originate from dispatched fresh-context sessions (commit/session trailers, dispatch records) or from the orchestrator itself? Orchestrator-authored diffs outside OM §3.3 stage-0 = lifecycle-violation finding, severity ≥ major
- [ ] Documented-instead-of-fixed risks hunted: known gaps with TODO/comment but no owner + expiry date are findings, not mitigations (AP7/QG-06)
- [ ] Dependency reality check: every NEW import/package/action/image exists in the official registry under exactly that name, registry evidence (URL + pinned version) present (SEC-04 slopsquatting)
- [ ] Pipeline-deliverable reviews: language assignment of new artifacts per ADR-0011 checked (agent-facing English / human-facing German / primary-reader rule)
- [ ] Full translations of normative docs: rule/line-level parity checked per section (table rows, list items, Must/Must-not clauses counted both sides), not just heading parity
- [ ] After a "pure-prepend" bulk edit: `git diff --numstat` run, any file with deletions>0 flagged (not assumed to be a pure prepend)
- [ ] "Deliberately not flagged" rubric filled — "checked, ok" distinguishable from "not looked at"
- [ ] Skip rule: nothing CI/verify enforces; no style critique without spec/guardrail ref; no score
- [ ] "No findings" is a valid, welcome result — never invent findings to justify the run

## Verdict processing (Elephant)

- [ ] Findings failing the evidence bar or skip rule rejected with a short note
- [ ] EVERY blocker/major dispositioned: fix (fresh rework dispatch) / reject with justification / escalate to the PO
- [ ] Before re-dispatch: harness checklist first — briefing? context? tools/permissions? hooks? (G2/P1)
- [ ] Rework = new dispatch, fresh context, refined briefing; max 2 cycles, then the PO (mandatory)
- [ ] Re-review after rework by a NEW fresh Critic where triggers still apply — never reuse a Critic context
- [ ] Gate decision recorded: trigger row, dispositions, cycle count; telemetry line for the Critic run
- [ ] Shadow metrics, when available, bind this gate/cycle to exact candidate and tool/runner/schema versions; unavailable values are `unknown`, never zero, and do not change the verdict
