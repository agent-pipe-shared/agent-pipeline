---
schema: pipeline.backlog-item.v1
id: pipeline.close-addendum-ignores-residual-acceptance-and-course-chain
type: defect
owner: pipeline
status: open
release: 0.7.0
created: 2026-10-31
sprint: alfred
source: "Consumer hand-over N35 of 2026-10-31, retested on the installed stamp a2099ff5f (0.7.0+claude.20261031060558.62b553e) with a read-only probe; both causes checked by the Elephant against the tree."
---

# The close addendum refuses a course closed by residual acceptance and covers only one round's range (N35)

## What happened

After candidate 13 (D212) the addendum validator admits `orchestrator-attested` records and a course receipt of another task id binds
a record whose commit lies in its reviewed range. The close still ends in `CLOSE-CRITIC-EVIDENCE-MISSING` for two records: the
consumer's course ended through a PO-signed `accept-residual-critic-findings` on minor findings (D190), so every consumed receipt
carries `reviewPass: false`; and the two record commits lie only in the range of round 1, while the later delta rounds start at
round 1's candidate.

## Cause (verified against the tree)

- `plugins/pipeline-core/scripts/check-critic-skip-coverage.mjs` `boundCriticReviewFinding` (lines 574-580) calls
  `readBoundConsumedCriticReceipt` without `deps`, then refuses `reviewPass !== true`. `lib/critic-verify-lifecycle.mjs`
  (lines 111-122) admits a failed receipt only with `deps.residualAcceptance` and `verifyResidualAcceptanceFn`, which the Verify
  path passes and the addendum path never does.
- `courseReceiptFinding` (lines 537-558) checks the record commit against the single receipt's `(base, commit]`; the course
  lineage (one full round, then delta rounds, D190/D204) is not read, so a record reviewed in round 1 and carried by later delta
  rounds is outside every range except round 1, whose receipt has findings.
- The refusal text does not say that a failed receipt never binds, nor that a residual acceptance exists.
- The D212 build checked the attested record and the course receipt in isolation and did not walk the residual-accepted course
  end of D190: the follow-up path was missed.

## Fix options (PO decision pending)

- A + B: pass the PO residual acceptance into the addendum read (as Verify does), and cover a record when its commit lies in the
  union of the consumed, registered rounds of one course whose last round passed or is residual-accepted.
- C: a typed, signed, candidate-bound PO close decision ("Critic evidence for records X satisfied by course Y").
- D: a fresh full course over the whole range (costs a round, can find new findings).

Acceptance: the consumer's `plan-transition --phase feature-close-prepared` no longer reports `CLOSE-CRITIC-EVIDENCE-MISSING`, and
the close runs to `closed-local`; a refusal names the missing evidence or decision and the route.
