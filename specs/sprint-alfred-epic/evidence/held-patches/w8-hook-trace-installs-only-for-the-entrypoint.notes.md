# w8-hook-trace-installs-only-for-the-entrypoint (held patch, not applied)

Cause of the red `session-authority-repair` cases SAS05 and SAS18: with `PIPELINE_AUTHORITY_TRACE=1`, `pipeline-state.mjs` printed TWO `AUTHORITY-TRACE` lines
(`pipeline.authority-trace.v1` from its own writer and `pipeline.hook-authority-trace.v1`), where the contract is exactly one parseable line per spawned state verb.

Measured, not inferred: no `NODE_OPTIONS` preload was involved. The second line came from a plain module import. `hooks/guard-dispatch-budget.mjs` runs
`installHookAuthorityTrace()` at module scope, and `pipeline-state.mjs` reaches that module through its imports, so any process that merely imports a hook module
installed the hook writer. The same module-scope line exists in `guard-dispatch`, `guard-lifecycle-ready` and `guard-worktree-isolation`.

Change: in those four hooks the install line is gated on `isGovernanceHookEntry(import.meta.url)` (the existing `isDirectInvocation` helper each already imports), so the
trace is installed only when the hook is the process entrypoint. A hook run by the host is unchanged; the preload route (`authority-trace-preload.mjs`) is unchanged.

Evidence (clean clone): `session-authority-repair` 40/40 (SAS05 and SAS18 were red), `authority-trace-preload` 9/9, including APT8 (each Agent PreToolUse hook script
still appends its trace line). Applies to the repository HEAD. The kernel-closure test in the same area was already red before this change; it is a separate slice.
