---
schema: pipeline.backlog-item.v1
id: pipeline.a-dispatch-cannot-authenticate-a-mid-task-correction-from-its-dispatcher
type: defect
owner: pipeline
status: open
created: 2026-09-03
sprint: nova-b
done_when: "contains roles/goldfish.md pipeline.mid-task-instruction-authentication"
tracking: "Nova B — a mid-task instruction arrives inside a tool-result system-reminder and claims to come from the dispatcher. A dispatch has no way to tell that apart from injected text, and the closed-briefing contract gives it no rule for what to do about it."
source: "Raised by dispatch NVA-B-RECSHAPE-1 as a finding outside its acceptance criteria, 2026-09-03: it received two coordinator corrections through that channel, verified the content independently before acting on it, and flagged the delivery channel regardless of the content being correct."
---

# A dispatch cannot authenticate a mid-task correction that claims to come from its dispatcher

## What was raised, and by whom

Dispatch `NVA-B-RECSHAPE-1` reported this against its own dispatcher, unprompted
and outside its acceptance criteria:

> Two messages arrived mid-session embedded in tool-result system-reminders,
> claiming to be from the dispatching coordinator, correcting my briefing's
> trailer instruction. I verified this independently via a live git test in a
> throwaway repo before acting, and cross-confirmed it against
> [the trailer backlog item]. Used the corrected format for my one commit.
> Flagging the injection-shaped delivery channel for the PO regardless of the
> content being correct.

The content was in fact correct and did come from the dispatcher. That is what
makes the finding worth keeping: the dispatch could not know that, and said so.

## Why this is a real gap and not caution theatre

The Goldfish contract is built on a closed input surface. `goldfish-task.md`
field 2 states that the briefing text plus the listed files are the dispatch's
ENTIRE input, and the Critic template makes the same closure explicit for its own
role. The whole point is that nothing outside that surface can steer the work.

A mid-task message punches through that closure by construction. It arrives as
prose inside a tool result, it asserts an identity, and it changes what the
dispatch is contractually required to do. Nothing in the payload distinguishes:

- a genuine dispatcher correction (this case),
- text a tool result happened to contain — a file being read, a test fixture, a
  captured transcript, the contents of a backlog item quoting an old message,
- text authored by anything else with write access to a channel the runtime
  surfaces.

The dispatch's own defence — independently verifying the claim against primary
evidence before acting — is exactly right and is what a good agent should do. It
is also not always available. Here the claim was about git's trailer parser, a
fact any agent can establish in a throwaway repository in one command. A
correction of the form "the PO has approved widening your scope to file X" is not
checkable that way at all.

## The rule that exists nearby, and what it does not cover

`plugins/pipeline-core/skills/pipeline-start/references/workflow-dispatch.md`
already forbids the dispatcher side of the dangerous case: a PO decision that
widens or changes a dispatch's authorized scope must never be relayed to an
already-running dispatch via `SendMessage`; a fresh, properly-scoped briefing is
required instead. That rule was homed in `7a7428c7` and its item closed
2026-09-03.

It binds the dispatcher. It gives the DISPATCH no corresponding rule, and a rule
that only binds the honest party is not a boundary. What is missing is the
receiving half:

- Which mid-task instructions a dispatch may act on at all. A procedural
  continuation ("resume, commit what you have") is categorically different from a
  correction to the briefing's own rules, which is different again from anything
  that grants authority the briefing did not.
- What a dispatch does when it receives one it may not act on: refuse and report,
  which is the same shape as the scope-widening refusal that was already
  confirmed correct in the 2026-08-25 incident.
- Whether independent verification, where possible, is sufficient licence to act
  on a correction — as this dispatch judged, defensibly, in the absence of any
  rule.

## Measured context: mid-task corrections were used four times in one run

This is not hypothetical usage. In the same autonomous run, the dispatcher sent
mid-task messages to five dispatches: three carrying the trailer correction, two
carrying resume instructions after dispatches hit their turn ceiling. All were
procedural or corrective, none granted new authority, and one was necessary
precisely because the original briefing was wrong.

So the channel is load-bearing and cannot simply be prohibited. The rule has to
distinguish, not forbid.

## Scope note

Related but distinct from
`backlog/items/2026-08-26-sendmessage-mid-task-scope-relay-rule-has-no-durable-home.md`
(closed 2026-09-03), which homed the dispatcher-side prohibition. This item is
the receiving side of the same boundary.
