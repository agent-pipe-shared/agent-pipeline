---
schema: pipeline.backlog-item.v1
id: pipeline.the-sandbox-preflight-app-server-handshake-is-a-race
type: defect
owner: pipeline
status: open
created: 2026-09-06
source: "three measurement dispatches on 2026-09-06 (NVA-B-CASPREFLIGHT-1/-2/-3) against the real Codex CLI 0.153.4; evidence under evidence/NVA-B-CASPREFLIGHT-*, forwarded from a Codex session that could not start an isolated Critic"
sprint: nova-b
done_when: manual
---

# The sandbox preflight's app-server handshake is a race, and the blocked-event-loop explanation does not survive its own measurement

## Description

`codex-sandbox-preflight.mjs --run --kind intermediate` fails with
`terminalCode: "child-stdio-error"` and `eligibility: "none"`. The single
false vector is `appServerInitEquivalent`, and since the receipt now carries
the per-side diagnosis (`a7053748`) the failing condition is named exactly:
`appServerInitialized` is false on both the control and the sandbox side,
`appServerBoundedStop` is true on both, and the probe's own error class is
`initialization-error`.

The app-server child starts, exits cleanly with code 0, and produces zero
bytes of stdout. It is not denied anything, it does not time out, and the
sandbox is not implicated: the control side runs no sandbox and fails
identically.

## What three dispatches measured

| Variant | Successes |
|---|---|
| the fixture as it ships | 0 of 5 |
| probe reordered before the synchronous placeholder | 1 of 5 |
| synchronous placeholder replaced by an awaited asynchronous spawn | 4 of 10 |
| the handshake alone, with no placeholder child at all | succeeds in ~300 ms |

Ruled out by direct measurement, each with an artifact: a `codexHome` string
mismatch (the paths match exactly), the 2 s handshake window (successes land
in 280–450 ms and a real timeout would report `timeout`, not
`initialization-error`), the fixture's narrowed PATH and nested cwd, a
`/tmp`-versus-repository location difference, a changed field set in 0.153.4,
and any sandbox-side denial.

Nothing was applied to the fixture. Both candidate changes were measured
against a decision rule fixed before the measurement and neither met it.

## Why the working explanation is wrong

The hypothesis behind both attempts was that a synchronous `spawnSync` blocks
the event loop while the app-server handshake is in flight. The third dispatch
disclosed the flaw in that framing, and it is decisive: **the placeholder and
the handshake never overlap.** The original fixture runs the placeholder to
completion before calling the probe, and the asynchronous candidate awaits its
child before doing the same. There is no in-flight handshake to starve in
either version.

So the measured difference — 0 of 5 against 4 of 10 — is real but its
mechanism is unexplained. A `spawnSync` that has already returned still makes
the following handshake fail more often than an awaited async spawn does. That
is an effect on the process, not on a concurrent operation.

## A hypothesis the evidence supports and nobody has tested yet

The probe writes both JSON-RPC lines with `child.stdin.end(...)`, which sends
the request and closes stdin immediately. An app server that observes EOF
before it has finished processing the initialize request may exit cleanly
without answering — which is exactly the observed shape: exit 0, zero stdout,
`boundedStopObserved: true`, `initialized: false`. Under that reading the
child-spawn variants matter only because they shift the timing of that EOF by
a few milliseconds, which explains why an async spawn helps without fixing
anything.

The falsifiable next measurement: write the two lines but keep stdin open
until the response arrives or the window expires, then close. If the handshake
becomes deterministic, the race is the EOF, not the placeholder. This changes
the probe's mechanism, never its acceptance condition — `initialized` still
requires the same `id: 1` response with the same matching `codexHome` and the
same string-typed `userAgent`/`platformFamily`.

## Affected artifact

- `plugins/pipeline-core/scripts/fixtures/codex-sandbox-preflight-payload.mjs`
  — `appServerInitProbe()` and the top-level sequence.
- `plugins/pipeline-core/scripts/codex-sandbox-preflight.mjs` — already
  carries the per-side diagnosis; no further change is implied by this item.
- `scratch/codex-sandbox-preflight-payload-async-candidate.mjs` — the measured
  async variant, ready to diff in if a later measurement earns it. Scratch is
  gitignored, so it will not survive a clean checkout; re-deriving it from
  this item is a few minutes' work.

## Consequence while this is open

The isolated Codex T1 lane cannot produce a verdict on this machine. That is
what makes the PO-authorized single-attempt fallback to the
functional-equivalent lane worth wiring — tracked separately. The two are
independent: this item is about making the isolated lane work; the fallback is
about what happens when it does not.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
