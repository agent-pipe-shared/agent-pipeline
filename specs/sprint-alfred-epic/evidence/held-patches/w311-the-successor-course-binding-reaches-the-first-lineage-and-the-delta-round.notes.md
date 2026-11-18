# w311 — the sealed successor binding of a consumed review reaches the first lineage and the replayed finalize (candidate 31, lane L20)

Delta on the base clone of candidate 31 (apply the base clone first, then this patch; it does not apply to the real checkout alone). The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: this change is verified by the tests named below only. Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

**STATUS: checkpoint. One line outside the write list is needed (section "Outside the write list"). Without it the lineage cases below stay red; with it every named suite is green.**

## 1. Recon (first, as the briefing asked)

- **Where the successor is sealed.** A consumed packet stores only the digests `courseSourceSha256` and `courseDecisionSha256` of its admission (`session-admission.json`, read by `readConsumedCourseClaimBinding`). The predecessor is part of the course source (`courseIdentity.successor`), so it is sealed by digest, not stored as a field. The finalization request (`review.courseContext.successorOf`) is not kept in the owner store. No new stored field is needed: each feature the State records as discarded can be tried as `successorOf`, and exactly the one whose admission reproduces both sealed digests is the sealed predecessor.
- **Where it is dropped (three places).**
  1. `addCriticReviewLineage` (`lib/feature-package-registration.mjs`, `identityInput`): no `successorOf`, so `resolveRegisteredCriticCourseIdentity` reads the manifest at the historical base (missing) and fails `CCA-MANIFEST-READ` (`critic-course-admission.mjs`, the successor base is rebuilt only from a given `successorOf` or a registered binding).
  2. `compileRegisteredCriticReviewLineage` (`lib/critic-review-lineage.mjs`, line `const resolved=resolveRegisteredCriticCourseIdentity(Object.fromEntries([...6 keys...]))`): the fixed key list drops `successorOf` even when the course request carries it. **This file is outside the write list.**
  3. The delta request and the later rounds do not drop it: once the first lineage is registered the course binding recovers the successor (`recoverSuccessor`), and `addCriticDeltaRequest` already leaves the State's discarded features out and honours `--feature` (30j13). Case C31-L20-2 pins this; no delta-path edit was needed. The premise "features.length === 1 gives FPR-DELTA-FEATURE" holds only without the State's discard record; the consumer case has that record (admission through `--successor-of` requires it), so no loosening was made (J13-4 keeps its no-State refusal).
- **Feature choice.** `--feature` (30k) is checked against the course claim; the auto-registration at finalize (`writeCriticRoundLineage`) calls `addCriticReviewLineage({ root, packetId })` without a selector and therefore also failed (`FPR-LINEAGE-FEATURE-AMBIGUOUS`: the predecessor refuses `FPR-LINEAGE-TRANSPORT`, the successor `FPR-LINEAGE-COMPILE`). With the sealed derivation both paths choose the successor.
- **Idempotent second readback (item 4), cause.** `finalizeSessionCriticReview` reads the claimed-phase prelaunch admission (`inspectClaimedSessionAdmission` -> `revalidateCandidate` -> `observeCheckout`: `git status` inside the packet's disposable checkout). The first finalize removes that checkout after the consume (`cleanupCandidatePacket`), so `git status` fails: `CPP-GIT` ("Git status failed"), reported as `SCF-PRELAUNCH-ADMISSION`. This is not specific to successors: the ordinary course fails the same way (case C31-L20-5, red before the change). The claimed-phase check would fail for a consumed packet anyway.

## 2. What changed (patch)

- `lib/critic-course-admission.mjs`: new export `deriveSealedSuccessorOf({ repoRoot, featureId, baseCommit, candidateCommit, registrationCommit, packetId })`. Pure derivation: null for an ordinary course (manifest readable at the base), a malformed request, an unreadable or missing consumed packet, or no sealed match; otherwise the one State-discarded feature whose admission (`successorOf` = that id) reproduces BOTH sealed digests. Nothing stored, no flag, no record shape or digest change.
- `lib/feature-package-registration.mjs` (`addCriticReviewLineage`): when the resolution fails with `CCA-MANIFEST-READ`, take `successorOf` from `deriveSealedSuccessorOf` (never from a caller value) and resolve again with it; the course request that is compiled carries it. The `CCA-MANIFEST-READ` refusal (resolve and compile) now names the successor cause, the State record it needs (`discardedFeatures`) and the runnable command (`register-feature-package.mjs --root <root> --add-review-lineage --packet <id> --feature <feature id>`). Texts of every other code are byte-identical.
- `scripts/session-critic-finalizer.mjs`: `consumedReplayFor`. When the claimed-phase read fails, the identical finalize request is answered from the consumed journal (same `completed` shape, the stored receipt, the idempotent lineage write) but only when the consumed packet binds exactly this request (candidate range, task, project, session, verdict digest). Anything else, and a request with an event output, keeps the original refusal.
- Tests (existing registered files): `register-feature-package-readback.test.mjs` C31-L20-1 to 5 (fixture option `viaSuccessorOf`: preserved discarded predecessor, successor manifest with `supersedes: null`, first review base before that manifest, admission through `--successor-of`, real finalizer consume): lineage written at finalize and registered by the verb after a handover commit, repeat is `already-registered` with the manifest bytes unchanged, base unchanged, predecessor tree untouched; delta request without a selector; negative: a State that no longer records the sealed predecessor refuses `FPR-LINEAGE-COMPILE`/`CCA-MANIFEST-READ` with the new text and writes nothing, restoring the record registers; two discarded features: the sealed one is chosen by digest; replay of the finalize. `critic-course-admission.test.mjs`: one case for the null answers of the derivation.

## 3. Outside the write list (needed, one line)

`plugins/pipeline-core/lib/critic-review-lineage.mjs`, `compileRegisteredCriticReviewLineage`: the second `resolveRegisteredCriticCourseIdentity` call must pass `successorOf` the way `runtimeCompose` already does:

```
...'registrationCommit','acceptedReference',...(Object.hasOwn(input.courseRequest,'successorOf')?['successorOf']:[])].map(k=>[k,input.courseRequest[k]])
```

It was applied only temporarily in the clone to measure the green state and is NOT in the patch (a patch touching that file would fail the scope check). Without it: C31-L20-1, 2, 4 and the closing step of 3 stay red (`compileCode` stays `CCA-MANIFEST-READ`); C31-L20-5 and the first part of 3 are green. A resolver that recovers the successor on its own was rejected: it would change what a flag-less admission resolves (an admission rule).

## 4. Not changed / not proven

- No admission rule, review cap, Critic verdict semantics, gate, signature, record shape or digest byte changed. `register-feature-package.mjs` and `session-critic-finalizer.test.mjs` untouched (the replay case lives in the readback file next to the real-finalizer fixture).
- A replay with an event output (`--event-out`) is not answered from the consumed state (the first finalize owns that file); not covered.
- The evidence-only commit between consume and lineage is a handover commit in the fixture; the tracked export commit of a consumed review is not proven separately.
- Delta: no production change (see recon 3); the delta case runs with the State passed, as the verb does.
- The Critic and the Full Verify are suspended and were not run.
