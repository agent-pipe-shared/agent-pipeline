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

## Continuation (RECON-3C)

**PARTIAL RESULT.** Tool budget checkpoint fired. Not reached: AC-12 (no grep run). AC-14 checked by file listing only.
Clause wording from `acceptance.md`; `P` = `plugins/pipeline-core`.

### AC-8 (never silently replaced) - closes the part-A check
- Custom profile "measured, never silently replaced": gap, Fixture 2 (`P/scripts/architecture-fitness.test.mjs:582-590`) asserts only `profileSource`.
- Searched `custom|silently|replaced` in the fitness and adoption suites: no other test asserts a kept profile.

### AC-11 (eight B2 routes; refusal names its route; B2-i satisfies four constraints)
- B2-i refusal names its route: covered, `P/hooks/guard-testpath` cases TP15/TP16 per `evidence/b2-guard-override-trust.md:78-79` (suite file not opened).
- B2-i lifecycle/eligibility, chat-vs-signature, retained identity/expiry, physical target: covered, `P/lib/human-guard-override.test.mjs:845,937,952,967,979,1011,1031,1053`.
- B2-iv per-key trust-on-first-use: covered, `P/lib/human-guard-override.test.mjs:775,791,828`.
- B2-ii append-only registration: covered, `P/lib/verify-suite-append-policy.test.mjs:13,20,28`.
- B2-iii read-only typed retry: gap, no per-route fixture located within budget.
- B2-v..viii: gap, routes not enumerated in any test found.
- "Eight routes exist" as one assertion: gap, no test enumerates all eight routes.

### AC-12 (rules-as-code sweep)
- Not reached.

### AC-14 (every wave passed at least one Critic round; design documents too)
- Critic rounds exist: `specs/sprint-alfred-epic/evidence/critic/` (rounds 1-4, rework 1-2), `evidence/critic-2026-10-05/`, `evidence/critic-2026-10-07/`.
- Every wave mapped to a round, paths-only dispatch, fail-then-fix documented: gap, per-wave mapping not checked.

### AC-16 (host-layout onboarding tests assert the success contract)
- Post-rebase re-derivation note: covered, `specs/sprint-alfred-epic/evidence/wave0-post-rebase-rederivation.md:14-33` (eight onboarding test paths named).
- Success-contract assertion: not applicable yet, the note states A1 plans no onboarding-test edit (`:32-33`); the lens binds later edits.
- Reconciliation row "wave-0 note not located" is stale: the note exists at the path above.

### AC-23 (AGENTS.md linkage)
- Walkthrough evidence file: gap, no walkthrough or re-entry file in `specs/sprint-alfred-epic/evidence/` or `plans/` (listing read).
- Estate fixture half stays covered (part A, `P/scripts/module-inventory.test.mjs:57,282,306,347,362`).

### Updated closing lists
- ACs now class (a), additions: AC-16 (vacuously satisfied until an onboarding test is touched; the note is the evidence).
- Still not class (a): AC-8, AC-11, AC-14, AC-23 (gaps above); AC-12 unreached.
- New gaps (10-14):
  10. AC-8: assert a custom profile is measured and not replaced (beyond `profileSource`).
  11. AC-11: per-route fixtures for B2-iii and B2-v..viii; one eight-route enumeration test.
  12. AC-12: whole sweep still to confirm.
  13. AC-14: per-wave Critic-round map.
  14. AC-23: re-entry walkthrough evidence file.
