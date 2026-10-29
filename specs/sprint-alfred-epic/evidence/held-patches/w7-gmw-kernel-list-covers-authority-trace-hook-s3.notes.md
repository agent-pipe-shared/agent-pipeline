# W7-GMW-KERNEL-LIST-S3 -- notes (state: HELD, built by the Elephant in a scratch clone)

Applies AFTER `w7-dispatch-hook-authority-trace-t1` (and, like it, after S2). Patch: `w7-gmw-kernel-list-covers-authority-trace-hook-s3.patch` (3 paths, `git apply --check` exit 0 on a fresh clone with the five earlier pending patches applied in order).

## Why

Found by the stacked-suite run of the pending candidate, not by the trace Goldfish: with the trace patch applied, `lib/guard-maintenance-window-kernel-closure.test.mjs` GMWKC01 fails with three violations. The three kernel hooks `guard-lifecycle-ready`, `guard-dispatch` and `guard-dispatch-budget` each gained a dynamic `import()` of the new `lib/authority-trace-hook.mjs`, which the closure scanner cannot classify, and that module is not on the never-liftable list. This is the same class of gap S2 closed for `briefing-file-reference.mjs`.

## What it changes

- `lib/guard-maintenance-window.mjs`: `lib/authority-trace-hook.mjs` joins `NEVER_LIFTABLE_KERNEL_PATHS` (it runs inside kernel hook processes).
- `lib/guard-maintenance-window-kernel-closure.test.mjs`: `DYNAMIC_IMPORT_EDGES` gets the three hook entries (one literal site each) and the trace module's single computed site `import(new URL(relative, base).href)` with its three alternatives (`worktree-lifecycle.mjs`, `windows-private-state.mjs`, `windows-owned-authority-backend.mjs`). The fourth hook that loads the module, `guard-worktree-isolation.mjs`, is not a kernel file and needs no entry.
- `docs/guard-maintenance-window-threat-model.md`: the Protected-assets prose names the module (GMWKC03 requires every list entry there).

## Checks (stacked scratch clone: S2, trace, report 05, N13, pin, then these edits)

- Before: GMWKC01 failed (3 violations). After: `guard-maintenance-window-kernel-closure.test.mjs` 11 passed, 0 failed; `lib/guard-maintenance-window.test.mjs` 63 passed, 0 failed (1 skipped, single-volume).
- Stack run of ten key suites before this patch: nine green, only the closure test red; the other nine were not rerun with S3 (it touches a list, a test table and a doc).

## NOT verified

- Full Verify, batch Critic and PO acceptance. Kernel paths: the PO applies this patch in the same ceremony, immediately after the trace patch.
