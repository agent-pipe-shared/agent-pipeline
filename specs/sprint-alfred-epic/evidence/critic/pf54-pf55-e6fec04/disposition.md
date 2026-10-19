# Critic review of the PF-54/PF-55 batch at e6fec04a0: disposition

## The review

- **Batch and candidate:** PF-54 and PF-55 (D50-D53). Candidate `e6fec04a00dc11fca06605902d82f054259b824b`.
- **Review object:** the commits `f52d20a12`, `d769449e8`, `e64562c6a`, `cfcd01b6f`, `426e4afbe` and `d99774b17`.
- **Review ordinal:** 1 (full).
- **Route:** one fresh read-only session Critic, `claude-opus-5-5` at max. Assurance `functional-equivalent-read-only; OS isolation not asserted`.
- **Verdict:** FAIL, with five major findings (F1-F5) and six minor findings (F6-F11).
- **The Critic's own notes:** [critic-notes.md](critic-notes.md), copied unchanged from its scratch directory.

**This review is advisory, not receipted.** `critic-dispatch-preflight.mjs` refused the
packet with `CCA-REVIEW-UNIT-REQUIRED`: the sprint's `lifecycle.json` registers no design
review unit for this spec path. So `session-critic-finalizer.mjs admit` was not run, and no
finalizer receipt exists. The Critic was dispatched directly from
`templates/prompts/critic-review.md`.

## Findings

| # | Severity | Disposition |
|---|---|---|
| F1 | major | Accepted. D52 (1)'s override and D52 (2)'s take-over route are built in this correction (D54 (2)). |
| F2 | major | Accepted. A slice with an AGY reservation counts as started, so its cancel needs `--started`. |
| F3 | major | Accepted as a lifecycle finding; no code can fix it. The PF-54 commits `cfcd01b6f` and `426e4afbe` were Elephant-built with no recorded EL-01 exception. Q11 now asks the PO to ratify them together with the D54 work. |
| F4 | major | Accepted. A refusal after native preparation rolls back the native pending state and the reserved member, as it already rolls back the queue row. |
| F5 | major | Accepted. New cases cover the PF-54 held branch, the legacy-override discharge and different-bytes drift branches, and the AGY settled filters. |
| F6 | minor | Accepted. It needs a change to the protected `scripts/pipeline-state.mjs`, so it is prepared as ceremony C12 and does not land with this correction. |
| F7 | minor | Accepted. The strict drift refusal names the in-flight member's slice and the repair command. |
| F8 | minor | Accepted. The heal writes the marker before the new baselines, and a marker failure refuses the heal. |
| F9 | minor | Accepted. The repair texts print the absolute script path. |
| F10 | minor | Accepted as a convention gap; history is not rewritten. Q12 asks the PO for the trailer form of an Elephant-built commit under a recorded exception. |
| F11 | minor | Accepted. The comment is corrected. |

**Not cleared by the Critic:** after `d99774b17`, a settled foreign slice's `allowedPaths`
stay in `foreignPaths`. Its effect on a later slice's host commit over the same scope was not
established. It is measured in this correction.

**Correction ownership:** the governed Goldfish route needs a signed Spec row per item (Q11),
so the Elephant builds the correction under the same exception. The correction diff gets
review ordinal 2, a delta review from `e6fec04a0`.
