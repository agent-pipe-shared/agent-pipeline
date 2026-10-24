# G19-WINDOWS-READINESS-CONTINUATION v2 — inert proposal

Base `1e57d58014a2a5c00b3ba5409aa6a9a01aa976d5`; cumulative v1 stops and logs retained. No opening record, host receipt, native qualification, main import, or commit is claimed. The exact 11-path diff is `scratch/agent-out/g19-windows/g19-windows-readiness-v2.patch`; the same files remain modified only in `scratch/clones/g19-windows`.

## 1. DoD result and evidence

- **Passed, pure targeted:** `node --test plugins/pipeline-core/lib/windows-authority-readiness.test.mjs plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs plugins/pipeline-core/lib/guard-maintenance-window-kernel-closure.test.mjs plugins/pipeline-core/lib/calibration-verify-commit-transition.test.mjs`, exit 0, 108/108; machine output `scratch/agent-out/g19-windows/v2-targeted.log`. After the final plugin-ancestor regression, `node --test plugins/pipeline-core/lib/windows-authority-readiness.test.mjs`, exit 0, 9/9; `v2-readiness-final.log` in the same directory. Original v1 RED and GREEN artifacts remain there (`targeted-red.log`, `targeted-green.log`, `final-preflight-green.log`).
- **Passed, final preflight status case:** `node --test --test-name-pattern=Windows plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs`, exit 0, with the pending-hook negative control; `scratch/agent-out/g19-windows/v2-preflight-final.log`.
- **Passed, required consumer and skill checks:** `node --test harness/scripts/check-consumer-safe-paths.test.mjs plugins/pipeline-core/skills/pipeline-start/pipeline-start-v3.test.mjs`, exit 0, 17/17; `v2-consumer-fixed.log`. Initial run exited 1 solely because the expanded SKILL exceeded 24 KiB (`v2-consumer.log`); conditional detail was moved into its existing reference and the rerun passed. Initial kernel run exited 1 because its protected-assets document lacked the new module (`v2-kernel.log`); closure and document passed in the 108/108 targeted run. `git diff HEAD --check`, exit 0.
- **Not verifiable here:** native Windows ACL behavior, actual operator SID, real requester/Verify process under that ACL, and installed plugin bootstrap. WSL injected outcomes are not native proof. No configured quick command exists. Parent owns integrated Full Verify and independent batch review. Project resource criterion/measurement observations were not supplied to this worker; headroom is unknown, with no cap or compliance claim.

## 2. Changed files

- `lib/windows-authority-readiness.mjs` and its test: aggregate project/plugin/private causes, preserve the native human-controlled-above-proven-root rule, inspect strict plugin ancestors, show SID-based single-directory repair preview, and keep absent pre-Git private namespace from blocking onboarding.
- `scripts/pipeline-start-preflight.mjs` and its test: read-only early Win32 assessment once, use the common Git directory for worktrees, close bootstrap on unavailability, and retain every cause in the typed action.
- `skills/pipeline-start/SKILL.md` and `references/onboarding-recovery.md`: recognize the closed status and instruct display and operator review without automatic ACL action.
- `scripts/pipeline-state.mjs`, `lib/calibration-verify-commit-transition.mjs`, `lib/session-requester-bridge.mjs`: retain a closed `WIN-AUTH-*` cause alongside existing CVCT/requester refusal when the native source emits one; arbitrary exception text is not copied.
- `lib/guard-maintenance-window.mjs` and `docs/guard-maintenance-window-threat-model.md`: include the imported diagnostic module in inherited never-liftable kernel closure and its required inventory.

## 3. Deliberately not changed

Native PowerShell ACL policy and the narrowly bounded ancestor exception, existing acceptance examiners, PRD/Spec, main tracked source, calibration, protected approval/Result/close gates, pins, and ACL state.

## 4. Deviations

PO-approved fix-wave method exception: this is an inert clone proposal. Native opening-record and host-commit routes are unavailable here; no substitute receipt or authorship claim was made. The two observed check failures and their corrected reruns remain in the cumulative evidence.

## 5. Open items

Targeted delivery: green for the pure source candidate. Native Windows reproduction and direct process behavior: pending. Installed plugin qualification and operator-reviewed SID/path repair, if needed: pending. Parent integrated Verify: pending; independent frozen-batch Critic review: pending; PO acceptance: open. No ACL mutation was performed.

## 6. Recovery pointer

Review/apply the exact v2 patch through the sanctioned protected source path, then run Windows native negative and positive controls, integrated Verify, and the declared Critic batch. Preserve v1 and v2 evidence and cumulative cost; do not reset the clone or repin the Critic set.
