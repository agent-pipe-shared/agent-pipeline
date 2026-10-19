---
schema: pipeline.backlog-item.v1
id: pipeline.session-scratch-binding-stays-unbound
type: defect
owner: pipeline
status: open
created: 2026-10-19
source: "PO test of e6fec04a0 in the main project (D54); measured on this repository, 2026-10-19"
sprint: none
done_when: manual
---

# The session's scratch binding stays unbound and heal cannot repair it

## Description

The bootstrap preflight prints `pipeline.bootstrap-scratch-lifecycle.v1` with
`binding: {status: "unbound-no-session-identity"}` in every session. The PO read it as the
session binding and found that `session-authority-repair.mjs heal` does not change it (D54).
It is a separate mechanism: the scratch-descriptor lifecycle in
`lib/session-cleanup-recovery.mjs` (`bindScratchDescriptor`,
`retireOrphanScratchDescriptors`), which the session-authority registry never touches.
Measured on this repository:

- **The preflight has no session id.** `runBootstrapScratchLifecycle`
  (`scripts/pipeline-start-preflight.mjs`) binds only when `PIPELINE_SCRATCH_SESSION_ID` is
  set, and nothing sets it on the preflight's path. The session's own shell carries
  `CLAUDE_CODE_SESSION_ID` (a 36-character UUID, measured from a Bash tool call), the same
  identity D52 (1) late binding uses for `slice-queue.mjs` (E36 (e)).
- **The liveness anchor dies with the tool shell.** The preflight binds with
  `process.pid`, its own short-lived process. The SessionStart hook
  (`hooks/staleness-check.mjs`, `runScratchLifecycleForSessionStart`) binds with
  `process.ppid`. A Bash tool call runs as `node` under a `bash` started for that one call,
  under the long-lived `claude` host process (measured: `node -> bash -> claude`; the `claude`
  process itself carries no `CLAUDE_CODE_SESSION_ID`). Whenever a process is started through
  such a one-shot shell, its `ppid` is gone seconds later, and the next sweep judges the
  descriptor an orphan.
- **The sweep can retire the session's own binding.** After `/reload-plugins`, the
  SessionStart hook ran, then the preflight reported `sweep.retiredCount: 1`, and the
  descriptor directory was empty afterwards. A retirement deletes the claimed
  `scratch/<session>-<suffix>` directory recursively. Which descriptor was retired is not
  recorded; the current session's own is the likely one. The sweep has no rule that keeps the
  current session's own descriptor.
- **No repair is offered.** `session-authority-repair.mjs inspect` does not report the
  scratch binding, and `heal` does not bind it.

## Acceptance

- The preflight binds, or reuses, the session's scratch descriptor from
  `CLAUDE_CODE_SESSION_ID` when `PIPELINE_SCRATCH_SESSION_ID` is absent, and reports
  `bound` or `reused`, not `unbound-no-session-identity`, inside a Claude session.
- Hook and preflight record the long-lived runner host process as the liveness anchor, not a
  one-shot shell or their own process. On Linux, walk `/proc` from the parent past shell
  processes; elsewhere, keep today's anchor.
- The sweep never retires the current session's own descriptor. A descriptor of the current
  session whose anchor is dead is re-anchored, and its directory is kept.
- `session-authority-repair.mjs inspect` reports the scratch binding of the session it runs
  in and names `heal` when it is unbound or dead-anchored; `heal` binds or re-anchors it.
  Outside a session (no session id) both say so and change nothing.
- Tests cover each point, including a fixture ancestry `node -> bash -> host`.
