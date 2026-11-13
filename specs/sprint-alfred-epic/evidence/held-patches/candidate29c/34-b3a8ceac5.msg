fix(dispatch-briefing): count a table row as a criterion place only inside an acceptance table the host reads

- K-31 (Glossover): a slice-plan table whose first column lists criterion ids,
  under a non-normative heading, made findCriterionOccurrences count a second
  place (DBG-CRITERION-AMBIGUOUS) although the host parser
  (scanAcceptedCriterionRows) reads only the `# | Criterion | Evidence` table or
  the two-column acceptance table and binds the bullet.
- The generator now opens a table only on a header plus delimiter row the host
  recognizes; any other table is a reference.
- Pin test: the K-31 shape binds, the host scan sees one row, a real acceptance
  table row still makes it ambiguous; two fixtures gain the header rows the
  host needs anyway.

AI-Assisted: true
Dispatch: stage-0 (elephant)
