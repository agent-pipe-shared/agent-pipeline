# W9 slice 1 (D223): the Critic finalizer writes the lineage when a round finishes; the commit path refuses a correction commit while it is missing

Status: CHECKPOINT (targeted delivery: not yet green end to end). Patch: `w9-critic-lineage-written-when-a-round-finishes-and-guarded.patch`
(built in a prepared clone against candidate 586d6a0ffde26abc649877b4e25d11edd8750a8d; apply-check recorded below). Nothing is committed, nothing staged.

## The chain, step by step (added to the registered pin `plugins/pipeline-core/lib/pins/critic-course-consumer-chain-walk.test.mjs`)

One temporary consumer repository (own `git init`, gitignored project State, real registration route), real entry points in order:

1. Round 1, full review with findings: preflight -> admission -> `finalizeSessionCriticReview` (consumes the round). The finalizer itself writes the manifest and the
   lineage file into the working tree and returns them in `lineage` (`status: "written"`, `commitPaths`, `commitInstruction`). No `register-feature-package` call.
   Asserted: files in the tree, nothing staged.
2. The explicit `addCriticReviewLineage` call that the old walk made here (and that asserted `lineage-added`) is now an idempotent replay: `already-registered`.
   This RESTATES the old assertion (same intent: the lineage of the round is registered); it is the only change to an existing step. All eight existing PATH A/B/C cases go through it.
3. Commit manifest and lineage. 4. Correction commit: its staged index goes through `checkCriticLineageBeforeCommit` (the predicate the commit-msg hook calls); asserted `allow`/`lineage-registered`.
5. Round 2 delta: preflight accepts it as a delta of the course (`fallbackFull` false, review base = round 1 candidate); finalizer -> lineage in the tree -> commit -> correction -> round 3 (PASS) -> finalizer -> lineage -> commit.
6. Idempotency through the helper (`writeCriticRoundLineage` second call: `already-registered`, `git status --porcelain` unchanged; the finalizer itself cannot be re-run: SCF-FIRST-CONSUME-REPLAY).
7. Addendum writer -> `close-coordinator` plan-start, checkpointed, plan-transition `feature-close-prepared` -> applied, with the registered chain covering all three rounds
   (`resolveRetainedCriticCourseRecords(...).history.length === 3`).

Deviation named: the walk stops at `feature-close-prepared`, the step that reads the registered chain, like the other PATH cases; `closed-local` additionally needs cleanup and final-verify evidence that has nothing to do with the Critic course.

Negative variants (exact typed codes):
- (1) correction commit before the lineage is committed -> `CRL-LINEAGE-UNREGISTERED` with the repair text (register command, the two paths, the takeover pointer); index with the manifest but without the lineage file stays refused.
- (1b) round whose lineage was never written (tree as an older build leaves it) -> same code, repair names `register-feature-package.mjs --root <root> --add-review-lineage --packet <id>`; running that CLI clears the guard.
- (2) the same commit carrying manifest + lineage file -> `allow` / `registration-commit`; afterwards `lineage-registered`.
- (3) repository without any Critic course (unborn HEAD -> `not-decidable`; no review unit -> `no-critic-course`; not a repository -> allow; course without consumed round -> `no-consumed-round`) commits freely.
- (4) lineage write refusal: the feature manifest is absent from the working tree when the round finishes -> finalize still returns `completed` with `lineage: {status:"not-written", code:"FPR-LINEAGE-NO-COURSE-CLAIM", detail}`;
  the real `session-critic-finalizer.mjs export` CLI exports receipt/report/index and returns the same code in `lineage` and keeps the takeover pointer in `next`; the consumed receipt is intact; after the manifest is back the write succeeds.
- REAL HOOK case: installs the real commit-msg hook (frozen plugin copy, enrolled governance, `commitTrailerPolicy: "off"`) into the fixture repository; a real `git commit` of a correction is refused (exit 1, stderr names `CRL-LINEAGE-UNREGISTERED` and the lineage file); the same commit carrying the registered paths succeeds; a further correction succeeds.

Seams (named, not hidden): the Critic model call (fixed verdict + source-return origin function), the PO residual acceptance (chat mode), the Critic's own dispatch record, no native host run, no real signature.

