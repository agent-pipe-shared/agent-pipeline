# W7 recon PF-94: how a consumed Critic round becomes course history, and how the delta request is built

Slice W7-RECON-PF94-COURSE-CONTINUATION-C1-20261027. Candidate 906aabb021b7a02c877ae894d383ab6d8bac39b2. Notes only, no patch.
Evidence driver: scratch/agent-out/w7cg/driver.mjs (untracked, spawnSync, real clone at the candidate). Confidence tags: [run] printed by real code, [read] file and line read at the candidate, [infer] derived from reading, not run.

## Summary (ten lines)

1. The intended writers do not exist in production code. `compileRegisteredCriticReviewLineage`, `compileCriticReviewLineage`, `prepareRegisteredCriticDeltaRequest` and `prepareRegisteredCriticCourseAlias` have zero callers outside their own definitions and test files; the register-feature-package verbs are only `--add-review-unit` and `--add-diagnostic-evidence`. [run: rg over plugins harness scripts docs templates]
2. The course history is only read (retainedV2, critic-course-admission.mjs 378-404) and checked, never written, by any script. No command registers a lineage record; no command builds the delta request.
3. A round-1 lineage v2 record cannot be compiled from a round finalized with the caller-authored fallback: compileRegistered... needs an admitted course read of the round (line 420) and the consumed course claim binding (line 428-430), both written only on the course path (finalizer lines 232, 312). [read, infer]
4. Even with a claim, the compile call needs registrationCommit reachable from the round candidate through evidence-only commits (transport, lines 468-485). Glossover has 25 non-evidence commits since round 1, so the retroactive compile is refused (CCA-TRANSPORT-SOURCE-DRIFT, infer).
5. Genesis for a feature whose round 1 never entered the course: resolveRegisteredCriticCourseIdentity (437-455) with an empty history takes the genesis from the CURRENT request (base, candidate, tree), so courseKey is a new key and genesisRecordSha256 is null. [read]
6. CCA-REQUESTED-MODE is reproduced: registered feature without lineage, mode delta -> refused CCA-REQUESTED-MODE (line 570, history empty requires full). [run]
7. CGB-CONFLICT (preflight, mode full) comes from featureOwnership (critic-generic-batch.mjs 735-746): the logical work ids of the review unit are already indexed to the old batch, whose originTargets do not equal the new feature-course courseKey (or whose schema is not the V2 batch schema). [read]
8. Chicken and egg for the delta request: none. requestRead (522) reads the request at registrationCommit, but the request content does not contain the registration commit, so preparing at R0 and registering in a later evidence-only commit R1 is accepted. [infer; not run, no consumed journal fixture reachable]
9. Design: three sanctioned verbs (lineage compile+register, delta-request build+register, legacy seed) in register-feature-package.mjs, copied from addCriticDiagnosticEvidence; six slices, two PO decisions (section 4).
10. Not reached: a printed admitted delta (needs a consumed packet journal under .git/agent-pipeline/critic-packets with a course claim; no fixture builds one outside critic-generic-batch / session-critic-finalizer tests).

## 1. The intended flow (what exists, what is missing)

- Contract text: plugins/pipeline-core/skills/critic-review/SKILL.md line 14 states the batch course (one full review, up to three correction-diff reviews, lineage cannot be reset) and ends "Source/runtime registration and admission must bind to this contract before enforcement is claimed". It names no command that writes lineage or the delta request. [read]
- Rg for `critic-lineage`, `critic-delta-request`, `lineage record` in docs, skills, roles, harness, templates finds no operator procedure; only the archived state note about the lineage module and the Verify suite registration (harness/scripts/verify.mjs 595). [run]
- What exists: readers and derivers (readCriticCourseAdmission 594, readRegisteredCriticDeltaRequest 530, requestRead 522, retainedV2 378, resolveRegisteredCriticCourseIdentity 437) and the artifact builders (bindingArtifact in critic-review-lineage.mjs 411 returns path `specs/<feature>/evidence/critic-lineage-<sha>.json` plus the manifest entry shape; `artifact()` in critic-course-admission.mjs 595 for the delta request path `critic-delta-request-<sha>.json`). The builders return the manifest `registration` object but nothing writes the file or the manifest. [read]
- Callers of readCriticCourseAdmission in production: critic-dispatch-preflight.mjs 357, controlled-method-dispatch-observation.mjs 65, controlled-continuity-method-dispatch.mjs 106, critic-generic-batch.mjs 19 (admit/reserve). All are readers. [run]
- Course claim writer: session-critic-finalizer.mjs 232 and 312 (course path only), published through critic-packet-preflight.mjs 692 publishClaimedSessionAdmission. This is the only production writer in the chain, and it records the claim, not the lineage record. [read]
- Intended order (reconstructed from the readers, not documented anywhere): finalize (course claim) -> export -> compileRegisteredCriticReviewLineage -> write `critic-lineage-<sha>.json` -> register in manifest as candidate-evidence in an evidence-only commit -> corrections -> prepareRegisteredCriticDeltaRequest at that registration commit -> write `critic-delta-request-<sha>.json` -> register in an evidence-only commit -> preflight delta. [infer]
- Verdict: the writers of steps 3-5 and 8-9 are missing from production code. Confidence high for the missing callers [run], medium for the reconstructed order [infer].

