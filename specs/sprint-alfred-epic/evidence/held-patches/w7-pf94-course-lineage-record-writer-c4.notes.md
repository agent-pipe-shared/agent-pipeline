# W7 PF-94 c16 increment 4: failing round asks for the delta request, coverage bound to the receipt range

Slice W7-PF94-COURSE-LINEAGE-RECORD-WRITER-C4-C1-20261027. Candidate bb5d4061a8c182ef24be2d2b5381f0f1b94ae4fe. Held patch, nothing committed by the Goldfish.
The Goldfish ran out of its tool budget before it wrote these notes; the Elephant read the logs, regenerated the patch from the clone (7108 bytes, same size as the Goldfish's own run, so no edit followed it) and ran the apply check. Targeted delivery: green for the briefed check; batch Critic, Full Verify and PO acceptance stay pending.

## What the patch changes (increment over c16, c16-c2 and c16-c3; apply in that order)

- `lib/critic-course-admission.test.mjs`
  - import of `readConsumedCandidateResult`.
  - case `PF94 LINEAGE (g)` (CCA050): the correction candidate gets a produced and registered diagnostic (`produceCriticDiagnostic`, log copied under `specs/<id>/evidence/`, two `candidate-evidence` manifest entries, one registration commit) and the delta admission is read at that registration commit. Printed on the real code: `PF94 (g) registration: 46913bf4… admission after: {"status":"refused","code":"CCA-DELTA-REQUIRED"}` and the written record carries the open finding `{"id":"CRF-…-1","severity":"high","status":"open"}` with `verdict.status` `findings`.
  - new case `PF94 LINEAGE (h)` (CCA051): pins what the consumed receipt really carries (no key matching coverage, package, edge or complete; `reviewRange` equals the packet candidate range and diff hash; `reviewPass` false) and that the written coverage is bound to the receipt hash, the packet diff paths and `AC-1`.
- `lib/feature-package-registration.mjs` (`addCriticReviewLineage`, one hunk before the `edges` line): new typed refusal `FPR-LINEAGE-COVERAGE-CLAIM` when the consumed receipt's `reviewRange` (base, commit, diffSha256) differs from the packet candidate range and diff hash, with the repair text "rerun the round on the course path so the receipt covers the whole diff".

## Answer to the coverage question

The consumed receipt carries only: schema, packetId, packetDigest, session, candidate, reviewRange `{base, commit, diffSha256}`, rulesetSha, assurance, verdictSha256, findingCount, reviewPass. It carries no package, edge or coverage field, so the lineage coverage cannot be read from it and stays synthesized (one package over the whole packet diff, one edge `feature-delivery`, `complete` true). The compiler throws `CRL-V2-COVERAGE` when `coverage.complete` is false (`critic-review-lineage.mjs` line 431), so a not-complete lineage cannot be written at all. The synthesis claims "the round reviewed exactly the packet diff"; the receipt can contradict only through `reviewRange`, and that is now refused. A real Glossover round has the same receipt shape and would produce the same synthesized, receipt-hash-bound coverage. Gap: the new refusal has no test, because a tampered receipt fails the owner-store read as not consumed, so the fixture cannot reach it.

## Counts (logs under `scratch/agent-out/w7ci/logs`, all read)

- Patched clone, whole `critic-course-admission.test.mjs` (`cca.log`): tests 53, pass 53, fail 0.
- Baseline clone2 (candidate plus the three earlier patches), same file (`cca2.log`): tests 52, pass 51, fail 1, the failure being CCA050, the case this increment turns green. Failing-name sets: baseline {CCA050}, patched {}.
- `critic-review-lineage.test.mjs` (`lin.log`): tests 1, pass 1, fail 0 (14 inner checks). `critic-diagnostic-evidence.test.mjs` (`diag.log`): tests 12, pass 12, fail 0.
- The guard pin file `lib/pins/catalogue-admit-prescribed-lifecycle-verbs.test.mjs` was NOT re-run in this increment; it is untouched by c16-c3 and c16-c4 (c16-c2 left it at tests 23, pass 23, fail 0).
- Apply check: `git apply --check` of this patch in clone2 (candidate plus c16, c16-c2, c16-c3 applied) exit 0.

## Not done

Delta request writer (`--add-delta-request`, next slice), end-to-end pin of the path after the request, operator docs (SKILL.md, implementation-continuation.md), Verify registration (no new test file was added), Full Verify, independent Critic review (parent-owned batch gate), native Windows, the test of `FPR-LINEAGE-COVERAGE-CLAIM`.

## Proposed commit message

feat(critic): derive the lineage coverage claim from the consumed receipt range and prove a failing round asks for the delta request (PF-94)

## Operator flow

Apply the held patches in order c15 (independent), c16, c16-c2, c16-c3, c16-c4 at the candidate, `git add -u` with a path limit, one commit, stamp, install. `lib/guard/command-catalogue.mjs` is a protected-path hunk (in c16-c2), applied by the PO as operator.
