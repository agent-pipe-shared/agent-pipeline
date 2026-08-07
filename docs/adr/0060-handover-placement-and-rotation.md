# ADR-0060: mid-task findings go into the handover file, because a fresh context is a Goldfish — and the handover therefore needs a rotation obligation it does not yet have

> Agent-Pipeline · Sprint Nova · as of 2026-08-07

**Status:** accepted for the placement rule, open for the rotation mechanism
(2026-08-07, PO instruction, chat) — *"state ist ja auch dafür gedacht. weil
eine neue session immer dumm ist und deine zwischendokumente nicht finden würde.
eins der agentischen entwicklungsprobleme: auch ein Elephant ist am Anfang ein
Goldfisch"* and, in the same exchange, *"state wird aber auch hoffentlich nicht
unendlich lang sondern irgendwann wieder leer :) wenn etwas dauerhaft als regel
geschrieben wird, dann muss es in adrs"*. **Extends**
[ADR-0012](0012-handover-canonicalization.md); **refines**
[ADR-0023](0023-elephant-context-diet.md).

## Context

[ADR-0012](0012-handover-canonicalization.md) established one versioned handover
file per project and made `docs/state.md` canonical on conflict. It also
established two deterministic close gates: merge completion, and a **CLAUDE.md**
length check for context economy. What it did not establish is any equivalent
obligation for the handover file itself, and the omission has compounded
silently: `docs/state.md` in this repository is now over 4,500 lines. Every
session reads it first, by mandate. Context economy was gated on the file that
grows slowly and left ungated on the file that grows every session.

Two separate questions have been running together, and the sessions that hit
them have been answering both by reflex rather than by rule.

**The placement question.** When something must be persisted mid-task — a held
finding, an intermediate decision, a fact discovered while a dependent process
is still running — where does it go? The intuitive answer is "its topical home":
a Critic verdict under `specs/*/evidence/`, a scratch note in the session
scratchpad, a design observation next to the design. The intuitive answer is
wrong, and the reason is a property of agentic development rather than of
documentation:

> A fresh session is a Goldfish. An Elephant is only an Elephant *after* it has
> read the handover.

Before that read, a new session has no recall, no index of what previous
sessions produced, and no reason to open any particular directory. A note in a
topically correct location that nothing points at is, operationally, a note that
was never written. The bootstrap mandates exactly one first read; anything
outside it depends on a future context independently deciding to look, which is
precisely the capability it does not have at that moment.

This is not hypothetical. The rule was stated by the PO after a session tried to
park held Critic findings in the session scratchpad — which failed for an
unrelated reason (`GUARD-CROSS-REPO-MUTATION` refuses writes outside the project
root; see `backlog/items/2026-08-07-session-scratchpad-is-unwritable-under-the-cross-repo-guard.md`)
and would have been the wrong location even had it succeeded.

**The retention question.** If everything mid-task lands in the handover, the
handover accumulates without bound, and the file every session must read first
becomes the largest context cost in the repository. The PO's constraint is that
`state.md` must eventually *empty again*, and that anything written there as a
**durable rule** does not belong there at all — it belongs in an ADR. That
splits handover content into two kinds with different lifetimes, which the
current file does not distinguish.

## Decision

**1. Mid-task persistence goes to `docs/state.md`, not to a scratch file, a side
document, or a topical directory.** The question to ask is never "where does
this belong topically" but "what will a context with no memory actually open".
`docs/state.md` is the only artifact the bootstrap mandates reading first, so it
is the only location with a guaranteed reader.

**2. Topical relocation is a follow-up, never a substitute.** Material parked in
the handover for reachability may later be moved to its proper home — a Critic
verdict to `specs/*/evidence/`, a design note to the spec. The move happens
after the reason for parking has expired, and the handover entry says where it
should go. What is forbidden is skipping step 1 and writing only to the topical
home.

**3. A durable rule is not handover content.** Anything written as a standing
rule — a policy, a convention, a constraint that applies beyond the current
block — is recorded as an ADR (or in the policy/guardrail file it belongs to)
and referenced from the handover, not stated in it. The handover records what is
*true right now*; an ADR records what is *always true*. A rule that lives only in
`state.md` is a rule that disappears the moment the handover is rotated, which is
the failure mode Decision 4 makes imminent.

**4. The handover carries a retention obligation.** Handover sections have a
lifetime: they exist to carry a specific context forward, and once the work they
describe is closed and its durable content has been extracted per Decision 3,
they are removable. `state.md` is expected to shrink at block and feature
boundaries, not only to grow. A handover that only ever grows is not a handover;
it is an append-only log wearing a handover's name.

**5. The concrete rotation mechanism is deliberately NOT decided here.** ADR-0012
solved the analogous problem for CLAUDE.md with a deterministic length gate in
the close ritual, which is one candidate shape. Others: archive closed sections
to a dated `docs/state-archive/` with the live file keeping only pointers; make
rotation part of `close-block`/`close-feature` rather than a length trigger;
or bound the file by *session count* rather than lines. Each has a different
failure mode, and picking one is a PO decision about how much history a fresh
session genuinely needs at bootstrap versus on demand. Tracked as
`backlog/items/2026-08-07-handover-file-has-no-rotation-obligation.md`.

Until that decision is made, Decisions 1–4 stand and the file keeps growing —
which is a stated, dated gap, not an oversight.

## Consequences

**Positive.** The placement rule removes a recurring judgment call and makes
mid-task persistence reliable rather than well-intentioned: a fresh session
finds held material because it is where the bootstrap already sends it.
Decision 3 stops the handover from becoming the de-facto ruleset, which is what
makes Decision 4 possible at all — a file full of load-bearing rules cannot be
rotated. Decision 1 also has a second, unplanned use already exercised: because
the Critic contract categorically forbids reading handover and state
([ADR-0014](0014-critic-contract.md), the fail-closed reference boundary),
`state.md` is the one location where a prior verdict can be parked without
contaminating a Critic round that is still running against the same candidate.

**Negative, and load-bearing.** Decision 1 accelerates exactly the growth
Decision 4 is meant to reverse, and Decision 5 leaves the reversal undecided.
This ADR therefore makes the immediate problem *worse* before it makes it
better, and does so knowingly: an unreachable note is a total loss, an
oversized handover is a cost. Trading a loss for a cost is the right direction,
but it is not free, and the bill comes due at bootstrap in every session until
Decision 5 is closed.

**Also negative.** Decision 3 requires judgment at the moment of writing — "is
this durable or is this current?" — and that judgment will sometimes be wrong in
the direction of leaving a rule in the handover. The rotation mechanism chosen
under Decision 5 should assume this and include an extraction step rather than a
pure deletion step, or rotation will silently destroy rules.

## Alternatives considered

**Keep parking mid-task material in the session scratchpad.** Rejected on the
PO's own reasoning before the guard question even arises: the scratchpad is
invisible to the next session by construction, and its path is
session-specific. Even a readable scratchpad would not be a handover.

**Write mid-task material only to its topical home and add a pointer line to
`state.md`.** Rejected as the default, kept as the eventual shape. It is
strictly better once the material is settled, and strictly worse while it is
not: a pointer to a file that a later session must decide to open reintroduces
the Goldfish problem for exactly the material that has not yet earned a stable
location. Decision 2 makes this the destination rather than the starting point.

**Solve retention first and placement second.** Rejected on sequencing: the
placement rule is settled by PO instruction and costs nothing to adopt now,
while the rotation mechanism needs a PO decision that is not available yet.
Blocking a settled rule on an unsettled one would have left both unwritten.
