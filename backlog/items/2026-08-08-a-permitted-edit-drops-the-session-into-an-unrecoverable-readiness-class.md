---
schema: pipeline.backlog-item.v1
id: pipeline.permitted-edit-drops-session-into-unrecoverable-readiness
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-08-15
source: "PO, 2026-08-08, unhappy-path transcript from a fresh Claude session on a greenfield project against the 0.5.4 local candidate. The session edited a bound PRD, lost session readiness, and could not act again until the human ran `sed -i`."
---

# A write the guard permits drops the session into a readiness class with no way back

## What happened

The session added one line to a PRD whose bytes were bound by a completed
kickoff promotion. The guard permitted the write. The continuity reader then
found the file's hash disagreeing with the recorded binding, and session
readiness became `continuity-observation-unavailable` — one of the controlling
non-ready statuses in
`plugins/pipeline-core/lib/project-onboarding-ready-gate.mjs:33`.

In that state the lifecycle guard refuses every write and nearly every shell
command. There is deliberately no human override for a readiness class; that
decision is correct and is not what this item disputes. What it disputes is the
combination:

- the write that produced the state was **admitted** by the same guard that then
  refuses everything;
- the state has **no agent-executable exit**;
- on a freshly onboarded repository there is **no commit**, so `git restore` does
  not exist either.

The only remaining exit was a human typing a `sed -i` line the agent composed.

## The asymmetry worth naming

The guard already refuses writes to protected State paths outright — a direct
edit of `pipeline-state.json` is met with a typed writer-owned refusal rather
than admitted and punished afterwards. The authority documents bound by a
promotion are protected by a hash check performed *later*, by a different
component, with no equivalent refusal at the moment of the write.

Same protection intent, two mechanisms, and only one of them can tell the agent
"not this file, use this route instead" while the action is still avoidable.

## Direction, not a design

1. **Refuse the write, do not detect it afterwards.** A write whose target is a
   currently bound authority document (the promoted PRD, its spec, its design
   input) is refused by the guard with a typed code, in the same family as the
   protected-State refusal.
2. **The refusal names the legitimate route.** There *is* a sanctioned way to
   change a bound document — the reviewed planning change and rebind. A refusal
   that only says "no" converts a solvable situation into a stop; one that names
   the rebind path keeps the agent moving. This is the load-bearing half: the
   goal is not to make the document unchangeable, it is to make the correct
   change discoverable at the moment the wrong one is attempted.
3. **Do not weaken the readiness class.** `continuity-observation-unavailable`
   staying non-liftable is right. Closing the entrance is the fix; widening the
   exit is not.
4. **Check what else reaches this class through an admitted action.** The
   observed instance came through an authority document. Whether other admitted
   writes can reach a controlling non-ready status is an open question this item
   does not answer, and it decides whether (1) is one rule or a family.
5. **Consider whether a greenfield repository should have a first commit.** Not
   proposed here, only recorded: every recovery argument in this repository
   assumes `git restore` exists, and immediately after onboarding it does not.
   That assumption is load-bearing in more places than this item.

## Related

- `2026-08-08-a-promotion-freezes-a-prd-the-po-gate-will-reject.md` — why the
  agent was editing a bound PRD in the first place. Fixing that removes the
  observed trigger; it does not close this hole.
- `2026-08-08-there-is-no-sanctioned-way-to-start-over.md` — what a session must
  do once it is in this state and no repair exists.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Accepted, directions 1 and 2 only — refuse the write on a
  currently bound authority document at write-time (typed refusal, same
  family as the protected-State refusal), and name the legitimate rebind
  route in that refusal. Directions 3 (do not weaken the readiness class)
  stands as a hard constraint on the fix, not separate work. Directions 4
  (sweep for other admitted-write paths into this class) and 5 (consider a
  first commit at onboarding) explicitly NOT taken up now.
- **Rationale:** PO, 2026-08-11: "1 & 2 (in einem späteren Sprint kommt eh CR
  Verfahren, daher reicht das)" — a future sprint brings a proper CR
  (code-review) process that will cover broader concerns like directions 4/5;
  investing further here now is not worth it.
- **Assignment (if accepted):** Unassigned — a bounded guard fix: extend the
  write-time refusal to cover currently-bound authority documents (the
  promoted PRD, its Spec, its design input), refusal message names the
  reviewed-planning-change-and-rebind route.
- **Date:** 2026-08-11
