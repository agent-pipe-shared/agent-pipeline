fix(guard): name the findings and the readiness block in the fitness denial

- GUARD-ARCHITECTURE-FITNESS-NON-GREEN named only remedy ids. A Claude
  Windows greenfield run spent about an hour on fitness remedies (deleting
  dist/, re-materializing, a design reopen with a PO signature) while the
  entry readiness that decides the greenfield pending allowance was blocked
  by ARCHITECTURE-DECISION-APPLICABILITY-BLOCKED, which the denial never
  showed.
- The denial now lists the evaluator findings with their details (file and
  module edge), the allowance's own refusal code, and, when readiness is not
  ready, its code, message and guidance, stating that fitness fixes alone do
  not clear it. The decision itself is unchanged.

AI-Assisted: true
Dispatch: stage-0 (elephant)
