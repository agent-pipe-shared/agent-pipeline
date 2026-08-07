---
schema: pipeline.backlog-item.v1
id: pipeline.agent-tool-isolation-worktree-snapshots-stale-upstream-ref
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: "NOVA-GMW-1 first dispatch attempt, 2026-08-07 -- Agent tool isolation:worktree."
due: 2026-09-06
expires: 2026-09-06
---

# `Agent`/`Workflow` tool's `isolation: "worktree"` snapshots a stale upstream-tracking ref, not local HEAD

## Description

Dispatching a subagent with `isolation: "worktree"` produced a worktree whose
`docs/adr/`, `docs/`, and `specs/sprint-nova-epic/design/` did not contain
three files committed to local HEAD moments before dispatch
(`docs/adr/0058-guard-maintenance-window.md`,
`docs/guard-maintenance-window-threat-model.md`,
`specs/sprint-nova-epic/design/2026-08-07-guard-maintenance-window-design.md`,
all present at local HEAD `c457a10`/`1b45f94` at dispatch time). The dispatched
Goldfish correctly stopped rather than improvising, and reported the worktree's
`docs/state.md` also had no trace of this session's other same-day work.

Checking `git rev-parse upstream/feat/sprint-nova-codex-v046` from the main
checkout after the fact showed it resolves to `5ba7ee0` -- the commit this
whole session started from, before any of today's local commits (Nova V/VI/VII,
this GMW work, all of it). This strongly suggests `isolation: "worktree"` bases
its snapshot on the branch's remote-tracking ref rather than the actual local
HEAD of the checkout the harness is running in, at least in this environment/
configuration.

## Triggering situation

Any dispatch using `isolation: "worktree"` in a session with unpushed local
commits ahead of the branch's upstream tracking ref. Not specific to this
feature -- any Nova-A-style same-session dispatch relying on freshly-committed-
but-unpushed context files would hit the same gap.

## Affected artifact

The `Agent`/`Workflow` tool's `isolation: "worktree"` implementation (harness-
level, not a repository file this session can inspect or fix directly).

## Proposal

Either (a) the isolation mechanism should snapshot from local HEAD of the
invoking checkout rather than any remote-tracking ref, or (b) if there is a
deliberate reason to snapshot from upstream (e.g. avoiding uncommitted/
unreviewed local state), that behavior should be documented plainly in the
Agent tool's own description so a dispatcher does not have to discover it by a
failed dispatch. Until fixed, the practical workaround (used for NOVA-GMW-1's
retry) is a manually created `git worktree add <path> -b <branch> HEAD`, with
the dispatched agent explicitly instructed to `cd` into that exact path as its
first action and verify `git rev-parse HEAD` before proceeding -- `isolation`
is not used at all for that dispatch.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accept-open.
- **Rationale:** confirmed by direct comparison of `upstream/...` against
  local HEAD after the fact, not merely inferred from the dispatched agent's
  report -- the same category of "measured, not theorized" verification this
  repository already expects elsewhere. Not a repository-code defect this
  session can fix (harness-level tool behavior); recorded so the workaround
  is not rediscovered from scratch next time.
- **Date:** 2026-08-07
