---
schema: pipeline.backlog-item.v1
id: pipeline.an-orphaned-registry-lock-blocks-every-dispatch
type: defect
owner: pipeline
status: open
created: 2026-10-20
source: "PO report scratch/pipeline-feedback-03.md, finding PF-55 (named FB3-PF-55 here, D56); PO again 2026-10-20: blocked hard by registry.lock, no repair, recovered only by moving the file by hand"
sprint: none
done_when: manual
---

# An orphaned registry lock blocks every dispatch and its own repair

## Description

On `0.7.0+claude.20261019205354.d99774b`, after several background dispatches (up to three at
once, two returns close together), `guard-dispatch` refuses every next dispatch with
`SDC-LOCK-HELD: registry-lock-held`. `session-authority-repair.mjs inspect` names
`move-aside --no-goldfish-running`, but `heal` and that `move-aside` refuse themselves with
`SAR-LOCK-HELD`. No Pipeline process runs. It stayed so for hours and about 30 retries. On
2026-10-20 it happened again; the PO recovered only by moving
`.git/agent-pipeline/session-authority/registry.lock` aside by hand in a terminal.

Causes, read from `lib/session-authority-registry.mjs`:

- **The lock names no owner.** `withSessionAuthorityBoundary` and the legacy control lock
  create `registry.lock` with `O_EXCL` and write only a schema, the repository digest and a
  nonce. No process id, process identity or time, so nothing can tell a live lock from a dead
  one.
- **A failed domain transition keeps the lock on purpose.** `retainDomainTransition` (set by
  `executeSourceOwnedSessionAuthorityDomainTransition` on any error and by a committed native
  publication) makes the boundary's `finally` throw
  `domain-transition-partial-effect-retained` and leave the lock behind. Nothing ever clears it
  ("a retained lock cannot be recovered in-process", `lib/model-family-host-store.test.mjs`
  E33). A process killed while it holds the lock, for example a hook at its host timeout,
  leaves it the same way.
- **Every repair needs the lock it is meant to repair.** `heal` and `move-aside` enter the
  same boundary, so they refuse `SAR-LOCK-HELD`, and the refusal says only "retry once it
  finished".
- **No wait route** (report PF-56, FB3-PF-56): a shell wait loop is refused by the guard, and
  the Pipeline offers no bounded wait, so a goal loop retries without progress.

## Acceptance

- A new lock records its owner: pid, process identity (Linux `boot_id:start-ticks`), a host
  digest and the acquisition time.
- Entering the boundary over a lock whose recorded owner is provably gone (no such process,
  another boot, or a reused pid with a different start time on the same host) retires the lock
  automatically: it is moved aside under `.git/agent-pipeline/session-authority-abandoned/`
  (retained, never deleted) and the boundary is entered. The registry's own reads then check
  consistency: drift heals under D51 (1), and a bound in-flight member keeps its typed refusal.
- A lock whose owner cannot be judged (no owner recorded, another host, unreadable) refuses
  `SDC-LOCK-HELD` naming the lock's age, its owner where recorded, and the repair
  `session-authority-repair.mjs release-lock --no-pipeline-running --reason "<why>"`.
- A lock whose owner is alive refuses naming the owner pid and age and
  `session-authority-repair.mjs wait --timeout <seconds>`.
- `release-lock` needs no registry lock: it refuses only a provably live owner, moves the lock
  aside atomically with a compare on its bytes, and never removes a lock created after it read
  one.
- `wait --timeout <seconds>` (bounded) returns once the lock is free or its owner is gone, or
  reports the timeout with owner and age.
- `inspect` names `wait` or `release-lock` for a held lock, never a repair that needs the lock.
- Tests cover a dead-owner lock, a legacy lock without owner, a live-owner lock, `release-lock`
  and `wait`, and that the boundary still works after each.
