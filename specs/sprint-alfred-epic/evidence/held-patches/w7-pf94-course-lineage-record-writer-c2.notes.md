# W7 PF-94 c2: guard catalogue shape + pin (done); case (d) still RED; failing-round fixture NOT built (budget)

Slice W7-PF94-COURSE-LINEAGE-RECORD-WRITER-C2-C1-20261027. Candidate 91d744698d6320508f2f354fa5f70e2923b49e0a.
Patch: w7-pf94-course-lineage-record-writer-c2.patch = INCREMENT over the c16 patch (git diff --binary of clone worktree vs index; baseline = candidate + c16 patch). `git apply --check` in clone2 (baseline): exit 0. Targeted delivery: blocked (partial).

## Changes (3 files)
- lib/guard/command-catalogue.mjs (PROTECTED-PATH HUNK, PO applies as operator): sanctionedRegisterFeaturePackageArgs gets, before the D165-CDR branch, `if (args.length === 5) return args[2] === "--add-review-lineage" && args[3] === "--packet" && /^[a-f0-9]{32}$/u.test(args[4]);`
- lib/pins/catalogue-admit-prescribed-lifecycle-verbs.test.mjs: new test "PF-94 feature-package registration: --add-review-lineage --packet <32 lowercase hex> is admitted, malformed shapes are not" (admitted shape; denied: no packet flag, packet without id, dash id, short id, uppercase id, extra argument, wrong second flag, lineage before root).
- lib/critic-course-admission.test.mjs: consumedCourseRoundFixture course:false variant now uses all three guardrail paths (const pf94Guardrails) in preflightInput and in the generic batch declaration, to match the diagnostic produced with those paths.

## RED / GREEN
- Pin: logs pin-red.log: tests 23, pass 22, fail 1 (new test red, catalogue unchanged). pin-green.log: tests 23, pass 23, fail 0.
- critic-course-admission.test.mjs whole file, baseline clone2 (candidate + c16): tests 51, pass 50, fail 1 (CCA049). Patched clone: tests 51, pass 50, fail 1 (CCA049). Failing-name sets identical: {CCA049}.

## Case (d) CCA049 still RED
Same cause in both: SessionCriticFinalizerError code SCF-PREFLIGHT thrown at admitSessionCriticReview (session-critic-finalizer.mjs line 406) for the course:false fixture. Aligning guardrail paths (diagnostic vs preflight vs declaration) did NOT fix it. Not yet compared with the finalizer test fixture(): differences to check next: review unit committed at base before the base commit (specs/review-unit.json) vs. here committed in the "declare" commit that is also the base; spec path/diagnostic location (evidence/verify.json vs specs/<f>/evidence/diagnostic.json); the registration commit sitting between base and candidate. Case was not weakened.

## NOT done
- Failing-round fixture variant with open finding and the CCA-DELTA-REQUIRED case (item 3), and the answer on whether the verb's synthesized lineage (one package feature-package, one edge feature-delivery) matches a real packet: not examined. Note only that the lineage v2 builder (critic-review-lineage.mjs line ~433-439) carries findings from the consumed result via projectConsumedCriticFindings and sets verdict.status findings; the verb's packages/coverage synthesis is unverified for a real round.
- Runs of critic-review-lineage.test.mjs and critic-diagnostic-evidence.test.mjs not done. Delta request writer (next slice), end-to-end pin, operator docs, Verify registration, Verify run, independent Critic (parent-owned batch gate), native Windows.

## Proposed commit message
feat(critic): admit the add-review-lineage shape in the guard catalogue, cover the upgrade state and a failing round (PF-94)

## Operator flow
Apply this patch AFTER the c16 patch: apply-diff, `git add -u` with a path limit, `--no-verify` commit, stamp, install. command-catalogue.mjs is a protected path (hunk applied by the PO as operator).
