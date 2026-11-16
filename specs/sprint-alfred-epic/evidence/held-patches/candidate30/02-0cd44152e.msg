feat(design-review): one full round and two delta rounds, blocking findings apart from questions (C30-6)

- A greenfield run needed twelve fresh full readiness rounds and never
  reached ready, because no receipt was made (so no delta was possible) and
  every question the reviewer asked became an open finding.
- create refuses a fourth round (DRR-ROUND-CAP); the parse bound stays 64,
  so earlier chains and signed approvals are untouched. present-plan stops
  refusing an open review after round 3; the binding already carries the
  verdict and ids, and the signing text now states them knowingly.
- The reviewer returns Blocking findings and Questions apart; create checks
  the receipt's open findings against the bound report text
  (DRC-FINDINGS-SPLIT), so a question never holds the design and the
  reviewed party cannot decide what blocks.
- The dispatch of a readiness-reviewer is refused while an observed round has
  no receipt (DISPATCH-DESIGN-REVIEW-NO-RECEIPT), the failure the stopped
  run actually had; a round older than 48 hours counts as abandoned.
- Reviewer text: round modes (full, delta), a delta contract, the mandatory
  questions asked once, no decomposition question for a small project.
- design-course, happy-path and ADR-0085 (amendment 2026-11-16) state the
  order: report, receipt over the unchanged sources, then correct.
- Tests: receipt library and CLI cases, binding statement, the L3 e2e case
  restated with a three-round chain, and the replay of the stopped run.

AI-Assisted: true
Dispatch: stage-0 (elephant)
