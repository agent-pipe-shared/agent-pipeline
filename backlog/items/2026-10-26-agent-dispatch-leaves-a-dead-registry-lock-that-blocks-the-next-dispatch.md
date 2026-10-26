---
schema: pipeline.backlog-item.v1
id: pipeline.agent-dispatch-leaves-a-dead-registry-lock-that-blocks-the-next-dispatch
type: defect
owner: pipeline
status: open
created: 2026-10-26
priority: P1
release: 0.7.0
source: "Elephant session 2026-10-26 on the WSL PC: two consecutive Agent dispatches, the second refused with SDC-LOCK-HELD; plus the PO's consumer reports that user repositories cannot dispatch without an error"
done_when: manual
---

# A successful Agent dispatch leaves a dead-owner registry lock that blocks the next dispatch

## Evidence (measured, not inferred)

Three observations in one session, each with `session-authority-repair.mjs inspect` after the dispatch:

1. Two background dispatches in one message: the first was admitted, the second was refused by `guard-dispatch`
   with `BLOCKED SDC-LOCK-HELD (registry-lock-held)`. `inspect` then showed the lock held with `owner: dead`
   (pid gone), acquired at the moment of the first dispatch.
2. After `heal`, the same pair again: first admitted, second refused, lock held by a dead pid acquired at the
   first dispatch.
3. After `heal`, ONE dispatch sent alone: admitted. Two minutes later `inspect` still showed the lock held by a
   dead pid acquired at that dispatch (119 s old, no cleanup in between).

So the lock is not a race between concurrent dispatchers. Every successful Agent dispatch leaves a lock whose
owner process has exited, and the registry reports `next boundary entry retires it` while the boundary entry
itself (the next `guard-dispatch`) blocks instead. Spacing dispatches does not help; only `heal` between them does.

## Live measurement (2026-10-26, lock watcher on a real session; supersedes the hypothesis below)

A 5 ms poller on `registry.lock` recorded every holder with its command line and, from 3 s on, its process state.

- The stranded lock is held by `hooks/guard-dispatch.mjs` (PreToolUse:Agent) and, once, by `post-compact-reground.mjs`.
  Each dispatch takes the lock three to four times in a row. The first acquisitions last about 1 s each.
- On the heavier dispatches one or more acquisitions last about 30 s each (for example 16:49:38 to 16:50:11, again to
  16:50:43, again to 16:51:15), the holder in state `R` (running, CPU-bound), no wait channel, no child process.
  So the boundary does a long synchronous computation while it holds the lock.
- When the sum passes the hook timeout (`guard-dispatch` 120 s, `post-compact-reground` 10 s) the harness kills the
  process inside the boundary. Nothing runs the `finally`, the lock stays with a dead owner. Both kill times match the
  timeouts (acquired 16:42:35.7, found dead 16:44:28; acquired 16:40:12.98, found dead 16:40:22).
- A later `guard-dispatch` retires such a dead-owner lock on its own (the S7a and later dispatches were admitted
  without `heal`), so the visible damage is the lost time plus a dead lock between two dispatches.

So there are two defects, not one: (1) the boundary computes for about 30 s per acquisition while it holds the
registry lock (the cause of the slowness too; the profile of the holder is the next measurement), (2) a hook killed
by its timeout inside the boundary strands the lock.

## Likely area (hypothesis for the implementor to confirm, not a finding)

The hook process that registers the dispatch reservation acquires the registry lock and exits (`process.exit`, or
a release in a code path skipped on the allow route) without releasing it. `guard-dispatch` (PreToolUse:Agent)
reads the registry on the next call, sees a held lock and returns SDC-LOCK-HELD without testing owner liveness.

## Wanted

- `guard-dispatch` (and any reader of the registry on the dispatch path) classifies a held lock by owner
  liveness: a dead owner is retired on the spot (the same action `heal` performs), a live owner is waited for a
  bounded time (about 3 x 2 s) before it blocks, and the block text carries a typed retry action naming the exact
  call to repeat.
- The hook that takes the lock releases it on every exit path, including the allow route.
- Regression case: dispatch, dispatch again with no `heal` between, both admitted; and a case with a lock owned by
  a dead pid at entry.

## Why P1

It is the reason a consumer repository can never dispatch without an error (PO, 2026-10-26: "die user repos
koennen nie direkt ohne fehler dispatchen"), and it forces a manual `heal` between every two dispatches in this
repository. Kernel paths: a held patch, applied by the PO as operator.

## Interim rule for dispatchers

Until the guard is fixed: send exactly one Agent call per message, run `session-authority-repair.mjs heal` before
the next one when `inspect` shows `owner: dead`, never send two Agent calls in one message.
