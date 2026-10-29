# Held patch q1: Codex pretool guard, Author Repair case, fixture private-state mode (test only)

State: HELD PATCH, test only, independent of every other held patch (one hunk in `plugins/pipeline-core/hooks/codex-pretool-guard.test.mjs`, helper `readyLifecycleFixture`). Nothing applied, reviewed or accepted. Written and measured by the Elephant.

Backlog entry served: `pipeline.greenfield.g35.codex-push-guard-budget` ("twelve broad-suite fixture-transition failures ... historical failure is not baseline-proven"). Its premise is stale: the twelve failures of the 2026-10-25 qualification run were the `design-authoring-required` transition (already fixed in the tree: `createReadyLifecycleFixture` expects `design-authoring-required`, with a QG-04 justification comment) plus a missing synthetic user-info preload. On a clean clone of HEAD `a6f087f9f` two of 39 cases are red, not twelve.

## Cause of case 17 (`Pipeline Author Repair selects one exact source root and consumes one patch`)

Measured with debug output in a scratch clone (not in the patch):

- The armed capability recorded one denial digest, the replay computed another, so `consumeHumanGuardOverride()` skipped the capability (`den: false`) and the replay printed a fresh denial. No toolInputSha256 or window problem.
- The two denial reasons differ only by two trailing lines on the first one: `(node:<pid>) [PB-ROOT-REPAIRED] Warning: private-state directory agent-pipeline was repaired in place: mode 0o755 was reset to 0o700.` and the `--trace-warnings` hint. The guard child's stderr is part of its denial reason, and the repair warning is printed once, by the first process that touches the private-state directory.
- The ready fixture copies a template with `cpSync`, which does not keep the 0o700 mode of `.git/agent-pipeline`, so the first guard child in every clone repairs it and prints the warning; the replay does not.
- Case 15 passes because there the adapter process itself touches the directory first, so the warning lands in the adapter's stderr and not in a guard child's denial reason.

## The patch

In `readyLifecycleFixture`, after the `cpSync`, set `.git/agent-pipeline` to 0o700 (not on win32; failure ignored when the template has no private state). Nothing in production changes.

## Evidence

- Live tree, filtered run of the case: red, deterministic (two runs).
- Scratch clone with the patch: case 17 ok; the full file shows the only remaining red case 7.
- Fresh-clone verification: see the verify document.

## Not fixed, with reason: case 7 (`production adapter gives a slow push guard its dedicated share`)

Environment-bound, not a defect. The case asserts `process.env.HOME` matches `codex-push-test-home` ("test runner must provide a synthetic HOME") and runs the adapter with a user-info preload the runner supplies; no committed runner provides that HOME. In a clean clone it also needs `scratch/` (untracked) for its `mkdtemp`. Run bare, it is red by design. It needs the private qualification runner, so it belongs to the native/qualification gate, not to this patch.

## Production observation (not changed; Elephant writes no production code)

`denialDigests` binds the guard's raw stderr (`bindingDenialReason` strips only the HGO handoff headline). Any process warning a guard child prints once, with its pid, makes the next identical call's digest differ, so an armed one-time capability is silently skipped and the PO's signature is spent for nothing. Real sessions can hit this too (a Node deprecation or the private-state repair warning on a first touch). A hardening would drop `(node:<pid>)` warning lines from the bound reason, with its own RED case; it has design latitude (which warnings), so it is a PO question or a separate production slice.

## Apply

`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-codex-pretool-author-repair-private-state-mode-q1.patch`, `git add -A -- plugins/pipeline-core`, `git commit --no-verify -F scratch/commit-msg-po-apply-codex-author-repair.txt`.