## 2. The Glossover state

- compileRegisteredCriticReviewLineage input (critic-review-lineage.mjs 418-447): courseRequest, packetId, reviewId, parentReviewId, packages, coverage, correction, invalidation. It requires (a) readCriticCourseAdmission(courseRequest).decision.status === admitted, (b) readConsumedCriticCourseResult for the packet (consumed journal), (c) readConsumedCourseClaimBinding whose courseSourceSha256 and courseDecisionSha256 equal the admission just read (CRL-V2-CLAIM-DRIFT otherwise), (d) coverage.receiptSha256 equal the consumed receipt. [read]
- compileCriticReviewLineage (293-380) is the v1 synthetic compiler: it takes any packet plus a typed reviewAttempt and a lane the caller supplies. It is what every test fixture uses; v1 records are readable by retainedV2 but then consumedHistory (486-488) demands a consumed course journal for each record's packet (readConsumedCriticCourseResult with expectedRecord). So a hand-built v1 record does not seed a course either. [run: scenario (b) below]
- Caller-authored fallback (finalizer originGate 105-112, independence `caller-authored-fallback`, nativeAttestation false): it passes the finalizer but is not a source-issued origin. Whether the course journal and claim exist for such a round depends on whether the older build took the course path; the consumer says it did not. Without the claim, (c) fails and the round cannot be a lineage record, a genesis or a delta parent. [read, infer; the owner-store of Glossover itself was not inspected]
- Genesis for a feature with no consumed course round: see summary 5. courseKey = sha256Canonical of {repositoryFingerprint, originalFeatureId, manifestPath, originalManifestSha256 (manifest at the genesis base), genesisCandidate {base, commit, tree}}. With an empty history the genesis candidate is the current request's, so a later preflight in mode full computes a different courseKey than the old batch registered for the same logical work ids. [read]
- CGB-CONFLICT: see summary 7. Exact conflicting entry: indexPath(c,"logical",id) of each work id in the review unit exists and its batchRef points to the round-1 batch; registration(c, batchRef).originTargets is not `[{kind:"feature-course",courseKey:<new key>}]` or the registration schema is the older one. Produced in runtimeCompose line 563 (assertFeatureCriticReviewUnitOwnership) before any mode check. [read]
- CCA-REQUESTED-MODE (line 570): `!pass && (history.length ? requestedMode !== "delta" : requestedMode !== "full")`. With no registered history only `full` passes; with history only `delta`. Glossover: with the placeholder delta path and no history the mode is refused. [run for the no-history branch]

Printed runs (real code in the clone, TMPDIR fixtures, 2026-10-28):

```
(a) NO-LINEAGE feature mode=full  {"status":"refused","code":"CCA-REVIEW-UNIT-REQUIRED"}
(a) NO-LINEAGE feature mode=delta {"status":"refused","code":"CCA-REQUESTED-MODE"}
(b) ONE registered v1 lineage, no consumed journal mode=delta {"status":"unavailable","code":"CVL-COURSE-JOURNAL-UNAVAILABLE"}
(b) ONE registered v1 lineage, no consumed journal mode=full  {"status":"unavailable","code":"CVL-COURSE-JOURNAL-UNAVAILABLE"}
(c) prepareRegisteredCriticDeltaRequest on (b): {"ok":false,"status":"unavailable","code":"CVL-COURSE-JOURNAL-UNAVAILABLE"}
(d) compileRegisteredCriticReviewLineage on no-lineage feature: {"ok":false,"status":"refused","code":"CCA-REVIEW-UNIT-REQUIRED"}
```

## 3. Reproduction and commit order

