# W7-R3 project-onboarding-v3: chunk-0 reds and all-chunks runner (checkpoint 2)

Slice W7-R3-ONBOARDING-V3-CHUNK0-REDS-ALL-CHUNKS-20261031. Status: checkpoint, targeted delivery NOT green. The patch
(re-cut from the final clone state, 14694 bytes, one file) applies on the candidate (`git apply --check` exit 0). Per the
Coordinator's answer, the two push-gate cases are left red as a named STOP; the force-added state route was removed.

## Result of the unchanged-assertion cases after the change

- Chunk runner: with the change the full suite runs chunk 1 after a red chunk 0 (log `c1.project-onboarding-v3`: summary
  "240 cases across 2 sequential chunks of 6 shards, 4 shards failed", all four failing shards are chunk 1, exit non-zero).
  Without the change (baseline log `base1.project-onboarding-v3`, plain clone): "5 shards failed", chunk 0 shards 0-4 red, chunk 1
  never ran. This is the revert proof; the driver `revert` mode is a no-op for this slice (it names an unchanged production file).
- Fixed (probe-green in the clone, logs `c1probe5`): the dev-plan gate, the handover cases for claude, codex and antigravity,
  NVA-R40-PROJDRIFT (cases 94-98). The final-state full run `c2` (after removing the push-state helper) had not finished at this
  checkpoint. In the earlier full run `c1` no chunk-0 shard failed (it still carried the force-add route, so the two push cases
  passed there; that route is now removed and they are expected red again, unverified in a full run).
- onboarding-init.test (clone): 58 pass, 0 fail. check-verify-case-completion.test (clone): red; the R1 notes record the same
  suite as 31/32 with VCR01 only at baseline; the clone-versus-baseline comparison of the failing names is not done. project-onboarding-e2e (clone)
  log carries no FAIL line; its baseline-identical architecture-authoring red was not compared by name.

## Cause per case (seven briefed/hidden reds, plus the STOP pair)

1. CVCT family, cases 94 (dev-plan gate, chunk 1), 95 (handover claude, chunk 1), 96 and 97 (handover codex, antigravity), 98
   (NVA-R40-PROJDRIFT). `set-phase --phase implementation --verify-command` passes gates the fixtures predate:
   - calibration commit preflight (NVA-CF-VERIFYDEADLOCK; pipeline-state.mjs set-phase -> inspectReplayableCalibrationVerifyLayout ->
     committedCalibrationPaths, CVCT-CALIBRATION): every present calibration tier (`project/pipeline.json`, the twin
     `.claude/pipeline.json`) must be tracked at HEAD. Fix: `commitBaselineCalibration`, run while the design is still a draft.
   - accepted-contract registration (readAcceptedDeliveryContract, CAC-REGISTRATION-INVALID): fix `registerApprovedFeaturePackage`
     (shipped `register-feature-package.mjs --root`, never commits); its manifest needs `specs/<featureId>/`, so the dev-plan and
     PROJDRIFT fixtures use `specs/gated-work` and `specs/projdrift-work`.
   - the same reader reads `pipeline.user.yaml` at the approval candidate (CAC-SOURCE-UNAVAILABLE): committed with the calibration.
   - calibration companion write only on the source-defaults route (`sourceDefaults`, deps limited to `dir`/`now`;
     SDC-AUTHORITY-UNAVAILABLE): fix `setPhaseWithVerifyCommand`.
2. Chunk runner: the `break` after a failing chunk is replaced by exported `runAllChunks`; each failing shard is printed and the
   exit code stays 1. `assertEveryChunkRunsContract` checks it with synthetic results; no case added (count stays 240).

## STOP (left red, assertions untouched): seeded push gate (case 99) and SECGATE-1 (case 100)

Refusal text (finished log `base1.project-onboarding-v3`, identical in the clone without the helper): "Push-Gate check failed
(2 finding(s)): 1. candidate-bound independent review and Verify are unavailable (private-critic-binding-unavailable)
2. Push approval missing: project/pipeline-state.json does not exist (never recorded via approve-push)." and, for SECGATE-1,
"only the security bucket should still be complaining".
Code path: `guard-push.mjs` `pushedStateRequiresReview` (~2326) -> `checkIndependentPublicationReview` (~2334) reads the state from the
PUSHED commit (`publication-review-requirement.mjs`: absent state is REVIEW-STATE-UNAVAILABLE, review required); and the approval
check (~2582-2592) requires the working-tree state file. Onboarding seeds `/project/pipeline-state.json` into the consumer
`.gitignore` (`project-onboarding-v3.mjs` PROJECT_IGNORE_SEED, ~230), so a consumer's pushed commit never carries the state and the
review duty always applies. Only a force-added state (not a consumer command) passes: shown once in run `c1` / probe `c1probe7`, then removed.
This is a product question for the PO, not a stale fixture.

## Newly visible chunk-1 reds (pre-existing, hidden by the stop; NOT caused by this change)

The same six cases fail in the plain clone (probe `base2`, finished log) and in the edited clone (`c1`): the orphaned
descriptor repaired automatically (cleanup_recovery_deferred warning), apply-portable-seed --activate trust anchor (expected 'collect-input', got 'command'),
the five-wrapper pending-asks single-helper source pin, matrix source/runtime progress actions (same 'collect-input' vs 'command'),
promoting a PRD whose language differs from kickoff's (submit-plan blocked by ARCHITECTURE-FITNESS-NOT-READY), and the coordinator-sourced bind
(NVA-CF-BL18-COORDINATORPATH). Causes beyond these messages were not analysed (budget); the two architecture-fitness ones look like fixtures
that lack the architecture design package. Each needs its own slice.

### Coordinator correction (2026-10-31): two of these six come from held patch G15

The plain clone of this slice stacks G15, so "baseline" above means HEAD plus G15. On plain HEAD 23d5bfdf0, with no
held patch, the same six cases were run through `scratch/agent-out/w7red3/probe-head.mjs`. Result:
`["6:fail","45:fail","46:pass","54:pass","90:fail","92:fail"]`.

- Pre-existing on HEAD: case 6 (orphaned descriptor), case 45 (five-wrapper source pin), case 90 (PRD language at
  promotion) and case 92 (coordinator-sourced bind).
- Introduced by G15: case 46 (apply-portable-seed --activate trust anchor, first-restart ordering) and case 54 (matrix
  source/runtime progress actions). Both now return `command` where they expect `collect-input`. G15 replaces the Codex
  consent collect-input with a read-only inspect command. Its own baseline comparison covered chunk 0 only, because
  chunk 1 never ran before this slice. These two go to a G15 follow-up slice.

## Downstream sweep

Only `scripts/sitting-count-pass.mjs` and its test mention the summary and CHILD lines; those lines are unchanged. The new helper
names occur only in the test file.

## Remaining

Read the finished `c2` log (final state), compare e2e and check-verify-case-completion failing names against a baseline run
(`base1` chain was still running), then re-cut only if edits follow.
