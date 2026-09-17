# Alfred final-review PO decision queue

This queue records only decisions that the final independent review found to
be reserved to the Product Owner. It is not an approval, a threat-model
snapshot, or a substitute for reopening the bound plan.

## 1. Threat-model and candidate-bound approval — required before push

**Why this is a PO decision:** Commit `9963d2c6` changes the admission rule
for implementation authority. The enforcing checklist therefore requires a
current checked-in threat model and a detached request bound to the exact
delivery candidate and effective policy revision; the push/release action
requires the matching human proof.

**Decision requested:** approve the prepared threat-model disposition for the
implementation-authority boundary, or record a justified not-applicable or
accepted-risk disposition through the approved detached route.

**Evidence to bind after the candidate is frozen:** candidate commit and tree,
effective policy revision, threat-model snapshot digest, detached approval
request, and the resulting human/policy proof.

## 2. Reopen the bound plan to add the rollback path — required before push

**Why this is a PO decision:** The approved PRD is the bound plan artifact and
may not be edited by an agent during implementation. The enforcing checklist
requires that artifact to state the production rollback path for this guard
change.

**Proposed plan amendment:** document that no external action or migration is
performed by this change; before a push, rollback is to stop the action. After
a push, rollback is a normal forward revert of the exact implementation commit
that introduced the guard behavior, followed by the ordinary Verify and
applicable PO/push gates. No history rewrite, guard bypass, or automatic
rollback is authorized.

**Decision requested:** reopen the plan, accept or amend this rollback text,
then resubmit and approve the changed plan through the sanctioned lifecycle
route.

## Resolved by implementation, no PO decision

The Delta-Critic's parser finding is resolved in the working candidate: the
plan-surface parser now recognizes common implementation roots and root-level
contract files (`package.json`, lockfiles, and root schemas). A regression test
proves that a clean worktree cannot hide a planned root contract change behind
a `mini` profile.
