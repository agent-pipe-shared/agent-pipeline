docs(adr): state ADR-0095 as built (who runs what, order, coverage)

- Decision 4: the approval is the PO's, the commands are agent work.
  The agent runs approve-spec-addendum with the label the PO gave
  (EL-36); under signature the PO runs the printed authorize-critical
  line and the agent the printed recordCommand; under chat the record
  is attributed, not proven. It no longer claims a confirmation code
  or a human-only verb. The approval commit is HEAD with the addendum
  committed and unchanged.
- Decision 5: the registration checks, and that the addendum file is
  content (outside the administration path set), so the next round
  reviews it; the earlier claim that the registration commit forces the
  delta round is replaced by the measured reason.
- New decision 6: the order inside the course (lineage of the round
  first, then the addendum commit), because a lineage cannot be
  registered once a correction follows its round.
- Decision 7: the consumers as built: briefing context lines, no
  separate delta binding (the addendum is a changed path of the range),
  the close gate CLOSE-SPEC-ADDENDUM-UNCOVERED with its "covered"
  definition, the audit bundle carries every manifest entry.
- Known limits: what "covered" proves, and chat mode.
- register-feature-package.mjs help: lineage first in step 1.

AI-Assisted: true
Dispatch: stage-0 (elephant)
