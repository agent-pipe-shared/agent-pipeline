# Spec AC confirmation, part A (RECON-3A, 2026-10-07)

Scope: confirm or refute the (b) rows AC-2..AC-23 of `spec-ac-reconciliation-2026-10-07.md`. Evidence is by `git grep` and
reading only; no test was executed. Note: `traceability.md` carries no AC-2..AC-23 rows by id (only AC-26+); clause wording
comes from `acceptance.md`.

**PARTIAL RESULT.** The tool budget checkpoint fired. Not reached: AC-11, AC-12, AC-14, AC-16. AC-17 and AC-4 are
partly checked (see rows).

Paths: `P` = `plugins/pipeline-core`.

## AC-2 (protected-baseline, approved bytes, closed evidence; residual gaps typed)
- Protected-baseline surface: covered, `P/lib/protected-baseline.test.mjs:34-114` (nine "A3 ..." cases).
- Approved PRD/Spec frozen in implementation: covered for the Edit route, `P/lib/plan-authority-staging-guard.test.mjs:432`.
- Approved-bytes other routes (shell, script, notebook): gap, no per-route fixture found.
- Closed-evidence bytes: gap, A5 tests detect or repair drift only; no agent-write refusal fixture.
- Residual gaps typed rows: covered, `P/scripts/control-placement.test.mjs:84` ("AC-2: known protected-surface ... A2 debt").

## AC-4 (submit/approve-plan refuse pre-authority staging paths)
- submit-plan refusal: covered, `P/lib/plan-authority-staging-guard.test.mjs:276`.
- approve-plan refusal: covered, same file `:310`.
- Typed reason asserted: gap, assertion on the reason code not read (unchecked).

## AC-5 (closed-evidence drift)
- Diagnostic on active, fail-closed on inactive, 2026-08-27 replay: covered, `P/scripts/check-evidence-drift.test.mjs:65`.
- Repair verbs with audit trail: covered, same file `:166` (restore) and `:295` (repin, `evidenceRepins[]`).
- PO-gated verbs: gap, PO gating not asserted in these cases (unchecked).

## AC-7 (rigor floor): fully covered
- Same inputs same floor: `P/scripts/rigor-floor.test.mjs:66`. Unknown never lowers: `:104`, `:282`.
- Actual-surface growth escalates: `:212`, `:227`. Disagreement log: `:263`; artifact `evidence/b1-minimum-rigor-floor.md`.

## AC-8 (greenfield disposition)
- Resolves to `inherited-agent-first`: covered, `P/scripts/architecture-fitness.test.mjs:577`.
- Custom profile honored: covered, same file `:582`.
- Disposition before implementation authority: covered, `P/scripts/architecture-adoption.test.mjs:240,247,260`.
- "Measured, never silently replaced": gap, test asserts `profileSource` only.

## AC-10 (model-judged never pass): fully covered
- `P/scripts/architecture-fitness.test.mjs:361` (prompt-only claimed compliance), `:375` (model-judged), `:709` (Fixture 16).

## AC-17 (disposition before authority)
- Unresolved fails, deferred satisfies, expired fails: covered, `P/scripts/architecture-adoption.test.mjs:240,274,288`.
- Planning-boundary wiring into authority: gap, no caller of the adoption check found in `pipeline-state.mjs` or hooks.

## AC-18 (map currency): fully covered
- Fresh/stale fixtures: `P/scripts/architecture-fitness.test.mjs:270,390,667`. Push-boundary debt: `:401,:721`.
- Next planning boundary consumes debt: `:727`.

## AC-19 (decision parity)
- Same inputs agree, divergence typed: covered, `P/lib/architecture-effective-decisions.test.mjs:49,59,68`.
- Two different runners replay: gap, cases are labelled "source precondition", not a claude-vs-codex replay.

## AC-20 (token ADR)
- Fixture exists and is valid: covered, `P/scripts/architecture-baseline.test.mjs:367` (`fixtures/ac20-token-adr`).
- Critic review actually catches it: gap, no Critic round evidence over that fixture.

## AC-21 (anti-fragmentation): fully covered
- `P/scripts/architecture-fitness.test.mjs:448` ("misleading tiny-module optimization"), `:461` (overall blocked).

## AC-23 (AGENTS.md linkage)
- Re-entry reading order resolves: covered, `P/scripts/module-inventory.test.mjs:57,282`.
- Governed repo AGENTS.md pointer and typed stale/missing: covered, same file `:306,347,362`.
- Walkthrough evidence file: gap, none found under the sprint evidence dir.

## Not reached
AC-11 (eight B2 routes), AC-12 (rules-as-code sweep), AC-14 (Critic rounds), AC-16 (host-layout onboarding tests).

## ACs now fully covered (class a)
AC-7, AC-10, AC-18, AC-21. Likely a after one small check: AC-8, AC-23.

## Concrete gaps (candidate test slices)
1. AC-2: shell/script-route refusal fixtures for approved PRD/Spec bytes.
2. AC-2: agent-write refusal fixture for closed-evidence bytes.
3. AC-4: assert the typed reason code in the submit/approve-plan refusals.
4. AC-5: assert PO gating on restore and repin.
5. AC-8: assert the measured/not-replaced property of an accepted custom profile.
6. AC-17: test the planning-boundary caller that blocks authority on unresolved disposition.
7. AC-19: claude-vs-codex two-runner parity replay.
8. AC-20: Critic round evidence over the token-ADR fixture.
9. AC-23: re-entry walkthrough evidence file.
