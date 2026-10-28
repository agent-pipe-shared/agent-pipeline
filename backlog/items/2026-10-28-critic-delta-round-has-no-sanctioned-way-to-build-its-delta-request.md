# The Critic delta round (round 2) needs a registered delta request that no script builds: `prepareRegisteredCriticDeltaRequest` has no caller (Glossover PF-94, P0)

Relayed 2026-10-28 by the PO from the Glossover session after the round-3 follow-up bundle v2. Build under test:
`0.7.0+claude.20261028130003.de73eff`.

## Observed

PF-93 is fixed on the real consumer: the hooks were refreshed, `export` of round 1 runs through and its receipt, report and
index were committed. Round 2 (the delta round) is then refused at the preflight, which demands a canonical delta request
`specs/<feature>/evidence/critic-delta-request-<sha>.json` that is registered in the feature manifest.

Re-read in this repository (2026-10-28): the only builder is `prepareRegisteredCriticDeltaRequest` in
`plugins/pipeline-core/lib/critic-course-admission.mjs` (line 596); it has no caller anywhere in `plugins/`, `harness/`,
`scripts/` or `docs/`. `register-feature-package.mjs` accepts only `--add-review-unit` and `--add-diagnostic-evidence <path>`.
The only route left is a private helper script plus a hand edit of `lifecycle.json`, which bypasses the registration of the
Pipeline; the Glossover session rightly refused to do that and did not start the delta round, so no Critic run was spent.

Consequence: no consumer can ever start Critic round 2 or later through a sanctioned route. Round 1 works, the course
cannot continue.

## Consumer facts (read-only answers of the Glossover session, 2026-10-28; model output, not yet re-verified here)

- Round 1: candidate `20efd3ed…`, base `05e3ebc8…`, packet `c3a2e1df…`, packetDigest `37f56e92…`; finalized with the
  caller-authored fallback under build `…091024.692301f` (the course path was not used); exported and committed in `83e36de`
  under `specs/<feature>/evidence/critic/c3a2…/` (receipt, report, index), none of them registered in `lifecycle.json`.
- 25 commits since round 1 (corrections plus documentation). The manifest holds diagnostic evidence for later candidates
  (`critic-diag-c2`, `c3`) but no lineage record and no delta request anywhere in the repository.
- Preflight on candidate `65eb2a14…` with the evidence: mode full ends in `CGB-CONFLICT`; with a (placeholder) delta request
  path it ends in `CCA-REQUESTED-MODE` ("the first review is full, every later review is a delta"). `CCA-DELTA-REQUIRED` never
  appeared, so the course does not see round 1 as consumed history.

## Finding of the Elephant (2026-10-28, checked in this repository)

The course history is read from manifest-registered `candidate-evidence` artifacts whose content is a
`pipeline.critic-review-lineage.v1|v2` record (`retainedV2`, `critic-course-admission.mjs` line 378). `compileCriticReviewLineage`
and `compileRegisteredCriticReviewLineage` (`critic-review-lineage.mjs` lines 293 and 418) have no production caller, only tests.
So the gap is wider than the delta request: no sanctioned route turns a consumed round into a lineage record and registers it,
and none builds and registers the delta request. Round 2 needs both, in a registration order not yet analysed. Whether a round
finalized with the caller-authored fallback may seed a course is an open question (possibly a PO decision).

## Recon result and PO decisions (2026-10-28)

Recon notes: `specs/sprint-alfred-epic/evidence/held-patches/w7-recon-pf94-course-continuation.notes.md` (committed `63360e652`).
No production caller exists for the lineage compilers or the delta request builder; the lineage registration of round N must
happen before the next correction commit (evidence-only transport); a fallback-finalized round has no course claim and cannot
become a lineage record; mode full ends in `CGB-CONFLICT` because the old batch owns the review unit work ids under another
origin (`featureOwnership`, `critic-generic-batch.mjs` about line 735).

PO decisions: (1) rerunning a Critic round is acceptable, cost is no objection; (2) tile answer "narrow takeover by command":
a feature course may take over the logical work ids of a consumed batch with a non-course origin, only while the course has no
registered history, with a reason, an append-only audit record and the old evidence preserved. A legacy seed and new work ids
were not chosen.

Slices: c15 takeover verbs (inspect and supersede, unblocks the rerun of round 1), c16 lineage record writer
(`--add-review-lineage`), c17 delta request writer (`--add-delta-request`), then the end-to-end pin and the operator docs.

## Wanted

- A sanctioned command, for example `register-feature-package.mjs --root <root> --add-delta-request <input.json>`, that takes
  `changedBehaviorClaims`, `pathInvariantMap`, `coordinatorImpactConfirmed`, `trustBoundaryChanged` and `impactAmbiguous`
  (structured input from a file, not a flag per field), derives the course request (feature, base, candidate, registration
  commit, accepted reference) from the repository state instead of asking the operator for commit ids, builds the request
  through `prepareRegisteredCriticDeltaRequest`, writes the immutable artifact, registers it in the manifest the way
  `--add-diagnostic-evidence` does, and names the path to commit.
- The ordering question of the registration is analysed first: the request is prepared against a registration commit and then
  registered in a later commit; the preflight reader (`requestRead` in the same library) must accept exactly that.
- Tested against the real state (a consumed round 1 of a registered feature, as the Glossover repository holds it) and the
  upgrade state (a round 1 consumed by the previous build), not only a state built by the new code.
- The path after the request walked and pinned end to end: preflight, admit of round 2, finalize, export, next delta, and the
  refusals (budget exhausted, no correction commits, foreign request).

Related: PF-93 (`2026-10-28-finalized-legacy-packet-receipt-digest-refused-by-export.md`), D165 diagnostic evidence
registration (`register-feature-package.mjs --add-diagnostic-evidence`).