- (a) done [run]: the fixture has no review unit, so full stops at CCA-REVIEW-UNIT-REQUIRED (a fixture limit, the order of checks is line 587 after the mode check); delta shows CCA-REQUESTED-MODE.
- (b) as briefed (CCA-DELTA-REQUIRED) NOT reached: with a registered lineage record the reader needs the consumed packet journal first (CVL-COURSE-JOURNAL-UNAVAILABLE, same as existing test CCA16 at critic-course-admission.test.mjs 379). Building a consumed journal requires driving prepareCandidatePacket, claim, session finalization and export in the owner store (the pattern of critic-generic-batch.test.mjs 291-334 and session-critic-finalizer.test.mjs 1064). That exceeds the 40-call budget. Not run.
- (c) not run for the same reason.
- Commit order, from the code [infer, medium confidence]: R0 = commit that registers the lineage record (manifest changes, only candidate-evidence added, exact changed set manifest+added: evidenceCommitV2 458-467). Corrections follow (non-evidence commits). The delta request is prepared with registrationCommit = any commit where the lineage is registered, candidate = the corrected head. The request carries no registration commit field (descriptor keys at 599), only historySha256, parent projection, candidate, changedPaths, deterministicEvidence entries. requestRead (522-529) reads it at the registrationCommit of the LATER preflight, so registering it in a later evidence-only commit R1 is accepted provided: transport(candidate -> R1) sees only evidence-only commits, historySha256 unchanged, and the diagnostic evidence entries equal. No chicken and egg. The request path embeds its own digest (525), so the artifact name is stable.
- Constraint found: the lineage compile for a round needs registrationCommit reachable from the round candidate by evidence-only commits only. Registration of round N therefore must happen BEFORE the next correction commit lands. Retroactive registration after corrections is refused (transport 483). [infer]

## 4. Design (smallest sanctioned set)

Put the verbs into register-feature-package.mjs (same file, same exit codes as `--add-diagnostic-evidence`, D165-CDR; copy `addCriticDiagnosticEvidence` in feature-package-registration.mjs and its readAcceptedDeliveryContract wiring).

1. `--add-review-lineage --packet <packetId>`: derives featureId from the manifest under --root, registrationCommit = HEAD, candidate/base from the consumed packet, parentReviewId from the registered history tail, packages/coverage from the consumed packet and the review unit; calls compileRegisteredCriticReviewLineage; writes `critic-lineage-<sha>.json`, adds the manifest entry from `artifact.registration`, prints the path to commit and the commit message hint. Refuses unless HEAD..candidate is evidence-only.
2. `--add-delta-request <input.json>`: input is only changedBehaviorClaims, pathInvariantMap, coordinatorImpactConfirmed, trustBoundaryChanged, impactAmbiguous; baseCommit = parent candidate, candidateCommit = HEAD or `--candidate`, registrationCommit = HEAD, acceptedReference from the manifest; calls prepareRegisteredCriticDeltaRequest; writes and registers; prints path.
3. `--seed-legacy-round` (only if PO decision 1 allows it): a distinct record kind, never mistaken for a v2 lineage.

Slices (effort; tool calls each 40 at most), in order:
- S1 (M) feature-package-registration.mjs: shared helper "write immutable evidence + register entry" extracted from the diagnostic verb; tests: same cases as D165-CDR plus idempotent replay.
- S2 (M) register-feature-package.mjs `--add-review-lineage`: wrapper + help text; tests with a consumed-journal fixture (the finalizer test fixtures) and an UPGRADE fixture (round finalized by the previous build: no claim -> typed refusal, no write).
- S3 (M) `--add-delta-request`: wrapper; tests: R0/R1 ordering, foreign request, no correction commits (CCA-CORRECTION-RANGE), budget exhausted (CCA-REVIEW-BUDGET-EXHAUSTED).
- S4 (L) end-to-end pin: preflight -> admit round 2 -> finalize -> export -> next delta; one test file added to Verify suite list.
- S5 (S) docs: SKILL.md and implementation-continuation.md operator sequence; operating-tools entry.
- S6 (L, only after the PO decision) legacy seed or generic-batch release for the old batch so CGB-CONFLICT clears.
Test against the REAL state (a consumed round of a registered feature) and the UPGRADE state (a round finalized by the previous build) in S2/S3; not only state built by the new code.

PO decisions needed:
1. May a round finalized with the caller-authored fallback seed a course (legacy seed, weaker marker), or must round 1 be re-run on the course path? A rerun also needs the old batch index released (CGB-CONFLICT, CGB-BUDGET) and spends one of the four Critic calls.
2. For a feature with corrections already past round 1 (Glossover, 25 commits): accept a rerun as a fresh full genesis at the current candidate, or allow a lineage commit placed after non-evidence commits (needs transport relaxed - a guard/contract change).

## 5. Not reached / confidence

- No printed admitted delta, no CCA-DELTA-REQUIRED; no test case added (briefing's "new cases" belong to a patch; none was produced, critic-course-admission.test.mjs is unchanged).
- Glossover's owner store and manifest were not inspected; consumer facts remain relayed.
- readConsumedCriticCourseResult and readConsumedCourseClaimBinding (critic-verify-lifecycle.mjs) were not read in full; claim 3 (fallback round has no claim) rests on the finalizer lines and the consumer statement.
- Targeted checks of the briefing (RED/GREEN, baseline vs patched failing sets, apply check in clone2) were not run: there is no patch.
