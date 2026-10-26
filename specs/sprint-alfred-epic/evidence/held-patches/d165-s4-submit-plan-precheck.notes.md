# D165 S4 held patch: submit-plan refuses a brownfield architecture hurdle before the PO signs

Patch: `d165-s4-submit-plan-precheck.patch` (git diff --binary against repository HEAD 0cb0c36bb). `git apply --check` passed in a fresh clone of that HEAD (exit 0). Criterion: AC-127, D4 of the brownfield-gate backlog item.

## Cause
Architecture entry readiness ran only in set-phase implementation (about 11075) and one other site (about 4497). A brownfield project with a missing/invalid map, open checkpoint debt, adoption requirement etc. could therefore submit and get a plan signed, and only then be refused. submit-plan never consulted readiness.

## Change (preimage line numbers)
- `plugins/pipeline-core/scripts/pipeline-state.mjs`: new constant `SUBMIT_PLAN_BROWNFIELD_ARCHITECTURE_CODES` (the ten brownfield codes) before `NEXT_TRANSITION_KEYS` (line 773); in `case 'submit-plan'`, `let submitDesignDraft = null;` assigned from the design-draft result (block at 11305); after it and before `planHandoffRefusal`, when `!(submitDesignDraft?.ok && submitDesignDraft.required === true)` the readiness seam (`deps.architectureEntryReadiness ?? inspectArchitectureEntryReadiness`, same deps shape as 11075-11084, taskScope = the authority plan path) is called once; a non-ready result whose code is in the set prints `Error: submit-plan blocked by <code>; <message>. Next action: <JSON nextAction>. No submission or signature request was recorded.` and returns 2 before any State write. Other codes (MATERIALIZATION-REQUIRED, DESIGN-PACKAGE-REQUIRED, PLAN-SURFACE-MISSING, DECISION-APPLICABILITY-BLOCKED, FITNESS-UNAVAILABLE, ...) do not refuse.
- `plugins/pipeline-core/scripts/pipeline-state.test.mjs`: new D165-S4 block after Scenario 4 (before the global-chat case, before the pre-existing abort); one-line addition to `planAuthorityFixture` deps.

## Preimage SHA-256 (HEAD)
- plugins/pipeline-core/scripts/pipeline-state.mjs: a2e4e03434c39a73f3d44d3bb56b7233fa365be860245afaa4a3b5f664e6e218
- plugins/pipeline-core/scripts/pipeline-state.test.mjs: 802e354b0052b8b6b1e35b54b13d2a838f7eb8fe9e73b2af92af062cace0685e

## Tests
New cases: table over the ten codes (exit 2, stderr names code and next action, State byte-identical, seam called once, taskScope = plan path); ready stub proceeds (0, one call); five non-listed codes do not refuse (0, one call); mini profile still runs the check and refuses.
Not covered: a `required:true` design draft skipping the check (no seam to inject `inspectArchitectureDesignDraft`, and no cheap scaffold); the skip is a one-line condition in code and is left for Critic/integration review.

- RED (label red, before production edit): pipeline-state.test.mjs exit 1, AssertionError at the first new case, `ARCHITECTURE-MAP-MISSING:` (result 0, expected 2).
- GREEN (label green): new cases pass (run proceeds past them); pipeline-state-inspect.test.mjs exit 0; guard-maintenance-window-kernel-closure.test.mjs `11 passed, 0 failed`.
- Pre-existing RED at HEAD, unchanged by this patch: pipeline-state.test.mjs aborts inside `prepareCalibrationArchitectureFixture` (AssertionError ARCHITECTURE-ADOPTION-MIGRATION-REQUIRED; line 2128 at HEAD, 2192 with the patch), so no case after it runs; push-init.test.mjs exit 1 (e.g. set-phase implementation refused ARCHITECTURE-MAP-MISSING; CBV-ROOT qualification unavailable; doc-reconciliation exitCode 2). The orchestrator must verify these with the earlier D165 held patches stacked.

## Changed existing fixture (justification)
`planAuthorityFixture` deps gained `architectureEntryReadiness: () => ({status:'ready', code:null, nextAction:null})`. All existing pre-abort submit-plan cases use this fixture, which has no architecture map; without the stub the new check would refuse them. No assertion of any existing case was changed, weakened, skipped or deleted. Cases after the abort could not be run; they use the same fixture, so they inherit the stub.

## Proposed commit message
`fix(state): refuse submit-plan on a brownfield architecture hurdle before the PO signs`

## Operator flow
apply the diff (`git apply`), `git add -u`, commit with `--no-verify`, stamp, install. Critic review remains a parent-owned batch gate; Full Verify is parent-owned.
