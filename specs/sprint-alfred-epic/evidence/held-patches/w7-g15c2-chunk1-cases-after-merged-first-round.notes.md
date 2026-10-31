# W7-G15C2 chunk-1 cases after the merged first onboarding round (D210) -- notes

Patch: `w7-g15c2-chunk1-cases-after-merged-first-round.patch`, cut against the stacked candidate (HEAD 9cbcc4c97 plus held
patches G15 and R3), apply-check on a clean copy of that candidate exit 0. It changes ONE file, the test file
`plugins/pipeline-core/lib/project-onboarding-v3.test.mjs` (+37/-2). No production file changed. Applies after G15 and R3.

## Decision per case: (a) restate, not (b) fix

Both cases went red only because G15 replaced the Codex consent collect-input by a read-only inspect command at the
first-restart boundary (`withPendingAsksSurfacedOnNextAction`, `consentSupersededByMergedRound`). The scenario probe on the
patched clone shows, for the two Codex states the cases build (fresh repository after `apply-portable-seed --activate`;
`runtime` fixture after `applyProjectOnboardingV3`), status `intake-required`, primary action `command` / `inspect` /
`mutation:false`, and `nextAction.pendingAsks` holding exactly one `collect-input` ask whose inputs include `profile` and
`projectDescription` and whose `precedingApplyAction` is the unchanged `intake-consent-apply` command. So the PO is still
asked, once. D210 requires exactly that: "merge the first onboarding rounds (initial answers and intake consent) into one PO turn".

Why no runner or state can lose the question (the (b) risk): the replacement is guarded by
`initialAnswersAction?.precedingApplyAction !== undefined` AND `runtime.firstRestartIntake.status === "capture-required"`
AND the primary being the consent collect-input; and `pendingAsks[0]` is `initialAnswersAction ?? authorIdentityAction`, so
whenever the consent action is replaced the merged ask is non-null and is the first pending ask. Claude/Antigravity keep
their ordinary consent action (the narrowing recorded in the G15 notes). No production change needed.

- Case 46 (`apply-portable-seed --activate seeds the machine's trust anchor ...`, assertion "the returned primary action
  preserves first-restart intake ordering"): intent unchanged -- a fresh repository is taken through first-restart intake
  before anything else. The `kind === "collect-input"` assertion is replaced by the shared helper (below). All other
  assertions of the case are untouched and still pass.
- Case 54 (`matrix source/runtime progress actions are exact, diagnostic-bound, and copy-safe`): intent unchanged -- the
  progress action at capture-required is exact, bound to `first_restart_material_capture_required`, copy-safe. The
  `kind === "collect-input"` assertion is replaced by the helper; one added assertion pins that the rendered action is one
  line (copy-safe). The diagnostic assertion and the rest of the case are untouched.
- New non-test helper `assertMergedFirstRoundOnCodexBoundary(result, label)` in the same file (not a case): asserts primary
  is a read-only `inspect` command needing no confirmation, no standalone `intake-consent-apply` question beside it, exactly
  one merged ask in `pendingAsks` carrying the consent as `precedingApplyAction` with the `profile` and `projectDescription`
  inputs, and the consent command nowhere else. Stricter than the old assertion, not weaker.

## Evidence (logs under scratch/agent-out/w7g15c2, not tracked)

- Restated cases GREEN on the patched clone (`probe.mjs`): `46 pass`, `54 pass` (2 of 240 cases selected).
- Restated cases RED when the two G15 production files are put back to plain 9cbcc4c97 (`revert-plainhead.mjs`, log
  `revert-plainhead.log`): `46 fail`, `54 fail`, both at the helper's "primary action is the read-only step that leads to
  the merged first-round ask"; production restored byte-equal. The restated assertions therefore test the merged-round shape.
- Original assertions on the stacked candidate (baseline clone `base1` log): case 46 fails at "the returned primary action
  preserves first-restart intake ordering", case 54 fails at its strict-equal (actual `command`, expected `collect-input`).
  The driver `revert` mode was NOT used: this change is test-only, so reverting production to the candidate would be a no-op.
- Full onboarding-v3 suite (both chunks), failing-name sets from the finished logs (`FAIL` lines):
  - clone `c1`: 6 reds = seeded push gate, seeded security gate (SECGATE-1), orphaned descriptor (case 6), five-wrapper
    source pin (case 45), PRD language at promotion (case 90), coordinator-sourced bind (case 92). Exactly the pre-existing four
    plus the R3 STOP pair.
  - baseline `base1`: the same six plus case 46 and case 54 (8 reds).
- `onboarding-init.test.mjs`: clone 58 pass / 0 fail; baseline 58 / 0.
- `project-onboarding-e2e.test.mjs`: clone and baseline both fail only "in-process driver follows returned actions and
  preserves the Codex legacy-advisory approval boundary" (architecture-authoring assertion, 3 matching signature lines in each log).
- `check-verify-case-completion.test.mjs`: clone and baseline both fail only `VCR01` with identical count diffs
  (36/33, 329/259, 296/246, 115/79, 154/143, 132/125). No pinned count moved: no case was added or removed.

## Downstream sweep

Not applicable: no production code changed (`project-onboarding-v3.mjs` and `onboarding-init.mjs` are byte-equal to the
candidate), so no function signature or output shape moved for any of the three runners. The helper is a new name used only
in the two cases above; it is not exported.

## Open / parent-owned

- Batch Critic, integrated Verify, PO acceptance: pending, not run here.
- Pre-existing reds elsewhere (guard-push-v2, guard-push-scratch-advisory, GST33, 16 unregistered suites, VCR01 drift) untouched.
