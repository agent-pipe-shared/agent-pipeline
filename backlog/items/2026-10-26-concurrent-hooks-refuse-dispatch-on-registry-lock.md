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

Which of the three paths fires is not yet established.

## Acceptance

A dispatch refusal from the session-authority boundary always names its exact
internal reason and a typed next action; `inspect` names the same cause instead
of `lock: absent` with no next step. Settled reservations stop counting as
in-flight. Hooks evaluating one tool call never refuse each other. A session
that has dispatched many slices can keep dispatching. Preserve the lock's
exclusivity for real concurrent writers and refuse genuine partial effects.
