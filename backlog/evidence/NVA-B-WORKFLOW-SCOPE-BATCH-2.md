# Option 3: workflow batch scope admission

Task: `NVA-B-WORKFLOW-SCOPE-BATCH-2` · 2026-09-12

Backlog item:
`pipeline.concurrent-dispatches-in-one-shared-checkout-collide-in-ways-no-guard-catches`.
Pre-implementation HEAD: `edbcc88035e0baa8596984849532728ff25e8fdb`.
No commit was created by this dispatch.

## Implemented contract

`validateWorkflowWriterDispatchBatch(dispatches)` accepts 1–64 simultaneously
prepared legacy dispatch envelopes, each containing only `request`,
`calibration`, and `capabilities`. Each member retains the existing capability,
guard, command, side-effect and Verify checks. The batch normalizes literal
repository-relative `allowedPaths`: separators and harmless dot segments are
canonicalized, duplicates removed, and paths sorted. Absolute paths, traversal,
control characters and wildcard scopes are refused. Caller-owned inputs are
unchanged.

Between `bounded-write` and `isolated-write` members, identical normalized paths
and ancestor/descendant paths produce `WF-SCOPE-OVERLAP`, including the member
indices and normalized conflicting paths. Read-only members do not collide.
Sibling names such as `src/a` and `src/ab` remain distinct.

`runSyntheticWorkflowDispatchBatch(dispatches, adapter)` applies the existing
closed synthetic transport/schema boundary and the complete batch preflight
before its first adapter invocation. Any schema, capability or scope refusal
therefore reports zero invocations. A successful batch invokes each admitted
request once with an independently copied, normalized request. A synchronous
adapter failure stops the remainder and reports the actual invocation count;
untrusted adapter output is omitted from the receipt.

The existing single-request APIs and continuity-bound Phase-2.6 path retain
their behavior. Admission covers the submitted batch only: it introduces no
live-dispatch registry, scope lease, filesystem-alias resolution, Verify-run
lock, or native runner-isolation claim. Callers must supply all concurrently
prepared scopes they want compared.

## Validation

Both commands exited 0 on the completed code:

- `node plugins/pipeline-core/lib/workflow-writer-preflight.test.mjs` — 63 checks.
- `node plugins/pipeline-core/lib/workflow-runner-boundary.test.mjs` — 43 checks,
  run at the host boundary for its existing Git-backed return fixture.

Coverage includes both write modes, exact and ancestor overlap in either order,
normalized aliases, nonadjacent conflicts, read-only overlaps, disjoint success,
malformed later members, closed schema rejection, zero calls on refusal,
independent request snapshots, adapter failure accounting, and the existing
single-request/continuity/failover regressions. `git diff --check` passed.

The v3 dispatch record is
`evidence/dispatch-record-NVA-B-WORKFLOW-SCOPE-BATCH-2.json`. It remains
`in-progress` until the Coordinator supplies an actual commit binding and the
required independent review disposition. This evidence is focused validation;
it does not claim full Verify or final-candidate acceptance.
