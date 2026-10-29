# Held patch: the kernel list covers the briefing file reference module (S2)

Built by the Elephant in a scratch clone (PO exception of 2026-10-29 for the D183 follow-up). Patch: `w7-gmw-kernel-list-covers-briefing-file-reference-s2.patch`, 2 files, 5 insertions, 2106 bytes. Applies on HEAD `6e9ecd46d` (`git apply --check` exit 0).

## Why

After the D183 patch was applied (`a57330be7`), `guard-dispatch.mjs` imports `lib/briefing-file-reference.mjs`, which decides the exact prompt bytes a dispatched Goldfish receives. `guard-maintenance-window-kernel-closure.test.mjs` case GMWKC01 found it: "guard-dispatch.mjs imports ../lib/briefing-file-reference.mjs, which is NOT in NEVER_LIFTABLE_KERNEL_PATHS". Found by the cross-check of the stamp `adc250283` (isolated clone, committed HEAD).

## Change

- `plugins/pipeline-core/lib/guard-maintenance-window.mjs`: one entry `plugins/pipeline-core/lib/briefing-file-reference.mjs` in `NEVER_LIFTABLE_KERNEL_PATHS` with a three-line comment.
- `docs/guard-maintenance-window-threat-model.md`: one sentence in the Protected-assets prose naming the module (GMWKC03 requires the prose to list every entry).

## Evidence

- RED before the edit (log `red.guard-maintenance-window-kernel-closure.test.mjs.log`): 10 passed, 1 failed (GMWKC01). This is also the revert proof.
- GREEN after the edit: `guard-maintenance-window-kernel-closure` 11 passed, 0 failed; neighbours `guard-maintenance-window` 63 passed, 0 failed and `guard-gate-strength` 41 passed, 0 failed.
- No second enumeration of the never-liftable list exists (pre-commit mirror item closed with S1).

## Apply

Kernel files (both are protected): apply as the earlier kernel patches (`git apply`, `git add -A -- plugins/pipeline-core docs/guard-maintenance-window-threat-model.md`, commit), then re-stamp and install. Full Verify, the batch Critic and PO acceptance remain open.
