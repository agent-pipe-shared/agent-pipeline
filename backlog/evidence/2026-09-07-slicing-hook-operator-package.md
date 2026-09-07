# Slicing hook attended operator package

The Claude slicing guard is built but intentionally not registered by an
agent. `plugins/pipeline-core/hooks/hooks.json` is kernel-protected, so the
attended PO operation is the only apply boundary.

From the repository root, first run the complete read-only preview:

```sh
node harness/scripts/wire-slicing-hook.mjs --preview
```

It validates the guard suite, the Verify registration, clean target preimages,
and both transformed JSON documents in memory. Its exact proposed registration
is matcher `Task|Agent|Workflow|TodoWrite`, command
`node "${CLAUDE_PLUGIN_ROOT}/hooks/guard-slicing.mjs"`, timeout `10` seconds.

After reviewing the preview, the PO may perform the attended apply:

```sh
node harness/scripts/wire-slicing-hook.mjs
```

`--check` performs the same preflight without the expanded preview. Apply uses
atomic per-file replacements for only `hooks.json` and this hook's inventory
surface; it restores both original byte sequences if its post-write inventory
check fails. A repeated apply is idempotent. It never commits.

No companion operator command is pending: worktree isolation and handover-size
are already registered in the Claude manifest. This package does not add Codex
or Antigravity runtime support.

Evidence: `node --test harness/scripts/wire-dispatch-budget-hook.test.mjs`
exited 0 and was captured in
`scratch/NVA-B-SLICING-WIRE-1/wire-slicing-hook-tests.log` (17 passed). The
earlier direct guard-slicing run failed at native Codex test `GS31`; that
historical output remains at
`scratch/NVA-B-SLICING-WIRE-1/guard-slicing-tests.log`. The native-runtime
package subsequently resolved it: the current shared suite passed 48 tests,
captured in `evidence/NVA-B-NATIVE-SLICING-1-guard-slicing.json`. The dispatcher
read back both final captures. Attended apply and the full candidate gate
remain pending.
