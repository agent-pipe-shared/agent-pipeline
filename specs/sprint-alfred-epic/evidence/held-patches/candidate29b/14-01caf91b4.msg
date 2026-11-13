test(pins): classify approve-spec-addendum as an off-happy-path PO interaction

28e added the pipeline-state verb `approve-spec-addendum` (ADR-0095)
without classifying it in the AC-264 PO-interaction inventory, so the
three-runner happy-path pin failed with "unclassified PO-interaction
verbs: approve-spec-addendum" (found by the candidate 29 suite run). A
Spec addendum is a design change after the plan approval; a feature
course that keeps its approved design never meets it, so it joins the
off-happy-path verbs. The happy path still needs exactly two per-feature
approvals.

Checkpoint-Intent: candidate 29, 28e follow-up
AI-Assisted: true
Dispatch: stage-0 (elephant)
