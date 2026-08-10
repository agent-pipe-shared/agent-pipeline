---
schema: pipeline.backlog-item.v1
id: pipeline.worktree-isolated-dispatch-leaves-an-untracked-dir-that-blocks-verify
type: defect
owner: pipeline
status: open
created: 2026-08-11
source: "GF-111 dispatch (worktree isolation), 2026-08-11 — first Full Verify attempt against the cherry-picked commit failed at VERIFY-CANDIDATE-PREFLIGHT with 'Commit or stash tracked changes before Verify; no suite was started', caused by the leftover .claude/worktrees/ directory, not by any real dirty change."
---

# A worktree-isolated Agent dispatch leaves `.claude/worktrees/<id>/` behind, and it is not gitignored — Verify's dirty-tree preflight refuses to run

## Description

Dispatching an agent with `isolation: "worktree"` creates a real, registered
git worktree under `.claude/worktrees/agent-<id>/` (confirmed via `git
worktree list`). After the dispatch finishes and its commit is
cherry-picked/merged back onto the main branch, that directory is not
automatically cleaned up, and `.claude/worktrees/` is absent from
`.gitignore`. `git status` then reports it as an untracked path, and
`harness/scripts/verify.mjs`'s `VERIFY-CANDIDATE-PREFLIGHT` step treats ANY
untracked/tracked-dirty state as a hard refusal ("Commit or stash tracked
changes before Verify; no suite was started") — even though nothing about
the worktree directory is a real pending change, since its one commit is
already merged elsewhere.

## Triggering situation

GF-111 (`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs` fix),
2026-08-11: after cherry-picking commit `5f0af080` onto
`feat/sprint-nova-codex-v046` as `257444c8`, the first `node
harness/scripts/verify.mjs` run failed closed on the leftover
`.claude/worktrees/agent-a20201fc16911e472/` directory alone (no other
uncommitted change existed). Worked around this session by preserving the
dispatch's evidence file (`evidence/dispatch-record-GF-111.json`, copied out
first) and then `git worktree remove .claude/worktrees/agent-a20201fc16911e472`
before re-running Verify successfully.

## Affected artifact

`.gitignore` (missing a `.claude/worktrees/` entry) and/or whatever session
lifecycle step is supposed to clean up a finished worktree dispatch
(`plugins/pipeline-core/lib/session-cleanup-recovery.mjs`'s
scratch-descriptor lifecycle handles a similar cleanup class for scratch
files — worth checking whether it already has, or was meant to have, an
equivalent for Agent-tool worktrees before assuming this needs new code).

## Proposal

No fix attempted yet — filed as observed, per this session's own bounded
scope (registry/config work, not a new implementation task). Two candidate
directions, not mutually exclusive: (1) add `.claude/worktrees/` to
`.gitignore` so a leftover worktree directory never blocks Verify's
preflight even if cleanup is missed; (2) find or add an explicit cleanup step
that runs `git worktree remove` once a dispatched agent's commit has been
integrated, so the directory does not accumulate across a long session with
several worktree-isolated dispatches.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted (direction 1 only).
- **Rationale:** self-triaged in the same block that filed it, disclosed as such rather than left implicit — the PO is AFK and the standing instruction is to close bounded, non-judgment items directly. Direction (1) (`.gitignore` += `.claude/worktrees/`) has zero design latitude and was independently hit twice this same session (GF-111 and GF-112 both left a stray worktree directory; the second even survived a `git worktree remove` as an empty leftover, cleaned up by hand). Direction (2) (an explicit cleanup step) is NOT accepted here — it needs the `session-cleanup-recovery.mjs` investigation the Proposal itself flags as unresolved, which is design latitude out of scope for a mechanic-tier dispatch.
- **Assignment (if accepted):** immediate, this block (GF-113).
- **Date:** 2026-08-11
