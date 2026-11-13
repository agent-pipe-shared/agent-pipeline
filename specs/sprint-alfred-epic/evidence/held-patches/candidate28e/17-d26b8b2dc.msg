fix(critic): admit the receipt-bound Critic export inside a one-shot close commit

Antigravity test run 2026-11-12: a one-shot close exports the Critic
rounds that were not exported before inside its one close commit (PO tile
2026-11-10). `criticCloseCommit` refused every path under
specs/<feature>/evidence/critic/, so that close commit counted as a
correction and the printed push-evidence command failed with
VEP-CVL-CARRY-CONTENT-CHANGED; no one-shot close could be pushed.

- lib/critic-course-admission.mjs: the receipt binding of added export
  directories moves into `criticExportDirectoriesBound`, shared by the
  export-only commit and the close commit; a close commit admits an
  export path only as an added regular file, exactly the three export
  files of a packet whose canonical consumed receipt they carry, and no
  critic-lineage file alongside (that binding stays with the export
  classifier's extended form)
- classifyRegisteredEvidenceOnlyCommits passes the receipt reader to the
  close classifier

Tests: critic-verify-lifecycle 16c (the bound export admitted and passed
over by the push carry-forward; refused without the consumed receipt,
with forged receipt bytes, a missing index, an extra file or an index
claiming another pass), 30/30;
close-path-e2e "C28e (Antigravity test run)": one-shot close without a
prior export, close commit carries the export, the printed push-evidence
command exits 0; 8/8 green. Without the fix the same e2e fails at the
push-evidence command (exit 2).

AI-Assisted: true
Dispatch: stage-0 (elephant)
