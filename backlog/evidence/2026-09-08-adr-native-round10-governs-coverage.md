# Native Governs coverage rationale

The four source ADR headers declare current, tracked owners without claiming that every accepted decision is universally complete. The fixed-baseline proof is `node scratch/NVA-B-ADR-GOVERNS-NATIVE-10/check.mjs`; its machine report and sanitized terminal capture remain in this task's scratch directory.

## ADR-0047 — model-free preflight and on-demand consultation

The lifecycle policy and frozen V3 route registry separate model-free capability observation from a requested consultation. The lifecycle library and coordinator enforce that boundary, with their direct tests. The capability-preflight, Codex route/bootstrap, and host bridge paths are the current direct execution path, each with its direct test. The consultation skill and native advisor definition carry the concrete-question, consent, evidence, and no-bootstrap-launch constraints. ADR-0047 is the one header expected in the vendored-canon manifest; the repository-root ADR remains its source and parent integration performs the later generated copy update.

## ADR-0067 — native Antigravity runner contract

Setup and the Agy installer establish the native runner entrypoint. The hooks manifest, runner mapping/profile registry, and V3 reader define available runner selection and normalized model mappings. Onboarding and preflight are named with direct tests because the decision requires Antigravity across those control-plane routes. The native pre-tool guard and execution host provide the two stated enforcement/execution dimensions; runner-usage records their normalized provider/model result. The schema is listed as the portable authority contract consumed by those paths.

## ADR-0072 — fork-disposition approval proof

`pipeline.user.yaml` remains the single existing approval-mode selector. The critical-action registry and proof-policy reader bind the fourth kind to that mode; the governance store validates the content-bound disposition before recording it. The governance-event CLI is the sanctioned recording route. The human-approval and approval-gate commands provide the dedicated prepare/approve/verify path and distinguish public agent work from private signing, with direct tests for all exposed routes. Pipeline state is included because it enumerates the critical-action family; it does not make the deferred compensating/superseding-record policy implemented.

## ADR-0080 — advisory native slicing

The generic slicing guard and its fixture suite retain the original staged decision surface. Native Codex and Antigravity adapters share bounded private state, register through their respective manifests, deduplicate retries, and reset serial classification on direct fan-out evidence. These paths emit a runner-native advisory only; they do not reject a dispatch, require a workflow, claim model comprehension, or record a live-delivery receipt. The final 2026-09-07 addendum therefore remains an advisory first increment, with its stated live-probe work outside this coverage declaration.

## Deliberate omissions

Generated plugin ADR copies are not edited here. No runtime/provider/model/policy/schema/ledger/test/checker bytes changed. The compensating/superseding fork-disposition policy remains explicitly deferred by ADR-0072, and ADR-0080's optional later disclosure enforcement is not represented as an implemented owner.
