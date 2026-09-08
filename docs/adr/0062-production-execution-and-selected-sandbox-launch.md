# ADR-0062: Production execution and selected-sandbox launch extend ADR-0044's frozen boundary, within its own constraints

> Agent-Pipeline · Nova sprint (`sprint-nova-epic`) · as of 2026-08-11

**Status:** accepted (2026-08-11, PO instruction, chat, "Annehmen wie entworfen" — accept as drafted) · **Basis:** `specs/sprint-nova-epic/implementation/issue-acceptance-matrix.md` rows `#12`/`#14` and `#29`; `specs/sprint-nova-epic/plans/nova-a.md` Slices A2/A4; drafted at the PO's request ("ja bitte ADR entwerfen", 2026-08-11), accepted as drafted the same day.

**Governs:** docs/nova-execution-plane-threat-model.md, harness/scripts/verify.mjs, plugins/pipeline-core/lib/execution-plane-contract.mjs, plugins/pipeline-core/lib/execution-plane-contract.test.mjs, plugins/pipeline-core/lib/execution-plane-contract-real.test.mjs, plugins/pipeline-core/scripts/execution-plane-launch.mjs, plugins/pipeline-core/scripts/execution-plane-launch.test.mjs, plugins/pipeline-core/scripts/selected-sandbox-launch.mjs, plugins/pipeline-core/scripts/selected-sandbox-launch.test.mjs, plugins/pipeline-core/scripts/selected-sandbox-disposition.schema.json, specs/sprint-nova-epic/implementation/issue-acceptance-matrix.md

## Context

Nova A's Slice A4 (`#12`/`#14`, execution contract and scheduling lifecycle)
and Slice A2 (`#7`/`#29`, capability and selected-sandbox foundation) were
deliberately scoped to contracts, schemas and a synthetic in-process fixture
consumer — never a real worker launch. `nova-a.md` states Slice A4's outcome
as "a versioned execution-plane companion and deterministic
planner-to-executor handoff **without worker launch**"; ADR-0044 froze the
`pipeline.control-execution-exchange.v1` DTO on the same premise ("no ...
provider adapter, or production integration is added") and explicitly named
"Local Goldfish pool" as the *selected* future execution option over
provider-hosted, self-hosted/clustered, and no-integration alternatives —
while stating "capacity, isolation, and reliability remain explicit future
extensions rather than implied guarantees." This ADR is that anticipated
extension.

The acceptance matrix confirms zero implementation movement on the production
side since 2026-08-01: `#12`/`#14`'s row reads "building it is explicitly out
of scope without a new ADR (nova-a.md: 'no production executor without ADR
approval')"; `#29`'s row finds `reduceSelectedSandboxDisposition`/
`createSelectedSandboxDisposition` "consumed only by their own test and by
`invocation-preflight.mjs`, which only validates an existing disposition
record and never spawns a child," and states "building one is new production
code, outside this evidence-sealing task's scope." Both issues are the last
non-PO-decidable, non-consent-artifact blockers standing between Nova A's
provisional-implemented state and an evidenced/closed one — the matrix's own
recommended order places them immediately after `#57`/`#7`/`#29`/`#38`.

## Decision

Approve building the real production consumer and the real selected-sandbox
launcher, both **strictly inside ADR-0044's already-frozen boundary** — no
schema change to `pipeline.control-execution-exchange.v1`, no new authority
store, no change to `mayDelegate=false`, no change to who holds merge/
release/PO-gate authority (the Elephant, unchanged).

Clarification:

- **Production executor (`#12`/`#14`):** replace ADR-0044's synthetic
  in-process fixture consumer with a real consumer that dispatches through
  the existing frozen exchange DTO to the "Local Goldfish pool" option
  ADR-0044 already selected over its alternatives — no new comparison is
  reopened here. The consumer performs bounded work and projects an observed
  outcome through the existing runner boundary; it gains no new mutation
  path, no new credential surface, and no delegation capability beyond what
  ADR-0044 already authorizes structurally.
- **Selected-sandbox launcher (`#29`):** build the missing spawn +
  probe-start/probe-success wiring that drives a real opt-in selected-child
  execution through the existing `reduceSelectedSandboxDisposition`/
  `createSelectedSandboxDisposition` reducer contract (Slice A2's already-
  accepted fingerprint/no-repeat/negative-corpus behavior is unchanged —
  this ADR authorizes wiring a real driver in front of it, not redesigning
  it). Opt-in only; no fallback or host-only path may produce a false
  positive receipt, per the existing NVA-A29-6 negative corpus.
- Both must bind into Nova A's Verify/Security/Critic gates before either
  issue's row in the acceptance matrix moves from "Implemented (provisional)"
  to "evidenced/closed" — this ADR authorizes the build, it does not itself
  close either issue.
- This ADR does not authorize any new remote/provider/self-hosted execution
  option; ADR-0044's rejection of those alternatives is unchanged.

## Consequences

**Positive:** unblocks the last non-consent, non-PO-decision Nova A gaps
(`#12`/`#14`/`#29`) without reopening ADR-0044's execution-option comparison
or widening its threat model; Nova A's remaining open matrix rows narrow to
the genuine PO-consent (`#56`/`#98`) and Critic-correction (`#54`) items,
none of which this ADR touches.

**Negative:** real process spawning/dispatch is new operational surface —
first real exercise of a path that has so far only run against synthetic
fixtures; any gap between the fixture contract and real Goldfish-pool
behavior surfaces here, not earlier.

**Risk:** a real launcher/consumer that silently drifts from ADR-0044's
threat-model table (stale/drifted binding, unknown/unavailable outcome,
delegation attempt, extension/field injection, cancellation race/replay) —
mitigated by requiring the implementation to reuse ADR-0044's existing
`validateContinuityState` admission path and closed-field DTO unchanged,
and by the Verify/Security/Critic binding requirement above before either
issue closes.

## Alternatives considered

- **Leave both issues open indefinitely, no ADR.** Rejected: the matrix
  already identifies the missing ADR as the sole blocker for two of Nova A's
  ten issues; leaving it unaddressed stalls Nova A's evidenced-closure path
  for no stated reason.
- **Reopen ADR-0044's execution-option comparison (provider-hosted,
  self-hosted/clustered) instead of building the already-selected local
  pool.** Rejected: ADR-0044 already compared and selected local-first
  specifically to minimize transport/credential exposure; nothing in the
  matrix or this session's findings changes that basis.
- **Widen the frozen DTO or authority model to make the launcher easier to
  build.** Rejected: ADR-0044's schema freeze and single-authority model are
  load-bearing for its threat-model mitigations; this ADR's whole premise is
  that the extension fits inside the existing boundary.

## Follow-up

Accepted 2026-08-11. Dispatch the actual implementation (goldfish-deep,
real design latitude) for each of `#12`/`#14` and `#29` separately, each
ending in its own Verify/Security/Critic-bound evidence update to
`issue-acceptance-matrix.md`, before either row can move to
"evidenced/closed."
