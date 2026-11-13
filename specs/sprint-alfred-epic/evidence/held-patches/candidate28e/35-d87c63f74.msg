feat(close): the feature close requires every Spec addendum to be approved and reviewed (ADR-0095)

The close candidate is checked for Spec addenda before feature-close-
prepared (CLOSE-SPEC-ADDENDUM-UNCOVERED):
- an addendum file at the candidate that the package's addendum reader
  does not return (never approved or registered, or outside a package)
  blocks: an unapproved correction must not read like Spec authority
  in the delivered tree;
- every applied addendum of an active package must be covered by the
  course's last registered Critic round, i.e. that round's reviewed
  candidate holds the addendum with its approved bytes; a superseded
  addendum (the design was reopened and re-approved) does not block.
"Covered" is derived from the registered lineage and the addendum
digest; no new record.

- lib/spec-addendum-coverage.mjs specAddendumCloseFindings (read-only,
  at one commit)
- scripts/close-coordinator.mjs: the gate after the Critic evidence
  check of the feature-close-prepared plan

Chain e2e (lib/pins/critic-course-consumer-chain-walk.test.mjs, PATH D,
real entry points): round 1 fails with a major; the addendum is
committed alone; the PO approves it through approve-spec-addendum (chat
mode as the fixture configures); register-feature-package.mjs
--add-spec-addendum registers it; the correction and a delta round over
addendum, registration and code pass; the close plans. Negatives: a
wrong base digest is refused at the approval (SPEC-ADDENDUM-BASE), an
addendum changed after the approval at the registration
(FPR-SPEC-ADDENDUM-DIGEST), an unapproved addendum and an approved one
no registered round reviewed at the close. The signature round-trip
consumer leg now ends in the registration (signature mode into
--add-spec-addendum). Walk 27/27, round-trip 31/31; close coordinator,
audit lifecycle, close path e2e and finish-feature 146/146.

AI-Assisted: true
Dispatch: stage-0 (elephant)
