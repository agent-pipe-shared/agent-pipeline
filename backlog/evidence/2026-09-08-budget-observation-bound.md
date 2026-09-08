# Budget unresolved-observation bound

`NVA-B-BUDGET-RESIDUE-1` replaces per-call unresolved JSONL appends with an
atomic, complete JSON observation per session/reason. Existing
`unresolved.jsonl` data is retained without truncation. New paths use
digest-derived session/reason components; missing or malformed session IDs use
the explicit `fallback-session` bucket. This bounds each session/reason pair,
not total retention across unlimited sessions.

The hard-link claim publishes a full diagnostic before it suppresses a
concurrent duplicate. A failed write or claim remains fail-open and does not
alter counters, caps, or the orchestrator exemption. `agent_id: null` remains
malformed while an absent key remains the measured orchestrator shape; they
therefore keep distinct transcript/identity contracts.

Verification: the final combined budget, lifecycle-consumer and consumer-path
suite exits 0, captured at
`scratch/NVA-B-BUDGET-RESIDUE-1/budget-lifecycle-consumer-parent-final.txt`.
It covers real concurrent filesystem claims, legacy JSONL preservation,
distinct session/reason keys, the explicit absent/null/blank/non-string
session fallback, partial-write cleanup and unchanged admission/cap behavior.
The earlier additive red is retained. A rework capture also caught a fixture
that accidentally retained its default session ID; the corrected test truly
omits it. Earlier pre-rework green is not the final-source proof.

The unreachable budget-local `invalid-identity` branch and its historical
named invariant are retired here. `subagentIdentity()` remains unchanged for
its lifecycle consumer. The parent replaced the historical closed item's
obsolete code-marker predicate with the retained assertion of the current
malformed-agent-ID reason, preserving every status and closure field and
appending the retirement rationale. This is a structural tripwire, not a
claim that a test ran. The metadata proof and whole-backlog state/predicate
checks exit 0; the latter reports zero stale-open and regression findings.
Existing ledger drift advisories remain; no new ledger event was invented
for this status-neutral correction.

Formal independent candidate review remains pending. A per-session bound is
not a global retention limit or guaranteed crash/power-loss durability; an
abrupt process stop may leave a temporary file before publication. Ordinary
write failures clean their temporary path without blocking the tool call.
