---
schema: pipeline.backlog-item.v1
id: pipeline.authority-gate-verdict-need-not-survive-checkout
type: defect
owner: pipeline
status: open
created: 2026-08-08
sprint: alfred
due: 2026-08-22
source: "Observed by the Phoenix session of 2026-08-08, which caught it in its own work; generalised and verified against the source here."
done_when: manual
---

# The authority gate reads the worktree, so a green verdict need not survive a checkout

## What happened

A session renamed a PRD file with `git mv`, which stages a deletion and an
addition. It then committed with an explicit path list naming only the new paths.
On disk the result was correct — exactly one `prd_*.md` — and the PO gate's PRD
cardinality check was satisfied. In `HEAD` the second PRD file was still present.

A fresh checkout of that commit would therefore have failed the same gate, and
nothing in the session would have gone red. The session caught it by running
`git ls-files` on its own initiative and committed the removal separately.

## The general shape

The authority surface reads physical files. The source says so in its own field:
`plugins/pipeline-core/scripts/pipeline-state.mjs:4047` marks the candidate
`provenance: "current-physical-worktree"`.

That is a defensible choice — authority must be checkable before anything is
committed. The gap is that nothing anywhere states the consequence: **a gate
verdict is a statement about the worktree, and it silently stops being true of the
repository the moment the two diverge.** Authority is then recorded, approvals are
bound to it, and the divergence is discovered by whoever next clones.

Partial-staging is only the cheapest way to produce the divergence. An untracked
PRD, a `.gitignore`d authority file, or an interrupted merge produce the same
class.

## Why it is worth an item, given nothing broke

Nothing broke because a careful operator checked. That is the argument for the
item, not against it: the safety property was supplied by the human, and the class
is invisible by construction — a green gate is exactly what a wrong state looks
like here.

The cost is also asymmetric. On disk the mistake is a one-line fix; discovered
after an approval has been bound to that authority, it is an authority repair.

## Direction, not a design

1. **Decide whether the gate should compare at all.** The cheapest honest version
   is a warning when the authority paths differ between worktree and `HEAD` — not
   a refusal, since pre-commit checking is the point of reading the worktree.
2. **If a check is added, make it name the difference**, not merely report a
   divergence: which authority path is present in one and not the other.
3. **State the semantics regardless of whether a check is built.** The
   `provenance` field already carries the fact; the documentation around the gate
   does not carry its consequence.
4. **Consider the same question for the PRD cardinality check specifically**,
   since that is the one a partial stage can flip without any file appearing
   wrong.

## Triggering situation

Any session that stages a subset of a rename or otherwise commits a partial view
of the authority directory. Runner-independent and platform-independent.

## Related

- `2026-08-08-the-authority-decision-offers-two-candidates-and-one-of-them-is-a-literal.md`
  — same session, same authority surface.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred — owned by Sprint Alfred.
- **Rationale:** an authority verdict that need not survive a checkout is a
  control-integrity gap — Sprint Alfred's confirmed scope
  (`docs/adr/0043-post-go-live-sprint-model.md`'s 2026-08-17 amendment).
  Nothing broke in practice (a careful operator caught it), and the item's
  own Direction section is real design work (decide whether to compare at
  all, name the divergence, document the semantics) rather than a quick fix.
- **Assignment (if accepted):** next available Alfred slot.
- **Date:** 2026-08-17
