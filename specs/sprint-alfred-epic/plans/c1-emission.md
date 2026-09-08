# C1 emission and local reports — bounded implementation plan

Status: design refinement of approved #103, 2026-09-08. This is a staged
design, not a production dispatch brief. Exact observer, projection and
collector schemas must be frozen before implementation. No emission, native
observation qualification, baseline start, review or acceptance is claimed.

## Authority and boundaries

Authority is `specs/sprint-alfred-epic/spec.md` §§2, 6.1, 9, 10, 12 and 13,
`plans/c1-core.md` step 3, and `plans/c1-aggregation.md`. Preserve the pure
C1 receipt/aggregate modules, registry revision 1 and validated registry
digest. New adapters may import constructors and validators but add no implicit
clocks, file access, authority decisions, policy or registry changes. No
runner-profile, hosted telemetry or installed-plugin change belongs here.

## Source projection and privacy

The source projection belongs in
`plugins/pipeline-core/lib/interruption-source-adapter.mjs`; storage belongs in
`plugins/pipeline-core/lib/interruption-receipt-store.mjs`; reporting belongs in
`plugins/pipeline-core/scripts/report-interruptions.mjs`. Projection accepts
bounded repository-local bytes and closed binding context, rejects malformed
UTF-8, BOM, duplicate keys, nonfinite numbers, unsupported bytes, and excess
depth/size, and hashes accepted source bytes exactly. No prompts, arguments,
paths, transcripts, account/session IDs, findings bodies or raw usage enter
receipts. Missing context stays explicitly unknown/unavailable.

Invocation, review, usage and recovery sources must use their owning validators;
complete invocation/review histories only are admitted initially. Invalid
evidence is rejected, partial histories are unknown/unavailable, and native
usage IDs are never exported. Candidate-required observations require matching
commit/tree bindings. Source consistency does not prove authentic acquisition.
The existing scope requires at least one observed feature, package or dispatch
ID. If none can be established, do not emit a receipt; record a closed
collection diagnostic and unknown coverage instead of fabricating scope.

## Source-inspected observer seams

| Source kind | Existing owner and mapping | Required integration |
|---|---|---|
| workflow-observer | `critic-dispatch-preflight.mjs` / `preflightCriticDispatch`; rejected packet has typed preflight result | Capture a bound prevented packet at the real producer branch; invalid/unbound CLI stays unknown |
| lifecycle-boundary | `po-approval-gate.mjs` / `runHumanApproval`; preparation returns typed request-ready data | Observe the actual configured pause after readback |
| authority-wait | `guard-human-override.mjs` preparation owners | Observe actual wait and owner-verified continuation; never infer consent |
| terminal-decision | `close-coordinator.mjs` and lifecycle writers | Validate the accepted episode-ending decision; stop/failure vocabulary alone is insufficient |
| guard-observation | `guard-lifecycle-ready.mjs` / `evaluateLifecycleReadyGuard` | Add structured observation at the chosen verdict and wire its real caller |
| readiness-observer | `project-onboarding-ready-gate.mjs` / typed `PORG-NOT-READY` | Correlate same revision/authority binding before asserting disagreement |
| dispatch-observer | `continuity-host-adapter.mjs` / `CHA-COMPLETED-UNDELIVERED` | Exercise authentic final acquisition; pure normalization cannot manufacture absence |

The first live slice owns only Critic-preflight integration and its adapter.
Each later producer requires a separate bounded scope. A missing native status
channel is unavailable coverage, not proof of success or truncation.

## Observation, storage and reports

Observe once at the existing result branch after the owning decision. Preserve
admission, exit status and stdout/stderr protocol; telemetry failure creates a
collection gap and cannot change permission. Retain one repository-local
lineage ID across retries and restart; do not merge by code or guessed
predecessor. Record observed clocks with provenance; ingestion time cannot
replace missing observation time.

Persist immutable canonical receipts under `evidence/interruption-receipts/`
and collector coverage under `evidence/interruption-collection/`, with create
only publication, conflict detection, containment checks, and bounded 4096
files/64 MiB capacity. Reports under `telemetry/interruptions/` are derived
views and never acceptance evidence. Empty or missing collection is unknown,
not measured zero; corrupt/conflicting selected data fails closed. Retention is
local and explicit; no background deletion or network upload.

## Delivery and gates

1. Freeze source projection callable/output shapes and diagnostics, then build
   focused validation/privacy/candidate/incomplete-history fixtures.
2. Freeze collector envelope/coverage schema, then build store/report tests for
   replay, conflicts, crash remnants, containment, capacity, concurrency and
   unknown-zero behavior.
3. Integrate one actual observer/caller slice with local acquisition evidence.
4. Integrate observation → validated receipt → persistence → report, including
   restart lineage and collection gaps.

New suites use the sanctioned spec §12 registration route. Existing registry or
expired-exclusion failures are separate work and cannot be hidden or bypassed.
Run document contracts, diff checks and relevant behavior tests for each slice;
T1 review is required and deterministic Verify must be green before Critic
launch. Actual collection and the measured >=14-day baseline remain step 4 of
the parent plan; do not backdate or infer it from fixtures or pure-core commits.
