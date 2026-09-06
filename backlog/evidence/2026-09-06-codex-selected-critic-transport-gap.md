# The selected-Codex-Critic transport gap — verified 2026-09-06

Handed over from an Elephant working the Alfred checkout
(`ca886b92`, 508/508 verify green, critic preflight `packet-ready`,
`spawnAuthorized: false`, next gate `selected-runner-transport`).

The inherited claim was re-verified here rather than accepted, per CLAUDE.md's
rule on inherited "still open" characterizations. **It holds, and it is
narrower and more precisely locatable than the handover states.**

## The gap, exactly

`plugins/pipeline-core/scripts/codex-critic-host.mjs` defines
`selectedCriticHostBridge()` (`:153`). It is the **producer** side of a
JSON-line protocol:

- it writes `{schema: "pipeline.codex-critic-selected-host.v1", type:
  "execution.launch", requestId, selection, requested, references, profile,
  scratch}` to **stdout** (`:168-179`);
- it then blocks reading **stdin** for a matching
  `type: "execution.result"` with the same `requestId` (`:154-165`);
- it returns `childStarted: execution?.terminal?.childStarted === true`.

`grep` for that schema across every `.mjs`, `.md` and `.json` in the
repository returns **exactly one file** — the producer itself. There is no
consumer.

## What that implies about the intended shape

`codex-critic-host.mjs selected` (`:1802-1817`) reads its request from a file,
then runs `runCodexCriticThroughSelectedSandbox` with the bridge wired to
`process.stdin`/`process.stdout`. So the script is **designed to run as a
child of a host process** that:

1. spawns it,
2. reads `execution.launch` from its stdout,
3. actually launches the selected Critic under the named sandbox profile,
4. writes `execution.result` back to its stdin.

Step 3 and 4 are the missing artifact. The bridge contract the transport
enforces is minimal and already fixed: `validateHostBridge`
(`codex-sandbox-runtime.mjs:76-81`) requires exactly `{launch, finalize}`.

## Why the gate exists and must not be routed around

`critic-dispatch-preflight.mjs:216-232` deliberately returns
`status: "packet-ready"` — never `"ready"` — with `spawnAuthorized: false`
and `requiredNextGate: "selected-runner-transport"`. Its own comment records
the incident that shaped it:

> "Calling this result 'ready' caused coordinators to mistake packet integrity
> for a runnable Critic lane and to start an unbounded generic child when that
> lane was unavailable."

So the gate is not paperwork in front of a working lane; it is the marker that
the lane does not exist yet. A generic `codex exec` fallback is the exact
failure it was built to prevent.

## Splitting the acceptance criteria

The handover lists five criteria. Four are buildable here and now; one is not,
and saying so is part of answering the handover honestly.

**Buildable without the PO (criteria 1–4):** the host-side consumer, the real
launch under the selected profile bound to candidate/references/scratch, the
receipt construction (`pipeline.codex-sandbox-execution-receipt.v1`,
`pipeline.critic-receipt.v1`), safe refusal on missing or contradictory
preconditions, no generic fallback, and automated tests that exercise the real
consumer rather than a substituted function.

**Criterion 5 — "at least one real successful end-to-end review run" — is
PO-gated in this repository.** It is a live provider execution, the same class
as the never-exercised `allowProviderExecution` path already on the PO queue.
An agent must not authorize it for itself. Added to the PO decision queue
rather than quietly deferred or, worse, satisfied with a fixture and reported
as real.

That split is deliberate: criteria 1–4 delivered with criterion 5 openly
outstanding is an honest partial answer. Criteria 1–4 delivered while calling
the lane proven would be exactly the "existing tests with substituted
functions do not prove this connection" defect the handover is complaining
about, reproduced one level up.

## Not started

No code has been written for this yet. This document is the verification of
the handover's claim and the scoping decision that follows from it.
