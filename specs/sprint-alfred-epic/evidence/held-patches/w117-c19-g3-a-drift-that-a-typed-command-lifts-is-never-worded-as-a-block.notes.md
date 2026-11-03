# w117 — a bound-document drift names its cause and its two typed exits (candidate 19, C19-G3)

Applies on the chain at the base `c0bed9f7f`. Criterion binding: AC-115 is the closest existing accepted criterion (the pre-edit warning about the bound authority documents); the PRD and the Spec are unchanged.
Source: the PO's greenfield test of candidate 18 (2026-11-03): the session saw the drift, concluded it was blocked and wanted to stop, although a plain `submit-plan` clears it. Rule: a state that a typed command lifts is never worded as a block.

## What it adds

- `onboarding-continuity.mjs`: `explainContinuityUnavailable(options)`, read-only. It returns `KICKOFF-PROMOTION-AUTHORITY-DRIFT` or `KICKOFF-PROMOTION-EVIDENCE-DRIFT` when the observation is `unavailable` for exactly that reason, and `null` for every other case. The cause is carried beside `continuity`, not in it, so the `continuity` object (digest-bound, key-pinned) is byte-identical.
- `project-onboarding-v3.mjs`: in the `continuity.status !== "valid"` branch, a drift code now yields the diagnostic `continuity_bound_document_drift`. It names the closed code in one sentence, says the state is not terminal, and names both exits: `submit-plan --by <name> --profile <epic|feature|mini>` (rebinds the edited documents) and `authority-restore.mjs restore --root <root>` (returns the approved bytes). `--by` stays the placeholder `<name>`. Every other cause (unreadable, damaged, other codes, a throwing explainer) takes the unchanged branch with today's wording, status and `nextAction: null`.
- `guard/denial-route.mjs`: GUARD-LIFECYCLE-AUTHORITY-BOUND gains one sentence naming the same two exits next to the existing text; the `design lock` wording that `authority-restore.test.mjs` matches is kept.
- `continuity-drift-exits.test.mjs`: 6 cases (real promoted fixture for the two drift codes and the null case; lifecycle wording for both codes; unchanged wording for other causes; the guard text).

## Not changed / not proven

- `nextAction` stays `null` on the drift result: both exits need a name only the PO supplies and a typed collect-input action for `submit-plan` would need a new schema. The exits are in the diagnostic text instead.
- What counts as drift, the readiness class names, exit codes, digests and the reopen-design path are untouched. The late-binding redesign (C19-G2) and the readiness `inspect` nextAction for other steps (C19-G1) are out of scope.
- The new test file needs registration in the Verify suite list; it is not registered here. The full Verify run was not made.
