---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield.r2.concurrent-hooks-refuse-dispatch-on-registry-lock
type: bug
owner: pipeline
status: open
created: 2026-10-26
priority: P1
release: 0.7.0
source: "Live Claude Elephant session on the WSL PC, 2026-10-26"
done_when: manual
---

# A governed dispatch is refused with SDC-LOCK-HELD while no other Pipeline work runs

Observed live on 2026-10-26: four consecutive attempts to launch the same
generated Goldfish briefing were refused by `guard-dispatch` with
`SDC-LOCK-HELD: version 2 native host binding failed before launch`. One refusal
named the reason `registry-lock-held` (held by a running Pipeline process for
2 s, longer than the 1500 ms bounded wait). `session-authority-repair.mjs
inspect` right before and after each attempt read `lock: absent`, and `wait`
returned `lock-free` immediately; no test run or other Goldfish was active.
The same briefing shape had launched several times earlier in the session.

## Analysis (Source reading, not a reproduction)

`registryClosure` in `lib/session-authority-registry.mjs` refuses any read that
meets `registry.lock` outside the reader's own boundary with
`SDC-LOCK-HELD registry-lock-held` immediately, and a boundary acquire waits at
most `SESSION_AUTHORITY_LOCK_WAIT_MS` (1500 ms). Several PreToolUse hooks run
for one Agent call. If one of them holds the boundary while another reads the
registry, the second refuses. The registry now carries 20 in-flight
`native-goldfish` reservations from this session (cancelled or
integrated-by-commit slices), so each boundary is held longer and the race
becomes near-certain.

## Acceptance

Hooks evaluating the same tool call never refuse each other: a reader that
meets the lock waits within the same bound as an acquirer, or the hooks share
one boundary. Settled reservations (cancelled, integrated-by-commit) stop
lengthening every later boundary. The refusal names the actual holder and a
typed next action instead of an inspect that reports `absent`. Preserve the
lock's exclusivity for real concurrent writers.
