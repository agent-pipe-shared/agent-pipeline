# Critic record — Goldfish template: effective tool cap (DOCCAP) and dispatch-record path (RECPATH-m)

- Review object (enumerated): `b89e26e0f` (DOCCAP), `9fcda03f6` (RECPATH-m); both touch `templates/prompts/goldfish-task.md`
  and the vendored copy
- Spec: `specs/sprint-alfred-epic/evidence/night-2026-10-05/budget-cap-source.md`,
  `specs/sprint-alfred-epic/evidence/night-2026-10-05/dispatch-record-path.md`; `guardrails/token-budget.md`,
  `guardrails/global.md`, `guardrails/quality-gates.md`
- Route: requested `claude-sonnet-5-5`; effective `claude-sonnet-5-5` (observed in the dispatch's own runtime prompt);
  standard class
- Lane: functional-equivalent-read-only; OS isolation not asserted
- Budget: notices at counted calls 20, 22, 23 of 24; investigation stopped at 22
- **Verdict: PASS** — two minor findings

## Findings (both minor)

### F1 — the effective cap is not carried into the stop condition and the closing-allowance bullets

`goldfish-task.md:436` and `:440` now state `min(stated base cap, maxTurns - 15)`, but the stop condition (`:417`), the
closing allowance (`:441`) and the never-end-voluntarily bullet (`:447`) still key on "the base cap", which `:440`
defines as the stated number. With a stated cap above `maxTurns - 15`, an agent following `:447` literally keeps working
after the hook restricts it to closing acts, and refused calls consume the closing allowance
(`plugins/pipeline-core/lib/dispatch-budget-core.mjs:73-98`). Spec-ref: `budget-cap-source.md` (d), (e); TB-08.

### F2 — "never raises a stated cap" contradicts the grant path

`:440` says the hook never raises a stated cap and that 15 are reserved; `effectiveDispatchWorkingCap`
(`dispatch-budget-core.mjs:113-124`) lets an orchestrator-written grant raise the working cap up to `maxTurns - 6`, and
`:436` itself says the dispatcher may grant more budget. Spec-ref: `budget-cap-source.md` (a); QG-09; GL-02.

## Deliberately not flagged (summary)

Contract 1's three gaps closed (clamp, 15 reserve, checkpoint on the effective cap); numbers re-derived from code
(`maxTurns` 50/50/80; 35 + 15 = 50; deep cap ≤ 65; threshold 28 of 35) and confirmed live by the Critic's own hook
notices. Contract 2: `:455` names the repository-root `evidence/` and matches the writer's exact-target check
(`dispatch-record-write.mjs:213-215`). Vendored copy byte-identical by blob id. The budget binder still parses the filled
line. Role-default constant 40 in `dispatch-policy.mjs:55-57` predates these commits and reaches no live Goldfish path.
No cross-runner enforcement claim added. Trailers clean; English; no tests touched.

## Trajectory

Consistent for every claim checked against code. Not verifiable: the claimed `check-vendored-template-sync` run (no
artifact supplied; byte equality verified from blob ids) and the dispatch-record binding (commit 1's body credits the
vendored sync to DOCCAP-m under a DOCCAP trailer).

## Briefing violations

Mild, self-reported: the criticality row characterised the diff and the matrix row named a check. The Critic treated
both as metadata; the Elephant notes it for the next briefing (no characterisation in the criticality row).
