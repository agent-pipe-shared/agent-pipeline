---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield.r2.concurrent-hooks-refuse-dispatch-on-registry-lock
type: bug
owner: pipeline
status: open
created: 2026-10-26
priority: P0
release: 0.7.0
source: "Live Claude Elephant session on the WSL PC, 2026-10-26"
done_when: manual
---

# Every governed dispatch is refused with SDC-LOCK-HELD while no other Pipeline work runs

Observed live on 2026-10-26. Six consecutive launches of two different
generated Goldfish briefings (different items, different criteria) were
refused by `guard-dispatch` with
`SDC-LOCK-HELD: version 2 native host binding failed before launch`. Only the
second refusal carried a reason (`registry-lock-held`, held by a running
Pipeline process for 2 s, longer than the 1500 ms bounded wait); the other five
carried no reason line. `session-authority-repair.mjs inspect` before and after
the attempts read `lock: absent`, `wait` returned `lock-free` immediately, and
no test run or other Goldfish process was alive. Earlier the same session had
launched about twenty such dispatches without this refusal. The condition is
deterministic, not intermittent: the session can no longer dispatch any
governed Goldfish.

## What the Source shows (reading, not a reproduction)

- `prepareNativeGoldfishHostState` retries `SDC-LOCK-HELD` for up to 10 s, but
  only when the refusal is raised before its callback entered
  (`retryWhileSessionAuthorityLockHeld`, `lib/native-goldfish-host-state.mjs`).
  A deterministic refusal therefore comes from inside the boundary.
- Inside `withSessionAuthorityBoundary` (`lib/session-authority-registry.mjs`)
  three paths raise the code without a reason surfaced to the hook:
  `registry-lock-ownership-changed`, `domain-transition-partial-effect-retained`,
  and `registryClosure` meeting `registry.lock` with an active boundary whose
  repository does not equal the reader's.
- `guard-dispatch` prints `prepared.reason` only when present, so the deciding
  path is invisible to the operator.
- `inspect` lists 20 `native-goldfish` reservations of this session as in-flight
  although every one is settled (cancelled or integrated-by-commit), and
  returns `next: []`.

Which of the three paths fires is not yet established. Strongest lead: the
last launch that was admitted (W3-R2-IDENTITY-ACTOR-C4) was the first whose
PostToolUse reported `NGHF-PENDING-UNAVAILABLE` (no pending host-commit state),
and `inspect` lists no reservation for it although every earlier launch has
one. Every launch after it was refused. That fits a domain transition left
partially applied by that launch (`domain-transition-partial-effect-retained`),
which later boundaries then refuse without a surfaced reason.

## Repair attempt under PO option (b), 2026-10-26

`inspect` then read the lock as held by a dead owner (pid 1657066, acquired 01:32Z, about
4.9 h old), although earlier reads had shown it absent. `heal` retired it (lock absent,
registry readable). The next launch was still refused `SDC-LOCK-HELD` without a reason.
`move-aside --no-goldfish-running` archived the registry (all 20 reservations settled, no
worker running); the next launch was again refused the same way. A standalone replay of
`prepareNativeGoldfishHostState` with the identical briefing and no sibling hooks returned
`SDC-AUTHORITY-UNAVAILABLE: item-course-requester-unavailable` instead (the session's owner
association left with the archived registry). The hook path therefore refuses for a cause
the standalone path does not reach; the surfaced code hides it. A consumer report shows the
same class (report 05, PF-62 and PF-67).

## Root cause (measured 2026-10-26, after D159)

Not the registry lock. A replay with the hook's own session owner showed custody refusing
"preexisting manifest lock cannot be reclaimed by custody" for
`session-cleanup/active/claude-<session>.json.lock`, left at 00:58:49 by the C4 launch's hook
process (pid gone). Custody never reclaims, and the worktree error carries no `reason`, so the
hook printed none. The lock was retired once under D159 (kept aside) and dispatch resumed.
Durable fix as held patch `p0-session-cleanup-lock-recovery.patch` (inspect names the lock,
heal retires a dead writer's lock, the refusal carries the message); notes beside it.

## Acceptance

A dispatch refusal from the session-authority boundary always names its exact
internal reason and a typed next action; `inspect` names the same cause instead
of `lock: absent` with no next step. Settled reservations stop counting as
in-flight. Hooks evaluating one tool call never refuse each other. A session
that has dispatched many slices can keep dispatching. Preserve the lock's
exclusivity for real concurrent writers and refuse genuine partial effects.
