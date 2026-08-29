---
schema: pipeline.backlog-item.v1
id: pipeline.delivery-is-not-always-a-git-push
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-28
sprint: batman
tracking: "Batman (PO decision 2026-08-29) — gate model extension to cover non-agent-invoked deploys, scheduled for Batman, not blocking the Nova/0.6.0 candidate"
source: "PO, 2026-08-28: some repositories barely push at all — live deployment runs by other routes, e.g. a Visual Studio build process, or SSH deployment straight onto the Home Assistant server."
done_when: manual
---

# The release model assumes delivery is a `git push`, and for several repositories it is not

## The observation

The Pipeline's whole outward-facing control surface is built around `git push`: the push
gate, the approval ceremony, the signature, the threat model, the candidate binding. That
is the right control point when pushing IS shipping.

The PO has repositories where it is not. Delivery happens through a Visual Studio build
process, or an SSH deployment straight onto the Home Assistant server. In those projects a
push may be routine and low-stakes, while the act that is actually irreversible and
outward-facing — the deploy — happens on a path the Pipeline never sees and does not gate.

## Why this is worth a decision rather than a patch

Two failure modes, in opposite directions, and both are live today:

- **Ceremony where it does not belong.** A repository whose push is a private backup gets
  the full signature ceremony for an act with no external consequence. That is friction
  the project did not need, and friction is what makes a human route around the gate.
- **No ceremony where it does belong.** The deploy that actually reaches a running system
  passes no gate at all. The Pipeline reports a project as governed while its real
  delivery act is ungoverned.

The second is the serious one. A governance model that names the wrong act as the
consequential one is not merely incomplete; it is reassuring about something it never
checked.

## Direction, to be decided rather than assumed

The manifest already has the vocabulary: `critical-human-proof` declares `requiredKinds`,
and `deploy` and `publication` are already kinds the approval machinery knows. What does
not exist is a way for a project to say "my delivery act is a deploy, invoked like THIS,
and that is what needs the gate" — nor any way for the Pipeline to observe that such a
deploy happened.

Open questions worth answering before designing anything:

- Can a deploy be gated at all when it is invoked from outside the agent's reach (a human
  pressing build in an IDE)? If not, is the honest answer a declared, visible
  "ungoverned delivery path" rather than a pretend gate?
- Is the push gate's strength reducible per project when push is genuinely not delivery,
  without that becoming a general escape hatch?
- Does the threat model artifact still make sense bound to a commit, or does it need to
  bind to a deploy target?

## Acceptance criteria

- A project can declare what its delivery act actually is, and the Pipeline's reporting
  reflects whether that act is gated or explicitly not.
- No project is described as governed on the basis of a gate that does not sit on its real
  delivery path.
- Whatever is decided is written down as an ADR, because it changes what the push gate
  means rather than only how it is configured.

## PO decision, 2026-08-29

**Decision:** extend the gate model to cover non-agent-invoked deploys — but
not now. Scheduled for the Batman sprint (optional capabilities), not Nova.
**Rationale:** PO confirmed the governance gap is real and worth closing
(not the "push-only, document the rest as ungoverned" alternative), but
explicitly deferred the actual design/implementation work to a later sprint
rather than doing it now.
**How to apply:** repoint `sprint: nova` to `sprint: batman` (or leave `nova`
with an explicit note if this repo's convention doesn't reassign sprint on a
scheduling decision — check `backlog/README.md`'s convention before editing
the frontmatter field). Write the ADR this item's own Acceptance criterion 3
requires once Batman picks this up — not before, since the direction chosen
here is "extend," not "document as ungoverned," so the ADR content itself
depends on that future design work.
