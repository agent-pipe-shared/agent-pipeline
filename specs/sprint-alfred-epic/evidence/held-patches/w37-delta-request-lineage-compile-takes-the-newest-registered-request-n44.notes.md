# w37 — the round lineage compiles against the newest registered delta request (N44)

Backlog item `2026-10-31-a-second-diagnostic-for-one-candidate-makes-the-lineage-unregistrable.md`.

- `plugins/pipeline-core/lib/feature-package-registration.mjs`: the lineage compile took the FIRST registered delta request whose
  candidate and base matched. After a second diagnostic the manifest holds an older request (built when only the first diagnostic
  existed, it no longer binds the evidence set) before the newer one, so the compile stopped on the stale one
  (`CCA-DELTA-BINDING` / `CCA-REGISTRATION-SHAPE`). It now walks the manifest from its end, so the newest matching request wins.
  Nothing else changes; a single request behaves as before.
- `plugins/pipeline-core/lib/critic-course-admission.test.mjs`: new case `PF94 ROUND2 (c)`. It finalizes round 2 the real way, undoes
  the lineage write, puts a stale request for the same candidate and base (empty `deterministicEvidence`) before the genuine one in
  the manifest, and expects `addCriticReviewLineage` to register the lineage of round 2.
- `harness/scripts/check-verify-case-completion.test.mjs`: the pinned assertion count of that suite moves 337 -> 343 (the case adds 6).

**Order:** stack-dependent on `w18` and `w18b` (the pin line) and the other pin restatements before it; it is the LAST `step2` of the
script. Built and checked on a clone stacked with all patches before it.

Evidence: course admission suite and case completion suite 116/116 on that stack. Mutation: with the old first-match loop the new
case is red (the stale request is chosen and the compile refuses). Not a Full Verify; no Critic (paused by the PO).

Not done: the second half of the Proposed direction (refuse or warn when a second diagnostic is registered for a candidate that already
has a request, and make preflight and admit check the same selection). Only the selection is changed.
