---
schema: pipeline.backlog-item.v1
id: pipeline.codex-worker-dispatch-fails-session-capability-probe-root-does-not
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-30
closure_repository: self
closure_commit: b2bd05ed300a46b727f02c14a27f4cd66db00f71
closure_evidence: plugins/pipeline-core/lib/codex-onboarding-capabilities.mjs
created: 2026-08-30
sprint: nova
tracking: "NOW / Nova A -- PO-raised 2026-08-30 from the Codex/WSL greenfield retrospective; confirmed via code trace to be a genuinely separate defect from the resume-hint enforcement gap and the design-binding gap raised alongside it."
source: "Codex-060-77 greenfield retrospective, section on root/worker capability mismatch. Confirmed live: root runner was session-ready after bootstrap; two dispatched Codex workers (a generic author, an explicit implementor) each got repository-control-path-invalid/session-capability-unavailable and failed closed, no change made."
---

# A dispatched Codex worker fails the session-capability probe that the root runner passes

## What happened

Root and worker Codex sessions have different functional capability in the
same repository. The root runner is session-ready after bootstrap. Two
dispatched Codex workers (a generic author, an explicit implementor) both
failed closed with `repository-control-path-invalid` /
`session-capability-unavailable` and made no change, blocking Codex
dispatch entirely.

## Mechanism, confirmed by code trace

`plugins/pipeline-core/lib/codex-onboarding-capabilities.mjs`:

- `control-path-invalid` fires from `validateLocalRepository()`/
  `gitEntryType()` failing on the worker's own view of the repository root
  (~line 608/619/645), before the session probe even runs.
- `session-capability-unavailable` fires from `sessionProbe()`
  (~line 222-261): the `intent === "session"` check (~line 656-668) writes
  a disposable session-descriptor JSON file into
  `<repository.commonDir>/agent-pipeline/session-descriptors/active/`, then
  immediately retires (deletes) it, verifying the calling session can
  actually create/read/delete files in the shared `.git`-adjacent
  directory. Any throw during that write/read/delete round-trip sets
  `component.status = "session-capability-unavailable"`.

## Not the same as the resume-hint or design-binding gaps

Explicitly checked and ruled out during triage: this fires at
**worker-dispatch time** (spawning a Codex worker session), not at session
start/resume (the resume-hint mandatory-read-duty gap) and not at a
`pipeline-state.mjs` plan-lifecycle transition (the design-binding gap).
No code path overlaps with either.

## Direction

Root cause not yet established -- plausible candidates, unconfirmed: worker
sandbox/workspace isolation not sharing root's `.git` view, a
permissions/timing race on the shared descriptor directory, or a
Codex-specific spawn environment gap. Needs a live reproduction of an
actual Codex worker dispatch to diagnose further -- this cannot be
determined from static code reading alone, and this backlog item
deliberately does not guess a fix without that reproduction.

## Acceptance criteria

- A live-reproduced Codex worker dispatch either passes the session
  probe, or the exact reason it cannot (with the round-trip's real
  failure captured, not just the resulting status code) is established.
- Root and worker sessions converge to the same capability outcome for the
  same repository, or the divergence is a deliberate, documented,
  necessary constraint (not an accidental defect).

## Closed, 2026-08-30 (live diagnosis with the PO, root cause confirmed)

Live-reproduced with the PO directly against `Rune_Test1_Codex_060_77`,
using a standalone raw-probe script (`scratch/raw-session-probe-diagnostic.mjs`,
not committed -- gitignored scratch, replicates
`disposableWriteProbe()`'s exact `openSync`/`writeFileSync`/`fsyncSync`/
`renameSync` sequence against the real `.git` directory) and a
spawn-logging wrapper around the real, installed
`diagnoseCodexOnboardingSessionCapability()`:

- `.git` is a real physical directory, not a worktree/submodule pointer.
- Plain-shell `touch`/`ls`/`rm` against `.git` succeeds cleanly (POSIX
  permissions are fine).
- The raw-probe script, run at the "authorized host boundary" (a plain
  terminal, outside Codex's own tool-calling context), succeeds fully --
  open, write, fsync, rename, cleanup, no error.
- **The SAME script, run from inside Codex's own sandboxed tool-calling
  context, fails immediately at its own `execSync("git rev-parse
  --git-common-dir")` call with `spawnSync /bin/sh: EPERM`** -- child-process
  spawning itself is blocked by the Codex sandbox, not by Git, not by
  filesystem permissions, not by Pipeline code.

**Root cause: Codex's sandbox blocks child-process spawning (EPERM) in
(at least some) worker/tool-calling contexts.** `validateLocalRepository()`
(`plugins/pipeline-core/lib/codex-onboarding-capabilities.mjs`) spawns
`git` subprocesses (via `discoverRepository()`/`gitVersion()`) to validate
the repository BEFORE `disposableWriteProbe()`'s pure-fs descriptor probe
ever runs -- so the spawn EPERM fires first, surfacing as the redacted
`repository-private-control` stage. This is an environmental/sandbox
configuration constraint, not a Pipeline defect: no code fix changes
whether Codex's sandbox permits spawning `git`.

**Not fixed, and correctly not fixed:** relaxing the Pipeline's own
git-spawn-based validation would weaken a real security-relevant check for
every OTHER runner/environment to work around one sandbox's configuration.

**Optional, cheap follow-up (Nova B, not required):** `diagnoseCodexOnboardingSessionCapability()`'s
redaction (by design, per its own doc comment) currently reports only
`{status, stage}` -- it could additionally recognize the specific
`spawn EPERM` shape and name it explicitly ("git subprocess spawning is
blocked in this environment -- check sandbox/workspace permissions")
instead of staying fully generic, without leaking any of the currently-
redacted descriptor paths, nonces, or DACLs. Left for a future session; not
blocking.

## Triage

- **Decision:** accepted, Nova A
- **Rationale:** PO-prioritized 2026-08-30; blocks Codex dispatch entirely,
  a genuine happy-path blocker distinct from the two gaps raised alongside
  it in the same review pass
- **Date:** 2026-08-30
