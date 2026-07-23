# ADR-0044 — Provider-neutral control/execution boundary

**Status:** accepted · **Date:** 2026-07-23

## Context

Issue #10 needs a smallest reversible boundary for future execution options without creating an executor or a second authority store. The Elephant remains the sole orchestrator. PO gates, admission, mutation authority, deterministic Verify, independent Critic, candidate binding, cancellation, merge/release/final acceptance remain control-plane decisions; workers cannot delegate. The workflow-runner boundary owns observed outcomes, and telemetry is observation only.

## Decision

Freeze the immutable `pipeline.control-execution-exchange.v1` DTO. Its closed schema binds package identity, explicit Git base/candidate OIDs and tree, continuity dispatch/attempt/queue authority, parent/worker/correlation identities, invalidation, lifecycle event projection, and only registered namespaced extensions. Admission reuses `validateContinuityState`; no Git inspection, dispatch writer, queue/state machine, retry/replay/cancel side effect, provider adapter, or production integration is added. `mayDelegate` is always false.

We compared serial execution, runner-native subagents, a supervised local Goldfish pool, provider-hosted async execution, external self-hosted/clustered execution, and no added integration. Local-first is selected for the eventual spike because it minimizes transport and credential exposure while allowing bounded capacity, explicit isolation, and observable reliability. The smallest reversible spike is one in-process consumer that validates Phoenix and Nova fixtures and projects a runner outcome into an event; it has no worker launch or mutation path.

| Option | Capacity | Isolation | Reliability | Decision |
|---|---|---|---|---|
| Serial | low | strongest | simplest | baseline only |
| Runner-native subagents | medium | runner-defined | host-dependent | defer |
| Local Goldfish pool | bounded | explicit local controls | observable | selected spike |
| Provider-hosted async | elastic | provider boundary | external dependency | reject for now |
| Self-hosted/clustered | elastic | operator burden | complex | reject for now |
| No integration | none | strongest | no new failure modes | safe fallback |

## Threat model and failure handling

Threats include stale dispatches, authority/base/candidate drift, confused-deputy worker delegation, provider payload injection, replay, cancellation races, and false success from unknown execution. Closed fields, explicit OIDs, continuity revalidation, digest binding, immutable snapshots, namespace allowlisting, `mayDelegate=false`, and event class/status pairs mitigate them. Missing, mismatched, invalidated, unknown, or unavailable evidence fails closed; unknown/unavailable can never mean success. Existing runner-boundary outcomes remain the only observed execution evidence.

Sequence: Elephant validates continuity and Git binding → assigns parent/worker/correlation identities → constructs/freeze exchange → consumer validates and performs bounded work → runner boundary projects an event → Elephant performs Verify/Critic and retains merge/release authority.

```text
Elephant -> Continuity/Git: validate + bind
Elephant -> Exchange: construct(frozen DTO)
Exchange -> Consumer: admit(work)
Consumer -> Runner boundary: observed outcome
Runner boundary --> Elephant: event projection
Elephant -> Verify/Critic: deterministic gates
```

```text
Elephant -> Exchange: invalidation(cancelled)
Exchange -> Consumer: cancellation event
Consumer --> Runner boundary: acknowledged/rejected
Runner boundary --> Elephant: bounded evidence
Elephant -> Control plane: retain merge/release authority
```

| Failure mode | Closed response |
|---|---|
| stale or drifted binding | reject admission |
| unknown/unavailable outcome | never success |
| worker delegation attempt | reject (`mayDelegate=false`) |
| extension or provider field injection | reject unknown namespace/field |
| cancellation race or replay | project event only; Elephant decides |

Alternatives are rejected when they add an executor, remote/provider integration, hidden retry/replay state, recursive delegation, or broaden credentials/isolation beyond a separately approved extension. Rejection criteria for the spike are any false-success path, authority mismatch acceptance, mutable DTO, unregistered extension, worker delegation, or mutation outside the control plane.

## Consequences

Phoenix can consume the minimum contract without unpublished #14, and Nova without the richer #17 replay model. Capacity, isolation, and reliability remain explicit future extensions rather than implied guarantees.

## Deutsche Referenz

ADR-0044 friert eine unveränderliche, anbieterneutrale DTO-Grenze ein. Der Elephant bleibt alleiniger Orchestrator; Arbeiter dürfen nicht delegieren. Kontinuitätsprüfung, Git-Bindung, PO-Gates, Verify, Critic, Abbruch sowie Merge/Release bleiben in der Kontroll-Ebene. Unbekannte oder nicht verfügbare Zustände gelten niemals als Erfolg. Es wird kein Executor, keine Provider-Integration und kein zweiter Zustands-/Autoritätsspeicher eingeführt. Ein lokaler, reversibler Fixture-Consumer ist der kleinste zulässige Spike; alle Erweiterungen sind auf die registrierten Namespaces beschränkt.
