# Checklist — Goldfish Dispatch

> Agent-Pipeline v0.1.0-draft · Phase 3 · Compact operative reference for the Elephant; why + verification live in `docs/operating-model.md` §2.3/§3.3/§5.3, `policies/model-policy.md`, `harness/definition-of-done.md`. Briefing template: `templates/` (authored in parallel).

## Ready to dispatch?

- [ ] 80%-gate: task self-contained and specifiable — if not, do interview/decomposition, not a better prompt
- [ ] Rigor level + risk class set at triage and recorded (in doubt: higher; risk flag when risk zones are touched)
- [ ] Spec-readiness check passed where mandatory (canon/guardrail/core-contract packages: risk class high OR architecture/guardrail/security surface OR rigor 2; otherwise optional at Elephant judgment, recommended for multi-file waves)
- [ ] Readiness §-references verified, not just resolved: a §-reference that cites a *specific rule/claim* is checked against the target section's actual content — not merely that the section exists
- [ ] Package-size budget (EL-25a): expected >~50 tool uses OR >~8–9 files OR >1 complex topic → split BEFORE dispatch, never discovered mid-run
- [ ] Parallel limit 3–5 (up to 5 when file ownership is strictly disjoint, EL-22) goldfish respected; worktree isolation when overlap is unavoidable; never parallelize dependent/same-file work; WIP rule: max 1 open human-gate item per project (condition A11); worktree isolation MANDATORY from 3+ parallel goldfish committing to the same tree — disjoint file ownership does not protect the shared git index (EL-22)
- [ ] Writing task → worktree per project calibration; workflow runs → MP-10 preconditions (hooks + allowlist + worktree)
- [ ] Read-only intent → read-only agent type (toolset without Write/Edit); prose prohibitions do not enforce (tooling-policy W2)
- [ ] Background run without intermediate output → automatic watchdog wired IN THE SAME MOVE (monitor/timeout/auto-kill); promised checks are mechanized or withdrawn — the PO is never the watchdog (tooling-policy G3)
- [ ] New transport path (headless/background/stdin/cwd/auth) → ~30-second smoke test through the FULL path BEFORE the expensive run (tooling-policy G4)

## Briefing — 6 mandatory fields (OM §2.3)

- [ ] 1 Goal: outcome + observable end-state criterion — no step-by-step dictation
- [ ] 2 Context files: explicit list, spec/delta-spec first — never chat history
- [ ] 3 DoD checks: EARS acceptance criteria (rigor ≥ 1) + `{{VERIFY_COMMAND}}` — fixed BEFORE the run; test fixtures mirror the real harness contract — hook-input fixtures include ABSOLUTE paths alongside relative (fixture-blindness)
- [ ] 4 Prohibitions: scope limits, no-go paths, "do not change tests of your own implementation", project denies; sanitization DoD (if applicable) as a concrete grep-pattern list — repo-root/scratchpad/user-dir/secret-format patterns, never principle-prose
- [ ] 5 Stop conditions: > 2 failed attempts, spec contradiction, scope burst, missing access, ambiguity
- [ ] 6 Dispatch metadata: regelwerk SHA (always); model named EXPLICITLY in every dispatch — default the implement-tier model, a higher-capability tier only with a model justification (MP-05/MP-07), never a bottom-tier model below the mechanic tier (MP-03); packages expected >~25 tool uses carry the report-early duty — running report skeleton in `dispatch-record.json`, final report = condensate
- [ ] Briefing language confirmed English (ADR-0011) — checklist point, not assumed default
- [ ] Normative value lists (enums, schema fields, gate modes) spelled out VERBATIM in the briefing — never paraphrased

## After delivery (Elephant)

- [ ] Completion report complete (OM §2.3): per-check results three-valued (pass / fail / not verifiable) · evidence artifact · changed files + one-line reasons · "Deliberately NOT changed" · spec deviations · open items / remaining handwork
- [ ] Evidence artifact is script-written and names command + commit state + exit code — model prose does not count
- [ ] Stop conditions respected; deviations reported, none silently built in
- [ ] DoD status assigned: done / 🟡 not-human-verified / blocked (`harness/definition-of-done.md` §3)
- [ ] Telemetry: first-pass (y/n) + interventions (y/n) per goldfish; look-away time noted (MP-20)
- [ ] Commit discipline followed: staging+commit as ONE bundled `git add -- <paths> && git commit -- <same paths>` act — never `git add -A`/`git add .`; trailer lines (`Dispatch:` etc.) sit directly in the trailer block, no blank line between trailers (avoids the shared-index race and keeps trailers parseable)
