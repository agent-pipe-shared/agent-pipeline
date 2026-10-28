# W7 PF-94 c16: lineage writer (register-feature-package --add-review-lineage) - PARTIAL PATCH, ONE CASE RED, GUARD SHAPE NOT DONE

Slice W7-PF94-COURSE-LINEAGE-RECORD-WRITER-C16-C1-20261027. Candidate e8228d952d9fe5605f45568b1d932f0cf3edd387.
Patch: w7-pf94-course-lineage-record-writer-c16.patch (git diff --binary from a scratch clone; `git apply --check` in clone2 at the candidate: exit 0). Targeted delivery: blocked (partial).

## What the patch changes (4 files)
- lib/feature-package-registration.mjs: new export addCriticReviewLineage({root, packetId, readAcceptedDeliveryContract}). Derives the feature (the single specs/<id> with lifecycle.json plus review unit), registrationCommit = HEAD, candidate/base from the consumed packet (readConsumedCandidateResult), parent from the registered history tail, packages/coverage from the packet and the review unit (one package "feature-package", one edge "feature-delivery", receiptSha256 = sha256Canonical(receipt)), calls compileRegisteredCriticReviewLineage, writes critic-lineage-<sha>.json (wx), adds artifact.registration to the manifest (atomic temp+rename, validate, restore, envelope re-read: copy of the diagnostic writer). Replay: a registered lineage whose consumedResult.packetId matches returns already-registered with the same path before compile. Refusals: FPR-ARGS, FPR-LINEAGE-NOT-CONSUMED, FPR-LINEAGE-NO-COURSE-CLAIM (repair text names inspect-course-takeover, supersede-course-takeover and a rerun of round 1 on the course path), FPR-LINEAGE-FEATURE-AMBIGUOUS, FPR-LINEAGE-TRANSPORT (text: register before the next correction commit), FPR-LINEAGE-COMPILE (with compileCode).
- scripts/register-feature-package.mjs: CLI shape `--root <r> --add-review-lineage --packet <32 hex>`, branch, help text (same route text style).
- lib/critic-course-admission.test.mjs: exported helper consumedCourseRoundFixture({course}) (real fixture: featureCourseFixture steps with a valid approved topology manifest, admitSessionCriticReview, finalizeSessionCriticReview with a source-return stub) and cases CCA046-CCA051 "PF94 LINEAGE (a)-(f)".
- (the other briefed files, guard/command-catalogue.mjs and the pin, are NOT in the patch, see below)

## RED / GREEN (clone, whole file critic-course-admission.test.mjs)
- RED before production edit: log scratch/agent-out/w7ci/logs/red.log (exit 1: the new import addCriticReviewLineage did not exist, whole file red).
- GREEN after: logs/green3.log: tests 51, pass 50, fail 1. Green: CCA046 (a) register then next admission, CCA047 (b) replay, CCA048 (c) not consumed, CCA050 (e) transport, CCA051 (f) CLI shape; CCA001-CCA045 unchanged green.
- Printed course admission: before registration full -> RE-FIRST-FULL, delta -> CCA-REQUESTED-MODE; after registering and committing the lineage, delta -> RE-CONSUMED-PACKAGE-PASS. Deviation from the briefing: the briefing expected CCA-DELTA-REQUIRED, but the fixture round PASSED, so the course stops; CCA-DELTA-REQUIRED needs a fixture round with findings (not built: verdict finding shape not read). The case asserts the history is read (not CCA-REQUESTED-MODE) and RE-CONSUMED-PACKAGE-PASS.
- RED remaining: CCA049 (d) upgrade-state no-claim case. The fixture with course:false throws SessionCriticFinalizerError at admitSessionCriticReview (session-critic-finalizer.mjs line 406, generic batch request shape; probably the non-course request needs fields the finalizer test `registered()` passes: guardrailPaths/evidence set for the generic batch, or a batch ref that matches the declaration). The refusal path itself (FPR-LINEAGE-NO-COURSE-CLAIM) is reached by two routes in the code (no feature, or readConsumedCourseClaimBinding not ok) but is NOT proven by a passing case.
- Baseline (clone2) whole-file run was NOT done; only the unmodified-file RED run of the clone preceded the edits. Failing-name sets baseline vs patched: not compared.

## Path walk after registration (STEP 3, from code, not run beyond case (a))
The verb's output files are committed in one evidence-only commit R (manifest + critic-lineage file). Case (a) shows that reading the admission at registrationCommit = R sees the history (no CCA-REQUESTED-MODE). Corrections after R are non-evidence commits; the next delta request must be prepared against R (sibling slice). Registering after a correction commit is refused FPR-LINEAGE-TRANSPORT (case (e) green).

## NOT done
- STEP 4 runs of critic-review-lineage.test.mjs, critic-diagnostic-evidence.test.mjs, the pin file; clone2 baseline run.
- GUARD CATALOGUE: lib/guard/command-catalogue.mjs sanctionedRegisterFeaturePackageArgs (lines 205-214) still denies the new shape in a consumer repository. Needed hunk (protected path, PO applies as operator): add `if (args.length === 5) return args[2] === "--add-review-lineage" && args[3] === "--packet" && /^[a-f0-9]{32}$/u.test(args[4]);` before the 4-arg diagnostic branch (adjust the final `return args.length === 4 && ...`), plus pin cases in lib/pins/catalogue-admit-prescribed-lifecycle-verbs.test.mjs next to lines 470-474 and 581-594 (admit the new shape, deny missing/dash/short packet id).
- Case (d) fixture repair, delta request writer (next slice), end-to-end pin, operator docs, Verify registration, Verify run, independent Critic (parent-owned batch gate), native Windows. The help-text/usage-string existing pins (D165-CDR (g)) passed in the whole-file run.

## Proposed commit message
feat(critic): register the lineage record of a consumed course round with register-feature-package --add-review-lineage (PF-94)

## Operator flow
apply-diff the patch, `git add -u` with a path limit, `--no-verify` commit, stamp, install; classification: guard/command-catalogue.mjs would be a protected-path hunk (not in this patch).
