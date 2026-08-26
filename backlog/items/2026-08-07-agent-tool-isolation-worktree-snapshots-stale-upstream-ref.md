---
schema: pipeline.backlog-item.v1
id: pipeline.agent-tool-isolation-worktree-snapshots-stale-upstream-ref
type: defect
owner: pipeline
status: closed
closed_at: "2026-08-19"
closure_repository: self
closure_commit: 1b6e6a606ffcd6f32c3993b73be1110d3eb299af
closure_evidence: backlog/items/2026-08-07-agent-tool-isolation-worktree-snapshots-stale-upstream-ref.md
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

## Update 2026-08-11 — reconfirmed, not rediscovered independently

Hit again this session (GF-115's first dispatch attempt), confirming this
item's own prediction that the workaround would otherwise be rediscovered
from scratch — this session initially did exactly that (diagnosed the same
symptom independently via `git cat-file -p`/`merge-base` before finding this
pre-existing item). Two additions from this occurrence:

- The stale ref this time was `origin/main` (a different branch than the
  upstream-tracking ref of the branch actually being worked on,
  `feat/sprint-nova-codex-v046`) -- broader than "the branch's own upstream
  tracking ref": the snapshot source may simply be whatever this environment
  resolves as a default/main ref, not specifically `@{upstream}`.
- This item's own proposed in-dispatch recovery (`git rev-parse HEAD` then
  proceed) needs one more step in practice: the natural fix,
  `git reset --hard <target-sha>`, is blocked by guard-git `GG-07` inside a
  dispatched worktree with no PO override token available in-session. The
  working non-destructive alternative is `git checkout --detach
  <target-sha>` -- reaches the identical end state without the blocked verb.
  Worth folding into the Proposal's workaround text next time this item is
  revised, rather than rediscovering the GG-07 block too.

Still not a repository-code defect to fix here (harness-level). Decision
unchanged: accept-open.

**Update 2026-08-18 (Elephant, Phoenix backlog-clearing pass):** re-verified
— still no `isolation: "worktree"` implementation exists under
`plugins/pipeline-core` or `harness/` in this checkout to inspect or patch;
this is genuinely harness/tool-level, not a repository-code defect, and has
no bearing on Phoenix's own delivered epic surface. Phoenix's own copy of
this item flipped frontmatter `status` to `deferred` to match the Decision's
substance (harness-level, nothing repository-side to fix); superseded by the
PO's final closure below, one day later.

## Closure, 2026-08-19

PO decision: close, final. Confirmed harness/tool-level limitation
(`Agent`/`Workflow` tool's `isolation: "worktree"` snapshot source), not
fixable from this repository's own code — matches this item's own existing
Triage conclusion, reconfirmed independently on 2026-08-11 and again on
2026-08-18. The documented workaround (self-heal via
`git checkout --detach <sha>`, proactive `git rev-parse HEAD` verification
before trusting a fresh worktree) is now itself a standing CLAUDE.md Hard
Rule
(`plugins/pipeline-core/skills/pipeline-start/references/workflow-dispatch.md`),
so the operational knowledge this item exists to preserve already has a
durable home outside the backlog.
