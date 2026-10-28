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
