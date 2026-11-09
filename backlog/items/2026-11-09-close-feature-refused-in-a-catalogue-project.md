---
schema: pipeline.backlog-item.v1
id: pipeline.close-feature-refused-in-a-catalogue-project
type: defect
owner: pipeline
status: open
created: 2026-11-09
source: live Claude greenfield close on native Windows, build 0.7.0+claude.20261109080736.4b9add3, reported by the PO on 2026-11-09
sprint: alfred
done_when: manual
---

# close-feature is refused in every project that holds a session-authority catalogue

## Description

`finish-feature` stopped at `FINISH-CLOSE: SDC-AUTHORITY-UNAVAILABLE: companion-owning-lifecycle-context-required` after Critic and Verify had passed. This is not a path or Windows defect. `close-feature` is a State companion entry, so with a catalogue present it needs an owning lifecycle context, and no production route supplies one: the owner route refuses the entry (`COR-CLOSE-FEATURE-UNAVAILABLE`), and only the controlled-unit-method fixture retains an owner invocation. The native Goldfish route creates the catalogue on its first governed item, which is why the Claude run hit this.

## Decision taken for candidate 21f, open for the PO

Candidate 21f admits `close-feature` on the existing PF-54 direct route (D51 (1)) when it carries the coordinator binding and no bound member of a State producer is armed or running. The writer still proves phase, digest, audit and Continuity. A call without the binding keeps the refusal. The Elephant chose this narrow route without a tile because the Claude run was blocked, and it extends the PO's PF-54 decision to a further entry. The PO confirms or rejects it by applying the held chain or not.

The owner-route slice stays open for 0.7.1 or later: retiring the per-invocation owner descriptor before the entry runs, a retired terminal for a physical-readback requester (`retiredOwnerTerminalObservation` uses a POSIX process observation), and an `ownerRouteCourse` that survives the removal of `activeFeature`.

## Further findings from the same close

| ID | Finding | Status |
| --- | --- | --- |
| CFC-1 | `close-feature` refused in a catalogue project. | built-c21f; the real close chain is walked with a catalogue up to the push boundary in `close-path-e2e.test.mjs` |
| CFC-2 | `VEP-CVL-CARRY-RANGE`: after a close stop the agent committed the close outputs in two commits, the per-commit classification failed (`CCA-EVIDENCE-READ`, `CCA-SOURCE-SHAPE`), the guard refused a reset and the PO ran `git reset --hard` by hand. | open: a rule for close outputs after a stop |
| CFC-3 | `CLOSE-CRITIC-EVIDENCE-MISSING`: a later Critic round invalidates the addenda of earlier rounds, `dispatch-record-write.mjs` writes exclusively, no route replaces them, and the PO moved 16 files by hand. | open: supersede route, or coverage over the connected course |
| CFC-4 | The close skill named an "attended close" that does not exist. | built-c21f |
| CFC-5 | A negative check in a chores test of the run flaked once, reported by the run itself. | open, unmeasured |
| CFC-6 | Regression of candidate 21f: `GUARD-FEATURE-PACKAGE-HAND-EDIT` also ran at the commit boundary, so the commit-msg hook refused the close writer's own `lifecycle.json` at `completed`. A hand rewind reads an earlier state there, so that lane could only ever hit writer output. The fixture walks commit without hooks, which is why the walk stayed green. | built-c21g: the refusal stays on the edit lanes, a real commit-hook case and a staged-policy check over the close's real output pin it |

## Open evidence

The fix is proven on Linux with real commands up to `push-prepare`. Native Windows proof and the resumed close of the live run are outstanding. A chat-mode push approval stays refused in a catalogue project by PO decision K52; the signature route is covered by `pipeline-state-push-anchor.test.mjs`.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** the PO asked on 2026-11-09 for a fix so the Claude run can finish its close and push.
- **Assignment (if accepted):** candidate 21f for CFC-1 and CFC-4, candidate 21g for CFC-2 and CFC-3.
- **Date:** 2026-11-09
