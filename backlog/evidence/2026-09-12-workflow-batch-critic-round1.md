# Workflow batch Critic — substantive round 1

Date: 2026-09-12

Candidate commit: `a4c77364b8b1fcfc122d19be71e8d7800c3d19a5`

Review route: ordinary fresh-session, read-only Critic

Assurance: functional-equivalent read-only; OS isolation was not asserted

This file transcribes the substantive report returned to the Coordinator by
dispatch `/root/workflow_batch_critic`. The preceding attempt stopped before
review because the required governance paths were absent; it produced no
substantive verdict.

## Findings

1. **Blocker — candidate-bound machine evidence absent.** The focused test
   claims existed only as prose. The referenced v3 dispatch record was outside
   the review scope and still `in-progress`, so the deterministic gate could not
   prove either test ran against `a4c77364`. Reference:
   `harness/review-protocol.md` §1.
2. **Blocker — residual inter-batch collision unowned.** The implementation
   validates only the array supplied to one call. Two independent callers can
   submit overlapping batches, so the shared-checkout collision remained
   unresolved without an owner or expiry. Reference:
   `governance/examples/policies/checklist.md` item 8.
3. **Blocker — rollback absent.** No reviewed plan/evidence artifact documented
   recovery for a regression in the shared dispatch boundary. Reference:
   `governance/examples/policies/checklist.md` item 4.

## Positive observations

The Critic found the implementation correctly normalized and compared exact
and ancestor write scopes, excluded read-only members, returned conflict
indices, preflighted the whole admitted batch before adapter invocation, and
used copied normalized requests. It found no new dependency, secret/PII flow,
authorization change, live activation or public breaking API. Existing
single-request and Phase-2.6 paths stayed outside the new route, and
`git diff --check 54d12b87..a4c77364` passed.

## Trajectory

The trajectory was not verifiable in round 1 because the supplied prose was not
a machine-written candidate-bound test artifact. The correction package is
therefore limited to those three findings and their direct regressions.
