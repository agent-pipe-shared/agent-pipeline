---
schema: pipeline.backlog-item.v1
id: pipeline.push-review-waiver-has-no-committed-approval-evidence
type: defect
owner: pipeline
status: open
done_when: manual
release: 0.7.0
created: 2026-10-31
sprint: alfred
source: "D214 slice of candidate 14 (2026-10-31): the build stopped at its own stop condition; evidence survey in specs/sprint-alfred-epic/evidence/held-patches/w8-d214-committed-rigor-source-for-the-push-review-waiver.notes.md."
---

# The independent-review waiver for an approved mini feature cannot be proven from committed bytes (D214 blocked)

## What happened

`hooks/guard-push.mjs` `pushedStateRequiresReview` reads the project State from the pushed tree. A consumer's onboarding gitignores
`/project/pipeline-state.json`, so the pushed commit carries no State and the answer is always `REVIEW-STATE-UNAVAILABLE`: even an
approved mini feature needs the independent Critic and an exact-green Verify before a push. D214 (PO decision) asked to read the
approved rigor from a committed, digest-bound source the consumer really has.

## Cause (verified)

No committed source carries approval evidence: `specs/<f>/lifecycle.json` has integer rigor 1 or 2 (always `REVIEW-PACKAGE-REQUIRED`) and a
self-claimed `state: approved`; the PRD markers carry the language, the spec digest and the plan acknowledgement, no profile and no
approval event; `planSubmission`/`planApproval` live only in the ignored State; the bootstrap receipt and its Ed25519 proof sit in
`scratch/` (ignored) and sign the PRD acknowledgement, not the profile; the private store holds no mini-approval record. A committed receipt
the sanctioned writer would emit is unauthenticated and `specs/` is agent-writable, so a forged receipt would buy a false waiver.

## What the chain walk showed (the consumer path is not blocked)

With the real consumer shape (no State at the pushed commit) the multi-round Critic-course paths reach the real review decision: a registered
course is `REVIEW-PACKAGE-REQUIRED` and a State-less pushed tree is `REVIEW-STATE-UNAVAILABLE`, i.e. the push needs the candidate-bound
review and the exact-green Verify, which is the normal route for a Critic-course feature. Only the mini feature without a Critic is
affected.

## Options (PO decision pending)

- A: a signed receipt written inside `approve-plan` (about 1-2 KB, verified against the committed trust anchors, a new signed intent kind,
  a new signature ceremony per mini approval; chat mode stays `required`). Protected kernel files: `scripts/pipeline-state.mjs`,
  `hooks/guard-push.mjs`, the resolver.
- B: package rigor 0 written by the registration writer (a self-claim unless the same signed proof is embedded, then it is A).
- C: keep strict (every push keeps the independent review); make the onboarding-v3 seeded push gate case and SECGATE-1 green by seeding the
  evidence a consumer really has (a Critic-bound Verify record).

## Related reds

The onboarding-v3 seeded push gate case has a second, independent finding (`Push approval missing: project/pipeline-state.json does not
exist`); it needs its own measurement, whatever the PO decides here.
