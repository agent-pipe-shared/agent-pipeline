fix(package): supersede a not-yet-verified package on re-approval and keep its evidence

Claude test run 2026-11-13: after a Critic round the design was revised
and approved again. register-feature-package met a manifest that listed
the earlier approval plus that round's evidence (diagnostics, lineage,
Verify) and refused with FPR-MANIFEST-CONFLICT; the only supersede route
admitted a manifest that listed earlier approvals and nothing else. The
run had no way forward but a hand edit. PO decision 2026-11-13: the
rebind is built into 28e.

- lib/feature-package-registration.mjs supersededRegistrations: a
  manifest in state approved or implementing (candidate null, no
  supersedes) that lists at least one earlier approval is superseded by
  the new approval as well; every candidate-evidence entry is retained
  with its recorded digest, provided it lies under specs/<feature>/, is
  not the new envelope, and its file still holds exactly those bytes.
  A verifying or completed package, a drifted file or an entry outside
  the feature's directory stays FPR-MANIFEST-CONFLICT and nothing is
  written.

Tests: architecture-baseline 7.13c on the real create-adr -> bind ->
approval -> materialize walk, the manifest binding the earlier PRD and
Spec digests as observed: refused for a verifying package, a drifted
entry and a foreign entry (manifest unchanged each time); registered
for approved and implementing, the earlier approval and the round's
evidence retained in order, the current approval appended, PRD and Spec
rebound to the approved bytes. Without the fix 7.13c fails (exit 2).
architecture-baseline and pipeline-state-rebind-mutable: 51/51.

Open: the Critic review unit is re-registered as found; a Spec id added
by the re-approval is not a unit criterion, a dropped one blocks the
Critic batch (CGB-REVIEW-UNIT-BINDING). Needs a decision.

AI-Assisted: true
Dispatch: stage-0 (elephant)
