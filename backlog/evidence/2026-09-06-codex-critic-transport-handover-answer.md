# Answer to the Alfred handover: selected-Codex-Critic transport

Handed over from an Elephant on the Alfred checkout (`ca886b92`, 508/508
verify green, preflight `packet-ready`, `spawnAuthorized: false`, next gate
`selected-runner-transport`). Alfred was not touched.

## Fix commits

- `aefe0e9cbcd3f34d05919ef98a4dc35a2cde85fb`
- `6ca241f1390383bc681d246510ad1cc7797ace36`

Both on branch `nova` in the Pipeline development checkout, `Dispatch:
NVA-B-CRITICXPORT-1 (goldfish)`.

## What was actually missing, verified independently before building

The handover's claim held, and narrowed on inspection.
`selectedCriticHostBridge()` (`codex-critic-host.mjs:153`) is the **producer**
of a JSON-line protocol: it writes `execution.launch` to stdout and blocks on
stdin for `execution.result`. Grepping
`pipeline.codex-critic-selected-host.v1` across every `.mjs`, `.md` and
`.json` in the repository returned **exactly one file — the producer itself**.
No consumer existed anywhere.

## Delivery route

**Completion (B): an in-process bridge**, mirroring the working advisory
precedent, rather than an external host speaking the stdout protocol. Three
new files:

- `plugins/pipeline-core/scripts/codex-critic-selected-host.mjs` — the
  `{launch, finalize}` bridge satisfying `validateHostBridge`, plus
  `runSelectedCriticHost` as the entry point.
- `plugins/pipeline-core/scripts/codex-critic-app-server.mjs` — the host
  consumer: pre-spawn validation, then acceptance only on observed facts.
- `plugins/pipeline-core/scripts/codex-critic-app-server-child.mjs` — the
  in-sandbox child, briefed with paths and refs only.

`codex-critic-host.mjs`'s producer and CLI are **unchanged**, so the external
stdout route remains available; (B) adds a second, working path rather than
replacing the written one.

The reasoning for (B): `advisory-host-bridge.mjs` +
`codex-advisory-app-server.mjs` already do this exact job for the advisory
duty, in-process and working. Mirroring a proven topology beats inventing a
process boundary that nothing had yet implemented.

## Acceptance criteria 1–4

| | |
|---|---|
| 1. Real Critic launch under the selected sandbox profile, bound to candidate, references, scratch | **met in code.** The only spawn path goes through `buildSandboxInvocation`; the new files contain no `codex exec` string at all — checked by grep, not by report. |
| 2. Fresh, independent, read-only Critic, paths/refs-only briefing, T1 route | **met in code** via the in-sandbox child. |
| 3. Real result / process-exit / cleanup observations, correctly bound receipts | **met in code.** Two dedicated tests delete an observed key entirely and assert refusal rather than a synthesised field. |
| 4. Missing or contradictory preconditions refused safely; no generic fallback; no invented evidence | **met in code.** Refusal cases cover missing selection, drifted binding, contradictory digests, and a child that starts then returns an invalid result. |

`node --test plugins/pipeline-core/scripts/codex-critic-host.test.mjs`:
**105/105, exit 0** — re-run by the dispatcher, not taken on report. 96 pre-
existing checks unchanged, 9 added. `check-consumer-safe-paths`: 9/9.

Evidence: `evidence/NVA-B-CRITICXPORT-1-codex-critic-host-test.txt`,
`evidence/NVA-B-CRITICXPORT-1-check-consumer-safe-paths-test.txt`.

## Acceptance criterion 5 — NOT delivered

**No real end-to-end review run happened, and none can be produced from here
right now.**

The PO approved a live provider execution. A separate probe then established
that the runner's auto-mode permission classifier **denies** the
`codex … exec … --sandbox danger-full-access` spawn pre-execution, while
permitting `codex --version` and `codex exec --help`. The probe stopped rather
than reshaping the invocation. Detail:
`backlog/evidence/2026-09-06-lws-live-probe-blocked.md`.

So the lane is built and unit-proven, and **untested against a real Codex**.
Saying so plainly is the point: the handover's own complaint was that
"existing tests with substituted functions do not prove this connection", and
reporting criterion 5 as met would reproduce that defect one level up.

## What remains unproven, named individually

Taken from the implementing dispatch's own disclosure and not softened:

- the real Codex App-Server wire protocol;
- `buildSandboxInvocation`'s real output;
- composition through a real physical sandbox runtime and selection store;
- `referenceSetSha256` / `reviewBase` are trusted by equality and format, not
  derived from content.

Tests inject at the **process-spawn boundary** — the same boundary the
advisory suite uses — so the code under test is the real consumer and only the
child is faked. Everything past that boundary is unexercised.

## Two precedent quirks, mirrored not introduced

Both exist in the read-only `advisory-host-bridge.mjs` and were left alone
there: the `childStarted: false → undefined` mapping, and a `take`-key trap
against `validateHostBridge`. The new code avoids the second; the first is
mirrored deliberately so the two duties behave alike. Neither was fixed in the
advisory file, which was out of scope.

## Status

Implementation complete. Live provider run out of scope and untested.
Independent Critic review and PO acceptance both pending. **Not "done."**

`critic-dispatch-preflight.mjs`'s `packet-ready` status and its
`spawnAuthorized: false` were deliberately left untouched. Whether that gate
may now report differently is a separate decision, and not one an implementing
dispatch should make for itself.
