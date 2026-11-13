test(critic-preflight): drive the dated-folder Spec through admit, finalize and lineage registration

Glossover K-30 follow-up: the preflight case stopped at packet-ready,
the shape in which K-25 was green at one step and refused at the next.
The case now also derives the registration commit without
--registration-commit, then admits and finalizes the round on that Spec
path, registers the written lineage and reads the retained course back
under the package's feature id.

- parentRound takes an optional Spec path (default unchanged).

Checkpoint-Intent: candidate 29c, Glossover K-30
AI-Assisted: true
Dispatch: stage-0 (elephant)