## Red first
Run against the unmodified production code (`red.*.log`): 14 of 14 red. The eight existing cases fail at the restated step (`finalized.lineage` undefined: "the finalizer writes the lineage of r1"), the six new ones at
`registration.checkCriticLineageBeforeCommit is not a function` or the missing `lineage` field. The REAL HOOK case was added after that run (it needs the production adapter), so its red against the old code is the unavailable guard (still to be recorded by the revert proof).

## Production files changed and why
- `plugins/pipeline-core/scripts/session-critic-finalizer.mjs`: new export `writeCriticRoundLineage({root, packetId}, deps)` wraps `addCriticReviewLineage` (the function the CLI calls; nothing duplicated), never throws, never stages/commits, maps the outcome to `lineage`
  (`written` | `already-registered` | `not-written` + code + detail). `finalizeSessionCriticReview` adds `lineage` to the `completed` result (and to `source-complete/event-unavailable`) AFTER the packet cleanup; `exportSessionCriticEvidence` adds `lineage` after the evidence is on disk and
  replaces `next`: written / already-registered texts say what was written and what to commit; the old text (takeover pointer included) is kept only for `not-written`. The comment "the export route never runs git" is reworded (the lineage write after the export needs git and degrades to `not-written` when git is absent).
- `plugins/pipeline-core/lib/feature-package-registration.mjs`: (a) `addCriticReviewLineage` gets `dryRun` (same derivation, returns `lineage-registrable`, writes nothing); (b) new `checkCriticLineageBeforeCommit({root})` (the one core predicate); (c) the eager `REVIEW_UNIT_CRITERION` regexp is built at first use. (c) is an import-cycle fix forced by (the finalizer importing this module): entered through `critic-accepted-contract` the module hit `ReferenceError: Cannot access 'CRITERION_ID_SOURCE' before initialization`.
- `plugins/pipeline-core/scripts/commit-msg-hook-install.mjs`: the generated hook impl calls the predicate (thin adapter) after the staged-lifecycle check. A cheap `git ls-tree` pre-check (a review unit at HEAD) avoids loading the module in repositories without a Critic course; any error falls OPEN.
- Tests: the walk pin (above); `session-critic-finalizer.test.mjs` PF94 export (1): the pinned key list gains `lineage` (restated, intent unchanged; added assertion that the course-less fixture yields `not-written` with an `FPR-` code).

## Guard placement (and what stays unchanged)
The commit-msg hook is the Git boundary every runner's `git commit` reaches (Claude, Codex, Antigravity, humans), already has the repository root and the staged index, and is the smallest place: one predicate in a lib, one adapter.
`plugins/pipeline-core/hooks/git-dangerous-policy.mjs` is DELIBERATELY UNCHANGED: it is a string-only command matcher with no repository access; its callers (`hooks/guard-git.mjs`, `hooks/hook-governance-admission.mjs`, `lib/guard-maintenance-window.mjs`) are outside the write scope.
`plugins/pipeline-core/scripts/register-feature-package.mjs` is unchanged (it keeps calling `addCriticReviewLineage` with `readAcceptedDeliveryContract`). No change under Guard Maintenance Window beyond `commit-msg-hook-install.mjs` (protected installer) is needed.

Predicate (D223): refuse iff (a) HEAD carries exactly one feature course with a Critic review unit (the committed registration stands in for "active feature with a Critic required": the project State is gitignored in a consumer), (b) one of the 8 most recently modified consumed packets in the git-common-dir owner store has no lineage row at HEAD and none in the staged index,
AND its lineage can still be registered (`addCriticReviewLineage({dryRun:true})` is `lineage-registrable`, or `already-registered` in the working tree = written but uncommitted), (c) the index does not carry the manifest and the lineage file of that packet. Everything unreadable -> allow (`not-decidable`).
DESIGN DECISION: a round whose lineage can no longer compile (a correction commit already followed: history older than this guard) is allowed (`not-registrable`); refusing it would name a repair that is itself refused and would deadlock the repository. The refusal text carries the takeover pointer for that case.

