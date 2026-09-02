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

**Correction, 2026-09-02 — the pre-fix capture does not survive, and the earlier
wording here was wrong.** This record previously named
`2026-09-02-nva-rebdead-1-red.json` "the pre-fix machine capture". That file
records `exitCode: 0` on every case, carrying an admission notice whose string is
introduced by the fix commit itself and does not exist at its parent — so it is
the POST-fix re-run, written over the pre-fix capture in place by the same probe
script. It is renamed to `2026-09-02-nva-rebdead-1-postfix.json`, which is what
it is, and its two machine-specific absolute paths are replaced by a `<repo>/`
placeholder (CLAUDE.md hard rule; the originals named an operator home
directory).

Consequence stated plainly rather than left to inference: **no red-state
evidence exists for this change.** The implementing dispatch reported capturing
one before writing the fix; that capture was overwritten and cannot be produced
after the fact from this artifact. Whether reproduce-first was actually followed
is therefore unevidenced, not proven and not disproven.

This is the second instance in one day of gate-cited evidence being overwritten
in place by a later re-run of the same script.

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
