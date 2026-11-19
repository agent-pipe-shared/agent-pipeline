feat(close): the close readback reports a README that still carries the onboarding skeleton, as a hint

A second Antigravity greenfield report: the project's README.md was still the onboarding skeleton ("Not filled yet.") at the close, although the project's own agent rules require it to say how to start and test the product, because no slice had it in its write scope and no check looked. PO decision 2026-11-19: report it at the close, never block (the spirit of ADR-0105: a hint).

closeQualityReadback() gains an eighth, appended, report-only row "readme-filled": present when README.md exists without the skeleton sentence, missing (with a remedy naming the start and test commands) while it is still there, not-applicable when the project has no README, unknown when it cannot be read or no reader is supplied. A missing row appears, like every missing row, as an agent action before the freeze with the remedy and the source "advice, not a gate"; nothing refuses on it and no existing row changes. The closed row list is restated in the two tests that pinned seven rows (QG-04, an additive row), and a case covers the four statuses and the closed row shape.

AI-Assisted: true
Dispatch: stage-0 (elephant)
