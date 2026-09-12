# Role-dispatch batch event correction — independent Critic PASS

> Agent-Pipeline · Nova B · 2026-09-12

## Candidate binding

- base commit: `6b430a9fd53134c9f5029273e28435ae97f0c55e`
- reviewed candidate: `186a2f7bcd14a1ed00ac900923dcaf0a4856326d`
- candidate tree: `f02f202895d3aaf4b4c786bcd1472fabb0d0204d`
- primary requirement:
  `backlog/items/2026-09-10-role-dispatch-payload-errors-fail-before-model-launch.md`
- deterministic evidence:
  `scratch/NVA-B-ROLE-PREFLIGHT-EVENTS/candidate-evidence.json`

## Deterministic result

The candidate-bound evidence records the focused dispatch-policy suite passing
34 of 34 cases and `git diff --check` succeeding. The tests cover the
all-packets `PREPARE` barrier, launch-time `START` and `REFUSE` events, invalid
batches with zero launches, stale destination and input failures, bounded
payload shape, redaction, immutability, and event-sink failure.

## Independent review

The fresh refs-only Critic returned **PASS with no findings**. It confirmed that
the additive batch callback emits every initial preparation event before any
start, emits `START` immediately at the launch boundary, reports late stale
checks as `REFUSE`, and exposes only schema, phase, index, dispatch ID, status,
and code. It found the optional parameter backward compatible and found no
dependency, secret, personal-data, authorization, or architecture-governance
regression.

Assurance was
`functional-equivalent-read-only; OS isolation not asserted`. The Critic used
no write tool or mutating command and explicitly noted the residual host
write-capability limitation.

The review also confirmed that this slice does not by itself close the parent
item: the remaining real Antigravity production coordinator still has to
consume the shared contract.
