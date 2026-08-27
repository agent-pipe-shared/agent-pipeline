# Sprint Alfred Epic — Acceptance criteria

Binding acceptance map: PRD §7 requirement → concrete evidence that
satisfies it. Every row names the artifact/suite that proves it; "evidence"
always means candidate-bound per Nova-spec §2.2 conventions. Member-issue
acceptance lists (#99, #101–#106, #109) apply in full at each issue's
closure; this file adds the epic-level and incident-derived criteria and the
fixture inventory floor.

## A. Epic-level criteria

| # | Criterion | Evidence |
|---|---|---|
| A1 | Enforcement-conformance records exist for every supported runner used in the sprint, are green in Verify, and every shipped control's placement row is consistent with them | `pipeline.enforcement-conformance.v1` records; `control-placement` Verify check |
| A2 | No agent route mutates: a protected-baseline surface, approved PRD/Spec bytes during implementation, or closed-evidence bytes — per supported mutation route fixtures; residual gaps are typed rows, not silence | A3/A4/A5 fixture suites; A2 table `residualGaps[]` |
| A3 | Every sanctioned `pipeline-state.mjs` verb yields a state accepted by every readiness observer | `pipeline-state-observer-conformance.test.mjs` green |
| A4 | `submit-plan`/`approve-plan` refuse pre-authority staging paths with the typed reason | A4 entry-guard fixtures |
| A5 | Closed-evidence drift: detected as a diagnostic on active branches, fail-closed on inactive ones, and repairable via the two PO-gated verbs with audit trail | A5(i) fixtures incl. a replay of the 2026-08-27 incident shape |
| A6 | ≥14 days of interruption receipts exist before any threshold-dependent promotion; the window is machine-checked, not remembered | `interruption-baseline.json` + the promotion checks that read it |
| A7 | Rigor floor: same normalized inputs ⇒ same floor (pinned fixtures); unknown inputs never lower; actual-surface growth escalates/reauthorizes; report-only disagreement log exists before enforcement | B1 fixtures + disagreement log artifact |
| A8 | Greenfield resolves to `inherited-agent-first` and produces a machine-readable disposition before implementation authority; a PO custom profile is honored, measured, and never silently replaced | D2/D3 planning fixtures |
| A9 | This repository completes the D4 adoption flow end to end: typed state, priced staged proposal, one durable PO decision, evidence recorded | dogfood evidence set under `specs/sprint-alfred-epic/evidence/` |
| A10 | Model-judged evaluator output can never be `pass` (deterministic-pass rule) — attempted prompt-only compliance yields `finding`/`unknown` in fixtures | D3 fixture "prompt-only claimed compliance" |
| A11 | The eight B2 routes exist; each refusal message names its route; the B2-i authorization satisfies its four ⚖ constraints | B2 per-route fixtures |
| A12 | Rules-as-code sweep landed: GG-22 defined where cited; SendMessage relay rule homed; push-flow doc corrected; strip tool bounded to the Triage section | B3 doc-consistency suites + strip fixture |
| A13 | All 24 in-scope backlog items closed with closure evidence or PO-visibly re-triaged; ledger reconciled; member issues closed with candidate-bound comments; sprint close comment written | backlog ledger + GitHub issue trail |
| A14 | Every wave's deliverables passed ≥1 independent Critic round (fresh context, paths-only dispatch); fail-then-fix cycles documented | Critic evidence under `evidence/critic/` |
| A15 | Documentation acceptance per member issue against the exact accepted candidate | per-issue doc evidence links |

## B. Incident-derived regression criteria (2026-08-27 class)

| # | Criterion | Evidence |
|---|---|---|
| B1 | A post-close write to a bound Result is refused (agent routes) and detected (any route) at next state read — not at the next lifecycle transition weeks later | A3 dynamic-class + A5(i) fixtures |
| B2 | A `discard-feature` on a repo with active continuity and null Result completes into a `ready` session with no human shell step | A5(ii) end-to-end fixture |
| B3 | The four seed interruption classes emit correct receipts when reproduced | C1 seed fixtures |
| B4 | A guard-refused read-only interpreter command receives a typed read-only retry action, not a signature demand | B2-iii fixture |

## C. Fixture inventory floor

The union of: #101's 8 named fixture classes; #102's 8; #103's classification
determinism + lineage + privacy set; #104's 10; #105's 14; #106's 21; #109's
7 + dogfood; A1's probe classification set; A5's observer-conformance
enumeration; B2's per-route sets; C1's four seeds. `verify-suite-registration`
entries for each carry `invariantPinned` (C2 consolidation rule) — a fixture
that cannot name its invariant does not register.

## D. Review-lens rule (conditional on PRD §9.2)

If the PO accepts `managed-onboarding-success-contract` into Alfred: every
host-layout onboarding test added or touched by this sprint asserts the
end-to-end success contract (inspect/plan/apply/readback, exact allowed write
set, host-control preservation); rejection-only tests are acceptable solely
for explicitly unsupported layouts. Applied as a Critic review lens on
A-track diffs touching onboarding tests.
