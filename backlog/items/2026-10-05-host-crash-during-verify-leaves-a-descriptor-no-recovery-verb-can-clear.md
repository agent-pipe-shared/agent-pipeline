---
schema: pipeline.backlog-item.v1
id: pipeline.host-crash-during-verify-leaves-a-descriptor-no-recovery-verb-can-clear
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Incident 2026-10-05 morning (Alfred session): ALFRED-BACKLOG-20261005 defect 14."
sprint: alfred
done_when: manual
---

# Host crash during a full Verify leaves a session descriptor that no recovery verb can clear

## Description

A host crash during a full Verify left a session descriptor (status `unavailable`, owner unobservable on win32) that carried resources. `plan-human-recovery` offered only `retain-and-observe`, and `plan-archive-orphan` refused it with `WT-ORPHAN-ARCHIVE-AUTHORITY`. The session stayed `partial` with `cleanup_recovery_required`, and the PO had to move the descriptor by hand: a dead end against the "no dead end" requirement.

## Triggering situation

Two occurrences on 2026-10-04/05 (second after the PC crashed mid-Verify). The readiness root fix (commit 5b45e9c90: foreign descriptors only warn, Verify keeps its own run record) addresses the lock; a host crash cannot be covered by Verify retiring its own descriptor on exit.

## Affected artifact

`plugins/pipeline-core/scripts/session-cleanup.mjs`, readiness evaluation, Verify run record.

## Proposal

Kept as a verification item, not new work: after install, simulate a crash (kill Verify mid-run) and confirm readiness stays `ready` with a warning, and that a typed archive route exists for an orphaned descriptor with resources whose owner is unobservable and older than the session.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted as new work, not only a verification item (PO D70, 2026-10-20).
- **Rationale:** K1 measurement 4 (`specs/sprint-alfred-epic/plans/full-verify-correction-plan-2026-10-20.md`)
  showed by code reading and by the suites that `release-lost-binding` and
  `retire-orphans-release-lost-binding` refuse after a host crash: the release accepts only a live bound
  requester or an owner invocation retained in the same process, and both are gone. That is the dead end
  this item describes.
- **Assignment (if accepted):** sprint alfred, 0.7.0 candidate: a recovery context for a lost or retired
  descriptor's binding (goldfish-deep, Critic batch with the security read); the session-cleanup
  fixtures (K1c) and an owner option on the controlled-method fixture builder.
- **Date:** 2026-10-20
