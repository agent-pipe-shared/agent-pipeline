# NVA-REBDEAD-1 — mechanical results, 2026-09-02

Commands and exit codes only. No rationale, no narrative.

| Command | Result | Exit |
|---|---|---|
| `node plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` | 219 tests, 219 pass, 0 fail | 0 |
| `node plugins/pipeline-core/lib/rebase-authority.test.mjs` | 13 tests, 13 pass, 0 fail | 0 |
| `node --test harness/scripts/check-consumer-safe-paths.test.mjs` | 9 tests, 9 pass, 0 fail | 0 |

The guard suite figure was re-measured by the dispatcher at commit
`10d11e588f9c5ced9b3334afe1c2007f2ee0c0ea`, independently of the implementing
dispatch's own run.

Pre-change the same suite carried 210 tests. The nine added cases are named
`rebdead positive-1..5` and `rebdead negative-1..4`.

`2026-09-02-nva-rebdead-1-red.json` is the pre-fix machine capture, produced by
driving `evaluateLifecycleReadyGuard()` against a fixture whose conflict path is
`project/pipeline-state.json`, with a non-stubbed readiness function.

`2026-09-02-nva-rebdead-1-authorship.json` is an authorship-only projection of
the dispatch record (`taskId`, `agentType`, `dispatcher`, `commits`).

## Declared deviations from the specification

Stated as bare facts.

1. Readiness is not re-resolved by a fresh onboarding inspection rooted at the
   `orig-head` tree. The relief instead treats the resolver's own successful
   resolution as establishing `orig-head` readiness, and bypasses the live
   working-tree readiness observation for actions already inside the resolver's
   admitted surface.
2. The readiness relief is conditioned on `PORG-NOT-READY` with
   `intent: "session"`, not on any single `lifecycleStatus` value. Sibling
   exemptions in the same catch block are each conditioned on one specific
   status.
