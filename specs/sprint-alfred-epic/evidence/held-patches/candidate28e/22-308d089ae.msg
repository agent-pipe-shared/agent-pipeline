fix(architecture): report class 9 as unmeasured for a design-package adoption

Claude test run 2026-11-13: after a re-approved design, the second
implementation entry (set-phase implementation) met class 9
profile-drift "unavailable" and was refused. A repository adopted
through an approved design package has no adoption authority subject and
so no accepted snapshot; class 9 can never be measured there, and once
the planned surfaces exist the greenfield-pending allowance no longer
applies. Every design-package project was locked out of re-entry. PO
decision 2026-11-13 ("Nur melden"): report it, do not block.

- architecture-fitness.mjs evaluateProfileDrift: when the accepted
  adoption is approved-scoped through an `approved-design-package:`
  decision, the unavailable outcome carries evidence
  { status: "unavailable", source: "approved-design-package",
  measured: false }; the outcome itself stays unavailable
- architecture-entry-readiness.mjs projectPlanningFitness: exactly that
  outcome (class 9, profile-drift, the missing-authority detail, the
  design-package source) is report-only; every other unavailable class 9
  still blocks

Tests: entry-gates-greenfield-pending (admitted beside an uncalibrated
class 10; denied without the source and with another cause), 11/11;
close-path-e2e "C28e (Claude test run)": a consumer fixture with every
planned surface committed passes the real set-phase entry guard, class 9
reported with the design-package source. That chain test was committed
early, together with the Antigravity e2e in the same file (commit
"fix(critic): admit the receipt-bound Critic export inside a one-shot
close commit"); it needs this change to pass.

AI-Assisted: true
Dispatch: stage-0 (elephant)
