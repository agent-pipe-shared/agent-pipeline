# Re-verification: onboarding-lifecycle-plan-hardcodes-the-codex-runner

## What this closes

`backlog/items/2026-08-06-onboarding-lifecycle-plan-hardcodes-the-codex-runner.md`
described a Claude consumer being silently routed onto the Codex rail while
following the tool's own printed `nextAction`s. `docs/release-0.5.2-readiness.md`
recorded it as blocking the 0.5.2 release.

Independent re-check, 2026-08-06 evening, on candidate `5ba7ee0f222b356e9e00009e8f188dc4dffe22c7`:
the fix already exists on this branch as commit
`c860e1dd5bb11f2f02c5d9ade2aeb84c1787107a` ("fix(onboarding): thread runner
identity through the whole consumer chain"), landed 2026-08-06T11:30:07+02:00 —
after the backlog item was written, but the item and the readiness doc were
never updated to reflect it.

## Independent verification performed

1. `node --test plugins/pipeline-core/scripts/onboarding-runner-identity.test.mjs`
   → `8 passed, 0 failed` (ORI01–ORI05, both `claude` and `codex` runners).
2. The suite is registered: `harness/scripts/verify.mjs:236`
   (`onboarding-runner-identity-tests`) and listed in
   `docs/product-capability-inventory.json`.
3. Manual re-run of the exact empty-directory smoke test the item's `source`
   field cites, in a fresh scratch directory
   (`scratch/onboarding-smoke-test`, gitignored, not part of this candidate),
   executing every returned `nextAction` verbatim as the `pipeline-start`
   skill instructs:

   ```
   inspect --root <dir> --intent bootstrap --runner claude
     → runner: "claude"; nextAction.argv carries --runner claude --intent bootstrap
   plan --root <dir> --runner claude --intent bootstrap
     → runner: "claude" (previously flipped to "codex" here)
   apply-portable-seed ... --runner claude --intent bootstrap
     → written pipeline.user.yaml: runners.default: "claude" (previously "codex")
   plan-runtime / initialize-runtime ... --runner claude --intent bootstrap
     → status progresses to "restart-required" with runner "claude" throughout
   ```

The originally reported consumer harm — a Claude bootstrap ending with
`runners.default: "codex"` and `runtime_missing: "required Codex runtime
targets are absent"` — does not reproduce. Both the CLI-layer identity loss
and the `freshIntent()` literal-default bug the commit message names are
fixed and covered by the regression suite.

## Residual finding, NOT covered by this closure

Continuing the manual chain to `restart-required` for `--runner claude`
surfaced a narrower, separate issue: the diagnostic message text at that step
still reads "Codex runtime targets ..." regardless of the actual runner, and
`nextAction.launch` unconditionally points at
`plugins/pipeline-core/scripts/codex-onboarding-launch.mjs` (a Codex host
-runtime-readback flow) even when `runner: "claude"`. This was NOT executed
to completion here (`requiresCurrentProcessExit: true`; running it would
replace this process) so it is reported, not proven, and is filed separately
as `backlog/items/2026-08-06-restart-launch-is-codex-only-for-every-runner.md`
rather than folded into this closure — it is a different-shaped question
(is a runner-neutral restart launcher needed, or does Claude never reach this
path in practice?) than the one this item closes.

## Conclusion

The release blocker recorded in `docs/release-0.5.2-readiness.md` ("Smoke
test... blocks the release") is resolved and independently re-verified.
`docs/release-0.5.2-readiness.md` is updated alongside this closure.