## Deviations / honest limits
- The finalizer calls `addCriticReviewLineage` WITHOUT `readAcceptedDeliveryContract` (the CLI passes it from `pipeline-state.mjs`, which the finalizer cannot import without a cycle and a very large dependency). Consequence: the `FPR-REGISTRATION-NOT-RESOLVED` envelope re-read (restore + refuse when the envelope reader rejects the amended manifest) does not run on the finalizer route; the manual CLI route still has it.
- Hook prerequisites: the installed hook only runs in an enrolled governance scope (`admitPipelineScope`), and only where the hook is installed; a consumer without the hook has no commit-path guard (the finalizer's automatic write still removes the usual cause).
- The lineage write by the finalizer is attempted for every finalized round; outside a course it returns `not-written` (typed) and changes nothing.

## Downstream sweep
- `critic-review` skill, section "Continuing a Critic course" (SKILL.md lines ~170, ~193, ~211) and `docs/state.md` still describe the manual `--add-review-lineage` step as the normal route: NEEDS a text change (now automatic by the finalizer, the manual command is the fallback). Not edited here.
- `lib/guard/command-catalogue.mjs`, `lib/critic-course-admission.mjs` (repair texts), `scripts/register-feature-package.mjs`: unaffected, the manual command stays valid.
- Consumers of the finalize result (rg `finalizeSessionCriticReview(`): `lib/critic-course-admission.test.mjs`, `lib/critic-generic-batch.test.mjs`, `lib/pins/close-coordinator-refuses-a-required-critic-without-evidence.test.mjs`, `scripts/close-coordinator-audit-lifecycle.test.mjs`, `scripts/verify-evidence-producer.test.mjs`, `scripts/session-critic-finalizer.test.mjs`: the result gained a `lineage` key; exact-key assertions would be red (clone-side runs listed below as pending).

## Verification state
Final state (completed by the Coordinator after the Goldfish checkpoints; logs in the scratch directory `scratch/agent-out/w12lin`, label in brackets):
- Walk RED against the unmodified code: 14/14 red (`red.*`). Walk GREEN in the clone including the REAL HOOK case: 15/15 (`c2`).
- Downstream finding by the Coordinator: the finalizer now registers the lineage itself, so existing cases that registered it by hand got `already-registered`. 24 cases of `lib/critic-course-admission.test.mjs` (CCA050..CCA081) and 3 of `scripts/critic-dispatch-preflight.test.mjs` (CDPF070..072, one shared helper `parentLineageFixture`) were RESTATED, intent unchanged: they assert the finalizer's own write first (`written`), then the explicit register call as an `already-registered` replay; the cases whose subject is the pre-finalizer state (CCA057, CCA062, CCA069..071, N23, the round-3 consumer shape of the preflight fixture) undo the finalizer's write in the tree and drive the unchanged manual route. Neither test file has a new or removed case; counts are unchanged (82 and 86).
- Clone vs baseline, failing-name sets identical (both empty): `critic-course-admission` 82/82 (`c5` vs `base1`), `critic-dispatch-preflight` 86/86 (`c6` vs `base1`). Clone only, all green: `session-critic-finalizer` 91/91, `close-coordinator` 38/38, `critic-generic-batch` 38/38, `critic-diagnostic-evidence` 18/18, `commit-msg-hook-install` 23/23, `commit-msg-hook-signed-integration` 9/9, `goldfish-commit-command-flow` 30/30, `check-verify-case-completion` 32/32 (pinned counts unchanged), pin `close-coordinator-refuses-a-required-critic-without-evidence` 20/20, `catalogue-admit-prescribed-lifecycle-verbs` 24/24 (`c3`, `c4`).
- Revert proof (production file reverted to the candidate, walk rerun, file restored byte-equal): `session-critic-finalizer.mjs` reverted: 13 of 15 walk cases red, including every W9 case (`revertone.fin.log`); `commit-msg-hook-install.mjs` reverted: exactly the REAL HOOK case red (`revertone.hook.log`); `feature-package-registration.mjs` reverted: the walk crashes at load (the finalizer imports the new export), exit 1 (`revertone.reg.log`), a valid red.
- Patch: seven files (the five of the first checkpoint plus the two restated tests), apply-check exit 0 against the baseline clone.
NOT verified: native Windows runs, a real consumer repository, a real model call, a real signature; `verify-evidence-producer` and `check-product-capability-inventory` were not run (the finalize-result consumers named in the sweep that were run are green). Full Verify, batch Critic and PO acceptance stay with the Coordinator.
