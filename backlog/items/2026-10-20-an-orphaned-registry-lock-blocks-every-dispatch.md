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

## Not in this item

- **The retain itself.** `executeSourceOwnedSessionAuthorityDomainTransition` sets
  `retainDomainTransition` on any error, including errors before its first publication, where
  nothing partial exists. Narrowing it to a fault after the first publication is a separate
  change. With this item a retained lock no longer outlives its process: once the holder exits,
  its owner is gone and the next entry retires it.
- **A half-published transition** (a member republished, its producer record not yet saved)
  is not healed by D51 (1), which heals namespace drift only. After the lock is retired, the
  registry read refuses it with its own `SDC-AUTHORITY-CAS` reason, and `inspect` names
  `move-aside`, which works again because the lock is free.

## Progress (2026-10-20, Elephant under D51 (4)/D55, not yet reviewed)

- The boundary lock and the legacy control lock record their owner (schema v2) and share one
  acquisition, which retires a gone owner's lock under
  `session-authority-abandoned/<time>-<nonce>-registry-lock/` with a `retire.json`.
- `session-authority-repair.mjs` reads the lock without taking it: `inspect` reports it and
  names `wait`, `heal` or `release-lock` first; `release-lock` and `wait --timeout` are new
  verbs; a lock refusal carries owner, age and the repair.
- SAR08 covers a legacy lock, a gone owner (retired by the next dispatch), a live owner,
  `release-lock` and `wait`. It is red on e6fec04a0 and green here.

## Measurement (2026-10-20, throwaway clones, real hook scripts)

Driven by the background host-commit pin's fixture, with the lock file watched while each hook ran:

- Only `guard-dispatch` (the launch; it holds the lock about 10 s in the fixture) and
  `native-goldfish-host` (PostToolUse and SubagentStop) took the lock, and both released it, on
  `e6fec04a0` and on the candidate. One dispatch, two SubagentStops at nearly the same time, and an
  orchestrator commit before the stop left no lock. The child's own tool-call hooks stopped before
  the registry in the fixture (session readiness), so they are not measured.
- A launch hook killed while it holds the lock (SIGKILL, as at a host timeout or an interrupt) left
  the lock, and on `e6fec04a0` every later launch was refused `SDC-LOCK-HELD`: the PO's symptom. On
  the candidate the next launch retired the lock aside and was admitted. Pinned as case (vii) of
  `lib/pins/claude-background-goldfish-is-host-committed-at-subagent-stop.test.mjs`.
- So "the retain itself" (above, "Not in this item") is not the cause of the symptom: a retained
  lock outlives only its own process, which the next entry then retires. It is not narrowed.
- The PO's flow also set `run_in_background: false`, which the Goldfish template asked for.
  Claude Code launched asynchronously anyway, and the foreground route then completes nothing
  (`NGHF-PENDING-UNAVAILABLE`). The template now says to leave the key out (D19 SubagentStop route).
