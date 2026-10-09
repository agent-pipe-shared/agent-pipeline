---
schema: pipeline.backlog-item.v1
id: pipeline.concurrent-session-warning-never-fires-on-native-windows
type: defect
owner: pipeline
status: open
created: 2026-10-09
source: "TR-J-D2 diagnosis, specs/sprint-alfred-epic/evidence/tr-j-d-native-preflight-reds-2026-10-09.md"
sprint: alfred
done_when: manual
due: 2026-10-12
---

# The concurrent-session warning never fires on native Windows

## Description

`plugins/pipeline-core/lib/worktree-lifecycle.mjs:559` `localProcessStartIdentity` returns null unless
`process.platform === "linux"`, because it reads `/proc/<pid>/stat`. Off Linux the null propagates:
`localProcessOwnerRuntime` (`:567-574`) returns null, `startSessionDescriptor` (`:642`) stores `ownerRuntime: null`,
and `inspectSessionOwnerRuntime` (`:715`) reports "unavailable". `observeConcurrentSessionWarning`
(`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs:846`, called at `:1415`) warns only on "live", so a second
session in the same repository is never warned about on native Windows or macOS.

## Triggering situation

Two native-only reds in `pipeline-start-preflight.test.mjs` ("PHX-WP-AAC01-MULTISESSION", now `:1873` and `:1926`),
diagnosed by TR-J-D2 (commit `997356d7e`). The "unavailable" status off Linux is pinned as intended in
`plugins/pipeline-core/lib/worktree-lifecycle.test.mjs:818`, so the tests are host-limited, but the user-facing effect
is a missing safety warning on the PO's own platform (EL-18: one repo, one Elephant).

## Affected artifact

`plugins/pipeline-core/lib/worktree-lifecycle.mjs` (owner runtime), `pipeline-start-preflight.mjs` (warning).

## Proposal

Advisory-only probable-liveness off Linux, without a process spawn (spawn cost is a known Windows toil):
record `{ pid, bootId }` with the boot time computed as now − uptime at minute granularity (the Ruling 111 encoding);
inspect: pid gone (`kill(pid, 0)` ESRCH) → dead; boot time differs → dead; otherwise "live-probable", and the warning
fires for "live-probable" with wording that says so. PID reuse within one boot can cause a false warning, which is
acceptable for an advisory. Acceptance: on native Windows a second live session in the same repository produces the
warning; a dead or previous-boot descriptor does not. Owner: Elephant. Due: before the 0.7.0 candidate stamp.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, proposal subject to the PO list default (Ruling 117).
- **Rationale:** a safety warning that silently never fires on the PO's platform is a false assurance.
- **Assignment (if accepted):** 0.7.0 candidate (BN: not a Batman/Nightwing item).
- **Date:** 2026-10-09
