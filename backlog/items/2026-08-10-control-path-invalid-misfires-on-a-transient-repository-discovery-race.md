---
schema: pipeline.backlog-item.v1
id: pipeline.control-path-invalid-misfires-on-a-transient-repository-discovery-race
type: defect
owner: pipeline
status: in_progress
created: 2026-08-10
source: "Live greenfield onboarding test, 2026-08-10 (both Claude Code and Codex hit it independently on separate fresh test projects). PO-reported live: onboarding got stuck reporting `repository-control-path-invalid` with no recovery path, right after a Codex restart relaunch."
---

# `repository-control-path-invalid` can misfire on a one-off transient discovery race right after an onboarding restart relaunch

## Description

Both a Codex and a Claude Code live greenfield onboarding test independently
got stuck: immediately after the mandatory restart relaunch that follows
`initialize-runtime --activate`, the very next `project-onboarding-v3.mjs
inspect` call reported `repository-control-path-invalid` ("the repository
control path is invalid or escaped its physical authority") against a
perfectly ordinary, freshly-initialized local repository. `nextAction` was
`null`, so the agent had no sanctioned next step; Codex invented an
unauthorized `readlink -f .git` diagnostic on its own, which then tripped a
separate "attended host terminal" guard with no escape in a plain WSL CLI
session — a genuine dead end, not a recoverable typed state.

Root cause, confirmed by direct code reading and reproduction: in
`plugins/pipeline-core/lib/codex-onboarding-capabilities.mjs`,
`validateLocalRepository()` is called inside a bare `try { ... } catch {
component.status = "control-path-invalid"; }` with **no retry**. Any
exception at all — a real symlink escape, an unregistered worktree, or a
one-off transient git-spawn/`realpathSync` hiccup racing the just-relaunched
process's still-settling filesystem view on WSL — collapses to the exact
same terminal status, discarding the real reason. Direct evidence the
failure landed inside this specific try/catch (not an earlier check): the
failing JSON's `gitVersion` field was already populated (`"2.53.0"`), which
only happens after the code path that precedes this exact try/catch.

The affected test repository (`~/src/Rune_Test1_Codex_054_47`) could not be
made to reproduce the failure on direct re-invocation minutes later —
consistent with a transient race rather than a persistent repository defect.

## Triggering situation

Live PO-observed onboarding test, 2026-08-10, immediately after the
`codex-onboarding-launch.mjs --activate` restart relaunch. The PO confirmed
Claude Code hit the identical symptom independently on a separate test
project the same day — the shared code path
(`codex-onboarding-capabilities.mjs` / `worktree-lifecycle.mjs`) is
runner-neutral, so this was never Codex-specific.

## Affected artifact

`plugins/pipeline-core/lib/codex-onboarding-capabilities.mjs`
(`validateLocalRepository()` call site, previously unretried).

## Proposal / Fix applied

Wrapped the `validateLocalRepository()` call in a bounded retry (3 attempts,
20ms/40ms backoff via the existing `Atomics.wait` synchronous-sleep idiom
already used in `session-power.mjs`). The call is read-only (git rev-parse /
worktree list / realpathSync only, no writes), so retrying is side-effect
free. A genuine escape (symlinked `.git`, an out-of-bounds pointer file, an
unregistered worktree) reproduces identically on every attempt and still
correctly reports `control-path-invalid` after the bounded retry is
exhausted; only a one-off transient failure now self-heals.

Two new regression tests added to
`codex-onboarding-capabilities.test.mjs`: one proves a single injected
transient git failure is retried and recovers to
`local-valid-writable`; the other proves a persistent failure still reports
`control-path-invalid` after exactly the bounded number of attempts (no
silent infinite retry, no false positive).

## Not fixed here (separate, broader gap)

None of the nine `REPOSITORY_FAILURES` statuses in `project-onboarding-v3.mjs`
(`control-path-invalid`, `control-path-read-only`, `git-unavailable`,
`root-read-only`, `session-capability-unavailable`,
`worktree-capability-unavailable`, etc.) have any documented recovery
guidance in
`plugins/pipeline-core/skills/pipeline-start/references/onboarding-recovery.md`
— this is not specific to the status this item fixes. An agent facing any of
these today has to freelance a diagnosis, as Codex did here. Worth a
follow-on item if one of these resurfaces; not expanded here to keep this
fix scoped to the one observed, reproducible-enough-to-root-cause defect.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Accepted and built directly (2026-08-10) under live time
  pressure — the PO's own onboarding test was actively blocked.
- **Rationale:** Root cause was concretely identified (exact try/catch,
  confirmed via the populated-`gitVersion` evidence) and the fix is a
  minimal, side-effect-free, well-precedented retry; not a design choice
  needing a policy decision.
- **Assignment:** Direct Elephant edit, not EGM-dispatched — a deliberate,
  disclosed deviation from the standing Goldfish-dispatch mandate given the
  live-blocking severity and the PO's direct real-time instruction to fix it
  now. Self-verified: 23/23 tests green in
  `codex-onboarding-capabilities.test.mjs` including the two new ones.
- **Date:** 2026-08-10
