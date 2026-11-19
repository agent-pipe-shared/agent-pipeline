---
schema: "pipeline.backlog-item.v1"
id: "pipeline.split-a-very-large-initial-requirement-into-sequenced-epics"
type: "requirement"
owner: "pipeline"
status: "open"
created: "2026-11-19"
source: "PO ruling 2026-11-19 (candidate 32 session), raised from a greenfield run in which one very large initial requirement was cut into several epics by hand"
sprint: "nightwing"
done_when: manual
---

# A very large initial requirement is split into sequenced epics under one architecture, not reopened per epic

## Description

When a user hands the Pipeline a very large initial requirement package, the Pipeline works in `epic` mode but treats the whole package as one PRD and one Spec. Nothing helps the user decide whether the package should be cut into several separate blocks, each with its own PRD/Spec round and its own slices, worked off one theme after the other. PO ruling (2026-11-19): this belongs to the 0.7.1 window (Nightwing), not to 0.7.0.

## Triggering situation

In a greenfield-style run the very large requirement was split into several epics anyway, but all of them stayed parts of the same PRD and Spec. After epic 1 was delivered the system had to go back, reopen the PRD and Spec for epic 2 and adapt them again. The approval ceremonies, the readiness review and the design binding were then repeated against a document that already described work that was delivered or not yet started.

## Affected artifact

The kickoff and design intake (`kickoff-design.md`, `design-course.md`), the PRD/Spec templates, the plan/phase state of the active feature, the architecture map and design review, and the close of a feature that is one part of a larger set. No ADR yet; the first step of the work is the ADR that decides the model.

## Proposal

Offer a sequencing mode for an oversized initial requirement, decided with the user rather than imposed:

1. **Size signal and proposal.** At intake the Pipeline recognizes a package too large for one PRD/Spec round, proposes a split into separate blocks by theme and asks the user to confirm, change or refuse it. Refusing keeps today's single-epic behaviour.
2. **One architecture analysis first.** Before the split, one continuous architecture analysis and specification covers the whole package: the modules, their boundaries and the allowed dependencies. It is a starting position that later blocks may amend, not a frozen design.
3. **A PRD/Spec round per block.** Each block gets its own PRD, Spec and slices under that shared architecture, and only one block is worked at a time. A later block opens its own documents instead of reopening the finished one, so a delivered block is never edited to make room for the next.
4. **Amending the shared architecture.** A later block may change modules or boundaries; the change is a recorded amendment to the shared analysis with its own review, not a silent edit.
5. **Status across blocks.** The state shows the set of blocks, which one is active, which are delivered and which are waiting, and a close of one block never reads as the close of the whole requirement.

Open questions for the design: how blocks are identified in State and in the audit trail, whether the shared architecture is a design package of its own or the first block's, how a block that turns out to belong to an earlier one is handled, and how the size signal is measured without becoming a hard limit.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
