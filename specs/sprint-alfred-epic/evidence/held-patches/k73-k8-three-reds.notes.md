# K73-K8-THREE-REDS notes (clone scratch/clones/k73, base = main HEAD 512d5edf9)

Status: implementation complete in clone; independent Critic read, operator commit of the protected parts and PO acceptance pending. No clone commit was made (all three files are protected or protected-adjacent; clone tree is clean again).

Runner: scratch/k73-run.mjs (private TMPDIR under the home dir, outside every repo and /tmp). Logs: scratch/agent-out/k73-{ldl,gap,gap-green,agy,agy-green}.log.

## 1. lifecycle-denial-loop-guard.test.mjs (RC04C001) - class (b), real product defect, NOT repaired
- Baseline (alone): exit 1, 5 tests, 4 pass, 1 fail (RC04C001), ~10 s. Same as counted run.
- Failure: test line 55 `inspectionCount() === 2` ("matcher and telemetry share one inspection per guard call") sees 4 for two guard calls.
- Measured cause (probe scratch/k73-probe1.mjs, stack per inspection): each guard call inspects onboarding TWICE.
  1. `devPlanShellRefusalHit(...)` at lib/guard/evaluate.mjs:201 -> lib/guard/devplan-shell-lane.mjs:66 -> command-catalogue.mjs:512 `observedOnboardingCommandMatch`, called with the RAW `dependencies`.
  2. `evaluateAfterGrammarAdmission` -> command-catalogue.mjs:512 via the `consistent` memoizing wrapper built at evaluate.mjs:506-512, which is created AFTER the shell lanes ran, so it cannot share the first observation.
- History: devplan-shell-lane gained the observation in b41cae7e5 / 5710ea06d / 3b1649817 (draft-phase scratch script admission); the memo wrapper in evaluate.mjs (917674f20 extraction) predates it. Invariant "one inspection per guard call" (the case's own message) was broken; besides the test, it means the lane and the gate can read two different onboarding observations in one call.
- Smallest correct change (protected: lib/guard/evaluate.mjs): build the `consistent` wrapper at the top of evaluateLifecycleReadyGuardCore (before the shell lanes) and pass it as `dependencies` to devPlanShellRefusalHit and the other pre-506 consumers. NOT made, NOT measured: protected path, and an alternative exists (restate the case to 4 inspections) that would drop the single-observation guarantee; that is a design choice for the PO. Recommended: the code change, test unchanged.

## 2. guard-apply-patch.test.mjs - class (a), stale fixtures; protected repair prepared
- Baseline (alone): exit 1, ~244 s, 26 ok + 2 not ok, then the uncaught assertion at the second failing case (28 observed).
- Case 1 (test line 166, `runnerEnd > runnerStart`): the test slices guard-lifecycle-ready.mjs from `function runnerFromArgv(argv)` to the anchor `\nfunction pathInside`. `pathInside` left that file in the guard split (lib/guard/path-containment.mjs, 917674f20/d02409a8a); the next anchor after runnerFromArgv is `export function main(`. Repair: end anchor -> `"\nexport function main("`. Same function still extracted and executed at the spawn boundary; no assertion changed.
- Case 2 (test line 525): the fixture uses intake profile "feature" (line 255). Since 1bd1d7bf6 (2026-10-03, onboarding-v3.mjs:3678-3689, comment "Epic/feature approval belongs to the later complete v2 package") a feature/epic generated draft gets no early PO acknowledgement, so after authoring the explicit stop is the read-only `bootstrap-bind-plan` action (status stays `bootstrap-binding-required`), not `architecture-design-required`. The test was last touched 2026-09-29. Repair (QG-04, bounded): the four assertions on the architecture-design action are restated to the same-strength assertions on the current stop (kind command, argv[1] bootstrap-bind-plan, mutation false, requiresConfirmation false, kind != architecture-design-required); status != ready and every later denial assertion unchanged. Justification to cite: 1bd1d7bf6 + onboarding-v3.mjs comment; no assertion removed or skipped.
- RED 26 ok / 2 not ok -> GREEN: exit 0, 28 ok, 0 not ok, ~250 s (k73-gap-green.log).
- Patch: scratch/agent-out/k73-guard-apply-patch-protected.diff (`git apply --check` clean from main).
- Proposed commit message: `test(guard): follow the guard split anchor and the feature-profile bind stop in the apply-patch pins` + body naming 1bd1d7bf6 and the QG-04 restatement; trailers `AI-Assisted: true` / `Dispatch: K73-K8-THREE-REDS (goldfish)`.

## 3. antigravity-pretool-guard.test.mjs - class (a) for the two named cases; PARTIAL, file still red
- Baseline (alone): exit 2, ~118 s, 5 ok + 2 not ok, then adapter-uncaught AssertionError.
- Both named cases (398 "rejects invalid JSON", 406 "blocks chained commands") fail inside `readyLifecycleFixture` (line 222), not in their own claim. Cause: the fixture authors a mini-profile staging PRD without a `pipeline-architecture-design` block; onboarding-v3.mjs:3037-3049 (`collectPrdAcknowledgementAction`, greenfield seed) now stops with `architecture-design-required` / ARCHITECTURE-DESIGN-PACKAGE-REQUIRED before offering `bootstrap-acknowledge-chat-apply` (design package before the single PO approval, ADR-0085 area). Repair: fixture PRD gets a minimal closed architecture-design block (helper `agyArchitectureDesignBlock`, shape from lib/architecture-design.test.mjs `design()`); no assertion touched.
- Result with the repair (k73-agy-green.log): cases 6 and 7 now `ok`, and 54 cases are `ok` in a row; exit 1, ~440 s, 8 `not ok` that were previously hidden behind the fatal abort. They are separate causes, NOT repaired (budget):
  a. "native implementation dispatch is refused even when candidate-bound" (test line 760): guard answers DISPATCH-MODEL-MISSING (MP-29: tool-layer `model` parameter now required) instead of AGY-NATIVE-IMPLEMENTATION-CONSENT-UNAVAILABLE - fixture lacks a model.
  b. four Critic-envelope cases (lines 1049, 1097, 1115, 1234: `deny !== allow`): probable the same missing-model refusal (not verified).
  c. "GS-1 is liftable..." (846) and "signature guidance..." (863): the pipeline.user.yaml edit is now refused with HGO-NARROWER-USER-CONFIG-REFUSED (typed recovery: human edit committed to the repo, no signed override) and guard-devplan "lifecycle draft"; expectations (override available, emit-signature-digest guidance) are stale or need a PO decision on whether GS-1 is liftable - possible design question, not guessed.
  d. "scratch script inspection ..." (ENOENT mkdtemp under scratch/ in the clone): environment of the clone (no untracked `scratch/` dir inside it); expect green in the main checkout; not measured.
- Patch (partial, strictly improves the file: removes the fatal abort, +16 lines): scratch/agent-out/k73-antigravity-pretool-guard-protected.diff (`git apply --check` clean).
- Proposed commit message: `test(guard): give the Antigravity ready-lifecycle fixture its architecture design block` + body; same trailers. Suite is NOT green with it; items a-d remain for a follow-up dispatch.

## Other checks
- `node --test scratch/clones/k73/harness/scripts/check-consumer-safe-paths.test.mjs`: exit 0, 9/9 pass (no commit made under plugins/pipeline-core/).
- Note: `--test-name-pattern` does not filter guard-apply-patch / antigravity tests (custom `check()` runner); every run is the full file.
