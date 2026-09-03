---
schema: pipeline.backlog-item.v1
id: pipeline.documenting-the-maxturns-cliff-did-not-stop-dispatches-falling-off-it
type: defect
owner: pipeline
status: open
created: 2026-09-02
source: "Direct measurement, 2026-09-02 session: three Goldfish dispatches hit maxTurns in one block, one of them losing all of its work"
sprint: nova-b
done_when: contains templates/prompts/goldfish-task.md pipeline.maxturns-budget-direction-decided
---

# Documenting the `maxTurns` cliff did not stop dispatches falling off it — three more today, one a total loss

## Description

`pipeline.briefed-tool-budget-sits-below-an-unannounced-harness-maxturns-cliff`
was closed on 2026-08-25. Its remedy was documentary: `goldfish-task.md` field 6
now names `maxTurns` as a real harness cliff, states the per-tier values, and
instructs the dispatcher to scope base + closing allowance safely under it. That
text is in force and was followed in every briefing below.

It did not work. On 2026-09-02, three dispatches in one block hit the cliff:

| Task | Briefed base + closing | `maxTurns` | Tool uses | Outcome |
|---|---|---|---|---|
| `NVA-CIGREEN-1` | 45 + 5 | 80 | 57 | Defect A delivered; defect B undelivered, reverted before commit |
| `NVA-REBDEAD-1` | 55 + 5 | 80 | 80 | Cut off with the work complete but **uncommitted**; recovered only by a procedural resume |
| `NVA-REBDEAD-2` | 45 + 5 | 80 | 80 | **Total loss.** Clean tree, nothing committed, no artifact, one log line |

The third is the one that matters. It consumed roughly 193,000 tokens and
produced a dispatch record containing a single opening entry and an empty
`commits` array. Nothing else survives — no fix, no test, no capture, no
diagnosis of where it got to.

## Triggering situation

Measured from this session's own dispatches, not inferred. Two independent
mechanisms are visible and the closed item addresses neither.

**1. A budget an agent is told is not enforced is not a budget.** The template
says so in its own honesty note: "no automated per-subagent tool-call counter
exists (yet) ... stated as a duty you keep rather than overclaimed as something
that will be blocked." All three dispatches ran well past their briefed base cap
— 57 against 45, and twice 80 against 45 and 55. Documenting the cliff tells the
agent what happens if it overruns; it does not make the agent stop. The closed
item's own analysis said the two numbers were "the wrong way round"; they still
are, and now the soft number is simply ignored.

**2. The durability protocol that exists to make a truncation diagnosable was
not followed, and nothing checks that it was.** `goldfish-task.md` requires the
dispatch record's `log` to be appended AS entries land, and requires a
checkpoint after EVERY commit, precisely so that a run cut off mid-sentence is
still legible. `NVA-REBDEAD-2`'s record carries exactly one entry, written at
tool use 1, and its own note says the record was created late. A protocol whose
whole purpose is surviving truncation is itself the thing that did not survive.

Both were briefed explicitly in the failing dispatch. The briefing is therefore
not the missing piece.

## Affected artifact

- `templates/prompts/goldfish-task.md` field 6 — the tool-budget and
  report-durability sections
- `plugins/pipeline-core/agents/goldfish-deep.md` (`maxTurns: 80`) and the
  `goldfish-implementor`/`goldfish-mechanic` definitions
- `plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs` — reads the
  dispatch record but does not judge whether its `log` was maintained
- `backlog/items/2026-08-23-briefed-tool-budget-sits-below-an-unannounced-harness-maxturns-cliff.md`
  (closed; this item records that its remedy is insufficient, and does not
  reopen it)

## Proposal

Three directions, deliberately not ranked as one recommendation, because the
first is a real capability question and the other two are cheap.

1. **Make the budget enforceable, or stop calling it one.** A PreToolUse hook
   counting tool uses per dispatch and refusing past the briefed cap would turn
   the soft number into the hard one and make the harness cliff unreachable.
   Whether the runner exposes a stable per-subagent identity at that point is
   the open question; if it does not, the honest alternative is to delete the
   budget field rather than keep asking for a promise nothing can keep.
2. **Make the dispatcher's split the control instead.** Every one of today's
   three overruns was on a package with more than one independent concern.
   The one that lost everything carried four findings. A rule that a dispatch
   carries at most one concern, and that a multi-finding rework is split, moves
   the control to the side that can actually exercise it — the dispatcher, before
   the run starts, rather than the agent mid-run.
3. **Check the durability protocol mechanically.** `dispatch-authorship-verify`
   already reads the record. A record whose `outcome` is terminal while `log`
   holds fewer entries than `commits` — or a record left `in-progress` with an
   empty `commits` array — is detectable, and today's total loss would have been
   surfaced as a finding rather than discovered by reading the file by hand.

## Acceptance

1. Direction 1 is decided: either an enforcing counter exists, or the budget
   field is removed and the template says plainly that only `maxTurns` binds.
2. Whichever of directions 2 and 3 are accepted are implemented, with tests.
3. The closed predecessor item is annotated to point here, so a reader who
   finds it does not conclude the problem was solved on 2026-08-25.

### Predicate note, 2026-09-03 — anchored to criterion 1, not criterion 3

`done_when: contains templates/prompts/goldfish-task.md
pipeline.maxturns-budget-direction-decided`. Acceptance criterion 1
("Direction 1 is decided: either an enforcing counter exists, or the budget
field is removed and the template says plainly that only `maxTurns`
binds") is the load-bearing criterion: both of its branches force this
exact file to change — an enforcing counter falsifies the template's own
current honesty note ("no automated per-subagent tool-call counter exists
(yet)"), and removing the budget field edits the same tool-budget section.
Criterion 3 (annotating the closed 2026-08-23 predecessor item) was
considered and rejected as the anchor: it is independently satisfiable
without fixing anything the item is actually about, so it would be a weak
falsifier for this item's real ask. False today: the marker string does not
appear anywhere in `goldfish-task.md` (checked by direct grep before writing
this predicate), and Direction 1 remains undecided per this item's own
Proposal section. No `Decision:` value is set here; that choice belongs to
whoever triages this item next.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
