# Held patch notes: reopen-design --dry-run (Phoenix slice b, c3) - INTERIM, budget-stopped, patch NOT built

Candidate f3faa73d7abfa20a31284d2f6d3354c3982b2f35. Targeted delivery: BLOCKED. No `.patch` file was produced; this note records the exact state.
`w7-phoenix-reopen-design-dry-run.patch` (and the c2 attempt) are superseded by this slice once it completes.

## State reached (scratch clones under `scratch/agent-out/w7qu/`, clone and clone2, both detached at the candidate)
- Clone carries, rebased cleanly to the candidate: (a) the `--dry-run` branch in `case "reopen-design"` of `plugins/pipeline-core/scripts/pipeline-state.mjs`
  (pure `reopenPlanDesign` on the observed state, no write, prints `pipeline.reopen-design-preview.v1`, exit 0);
  (b) guard admission in `plugins/pipeline-core/lib/guard/sanctioned-args-scripts.mjs` plus its pin row in `lib/guard/devplan-shell-sanctioned-recovery.test.mjs`.
- The DR block was removed from `pipeline-state.test.mjs` (that file is not in the patch).
- Four new cases were written in the clone's `pipeline-state-observer-conformance.test.mjs` (after the existing reopen-design case): preview leaves state sha256 and `.claude` listing unchanged;
  preview voids equal what the real reopen then voids; no-plan dry-run exits 0 with an empty preview; real reopen output/state unchanged. Helpers: `captureRun`, `sha256File`, `commitFixture`, `approvedFixture`.

## Finding: the conformance suite is red at baseline in this environment
Whole-file run in clone2 (unchanged code, only the new test file copied): the existing cases `submit-plan`, `cancel-submitted-plan`, `approve-plan`,
`reopen-design after approved plan`, `revoke-plan`, `set-phase` and `complete end-to-end lifecycle` already fail (logs show `submit-plan refused (PLAN-SUBMIT-HEAD-UNAVAILABLE)`
and `fatal: ambiguous argument 'HEAD'`: the fixture repo from `tempRoot` has no commit). I added `commitFixture` (one commit) to MY fixtures only; the second run
(logs `base-red2.*`, `green2.*` under `scratch/agent-out/w7qu/`) still shows all four new cases failing in both trees, so the cause is not yet isolated
(the log tail only shows stderr noise of earlier cases; the assertion text of the new cases was not read). Possibly `submit-plan` ignores `deps.gitHead` and the commit does not satisfy it, or the failure is environmental (sandbox git). RED/GREEN is therefore NOT established.

## Not done
GREEN/RED proof, baseline-vs-patched failing-name comparison, guard pin run in both trees, patch build, `git apply --check`, clone cleanup (clones still exist), Critic review (parent-owned batch gate).
The two pre-existing `pipeline-state.test.mjs` failures (near lines 2218/2219) were not touched.

## Protected-path classification
`lib/guard/sanctioned-args-scripts.mjs` is a guard file (protected baseline); the guard pin test is under `lib/guard/`. Neither matched TP-1..TP-13 in the obligations table.

## Proposed commit message
`feat(state): add a dry-run preview to reopen-design and admit it in the sanctioned-args guard`

## Next step
Read the assertion text of the new cases in `scratch/agent-out/w7qu/green2.pipeline-state-observer-conformance.test.mjs.log` (Read tool), fix the fixture (HEAD handling), then run `driver.mjs patch`, `check`, `cleanup`.
