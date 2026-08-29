---
schema: pipeline.backlog-item.v1
id: pipeline.workflow-tool-isolation-worktree-never-created-a-worktree-this-session
type: defect
owner: pipeline
status: open
created: 2026-08-25
sprint: nova
source: "Elephant, 2026-08-25, live incident this session: three parallel Agent-tool dispatches with isolation: \"worktree\" all wrote into the SAME shared checkout, causing zero-commit truncations and a detached-HEAD incident; root-caused and recovered same session"
done_when: manual
---

# `isolation: "worktree"` (Agent tool) did not create separate worktrees this session — three parallel dispatches raced on one shared checkout

## Description

Three Goldfish dispatches (AGY-PRDGATE-1, AGY-HGOGWM-1, AGY-PUSHDEFAULT-1)
were launched in parallel via the Agent tool, each with `isolation:
"worktree"` in the tool call, and each briefing carrying the mandatory
CLAUDE.md self-heal block (check `git rev-parse HEAD` against an expected
SHA; on mismatch, `git checkout --detach <sha>`).

`git worktree list`, run immediately after the launch per CLAUDE.md's own
instruction ("After launching any worktree-isolated dispatch, still run
`git worktree list` immediately"), showed only the single main worktree —
checked twice across the incident, never more than one entry. No separate
worktree was ever provisioned for any of the three dispatches. All three
edited files directly in the Elephant's own shared checkout.

## Consequences observed

1. **All three dispatches truncated at the harness `maxTurns: 50` cliff with
   ZERO commits.** Not simple slowness: each was implicitly racing the
   others for the same working tree, and `dispatch-authorship-verify`-style
   commit-then-checkpoint discipline never got a chance to fire because no
   dispatch reached a stable point to commit from without another dispatch's
   concurrent edits also being present in the same tree.
2. **A detached HEAD incident.** A retry dispatch's self-heal step (written
   for the case where its OWN isolated worktree's HEAD might be stale)
   instead ran `git checkout --detach <sha>` in the Elephant's shared
   checkout, detaching the Elephant's own HEAD mid-session. The self-heal
   block's premise — "the worktree shares this repo's object database, so
   this SHA is already present locally, safe because the fresh worktree has
   no work of its own yet" — assumes a FRESH, otherwise-empty worktree; it
   is not safe to run against a checkout that has other live, uncommitted
   work in it, which is exactly what a shared (non-isolated) checkout is by
   definition.
3. **A `fork`-type subagent (used to resume a truncated dispatch via
   SendMessage) launched two FURTHER, unplanned dispatches on its own
   initiative** ("Part A, split retry" / "Part B, split retry"), most likely
   because a fork inherits the full parent conversation context AND the
   parent's full toolset (including the Agent tool), and the fork call in
   question was given a garbage placeholder prompt (`Agent` was called with
   `subagent_type: "fork"` and `prompt: "placeholder"` by operator error) —
   with no concrete instruction, it appears to have acted on inherited
   context describing an intended HGO/GWM split, launching that split
   itself. This compounded the shared-checkout race further.

Recovery (same session): all six live/rogue dispatches stopped
(`TaskStop`); the git DAG was reconstructed by hand (`sprint_agy` branch was
never lost — `checkout --detach` does not move a branch ref); one genuinely
complete, tested piece of work was cherry-picked onto `sprint_agy`; a second
complete, tested piece of work sitting uncommitted in the shared working
tree was reviewed and committed; a third, incomplete piece of work (passed
review but broke 12 pre-existing tests, no CLI wiring) was reverted rather
than committed. No work was silently lost, but recovery cost a large fraction
of the session.

## Impact

`isolation: "worktree"` cannot currently be trusted to actually isolate a
dispatch in this environment/session type. Any briefing that assumes real
isolation — in particular a self-heal step that runs `git checkout
--detach` — is unsafe to hand to a dispatch running in what turns out to be
the shared checkout, because the detach lands on the dispatcher's own HEAD,
not a disposable one.

## Proposal

1. **Before relying on `isolation: "worktree"` again in this environment,
   verify it actually works** with a single, low-stakes dispatch and confirm
   via `git worktree list` that a SECOND entry actually appears — not just
   "run the check," but treat a single-entry result as a hard stop condition
   for further worktree-isolated dispatches this session, not a note to
   move past (CLAUDE.md already says to run the check; it does not yet say
   what to do when the check fails).
2. **Until worktree isolation is confirmed working, parallel dispatches into
   the same repository must be serialized** rather than launched
   concurrently via the Agent tool — this directly trades off against a PO
   preference for parallelism, and should be surfaced to the PO as a
   real constraint rather than silently worked around.
3. Consider whether the self-heal block itself should detect "am I actually
   in a distinct worktree" (e.g. compare `git rev-parse --show-toplevel`
   against a path the dispatcher provides) before ever running `checkout
   --detach`, so a misconfigured non-isolated dispatch fails closed instead
   of detaching a shared checkout's HEAD.
4. Investigate why `isolation: "worktree"` silently produced no worktree at
   all rather than an error — a silent no-op here is strictly worse than a
   loud failure, since nothing signaled the dispatcher that isolation had
   not actually been granted.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred
- **Rationale:** root-caused and recovered from within this session; the
  underlying "why does isolation: worktree no-op here" question needs
  investigation this session did not have budget left for after recovery.
  Filed so the next session does not re-discover this the same expensive
  way.
- **Assignment (if accepted):** next available slot — this affects any
  future parallel dispatch in this repository, not scoped to one sprint.
- **Date:** 2026-08-25

### Predicate note, 2026-08-29 — a paragraph in CLAUDE.md is not the remedy

A predicate of the form `contains CLAUDE.md "containment check performed
BEFORE"` was briefly declared here and reported satisfied. It has been
replaced with `manual`, because it measured the wrong thing.

That CLAUDE.md text is real and it is useful: it tells a dispatch to compare
its own `git rev-parse --show-toplevel` against the briefed worktree path
before running any `checkout --detach`, and it tells the dispatcher to run
`git worktree list` immediately after launching. Both were written after a
worktree-isolated dispatch detached a live session HEAD. But it is instruction
text, and this repository's own operating principle is that a rule agents keep
violating needs a guard, not another paragraph of prompt. Nothing mechanically
checks that the instruction was followed, and nothing at all detects the
original defect — that `isolation: "worktree"` was requested and silently not
granted.

Treating the paragraph as the remedy would have closed this item while the
failure mode remained fully live, which is the precise drift the `done_when`
field exists to catch. It is `manual` until a mechanical detection step exists
— the honest candidate being a post-launch check that compares the worktree
count against its own pre-launch baseline, since an unchanged count is the
observable signal that isolation was not granted. Presence alone is not that
signal: roughly two dozen abandoned worktrees from earlier runs are already
registered in this repository, so "a worktree exists" is true whether or not
this dispatch got one.
