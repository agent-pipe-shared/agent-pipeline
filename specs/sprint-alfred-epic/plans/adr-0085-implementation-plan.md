# ADR-0085 implementation plan (one review, one signature)

Read-only planning pass, 2026-10-07 (design-tier model). ADR accepted by PO decision I. "Protected" includes the
`NEVER_LIFTABLE_KERNEL_PATHS` list (`lib/guard-maintenance-window.mjs:116-124`), which covers most modules touched here.

## Current approval path → disposition
- `pipeline-state.mjs` inspect (4139-4165) → `design-course-session.mjs --inspect`: REPLACE with typed "review-required / present-plan --review-receipt".
- `inspectDesignCourseSubmission` authoring-dispatch requirement (design-course-session.mjs:221-231): REMOVE. `submitPlan` busy clause (plan-spec-state-v2.mjs:700-709): KEEP (no longer trips).
- Producer/Advisor stage/exception rationale/`runDesignCourseV2` (design-course-session.mjs:103-156, 296-358, 417-423, 509-555): REMOVE.
- Coordinator script → coordinator-v2 → course store: REMOVE as approval precondition. Readiness child as content gate (package-v2:89,134): REMOVE → mechanical check.
- `present-plan --design-workflow-package` (pipeline-state.mjs:10606-10611) → package readers: REPLACE with consistency check + review-receipt binding; keep the request writer with a new schema; one ready sign command, review JSON to a file (T25).
- approve-plan / record (pipeline-state.mjs:8900-8928, 11000-11058), `validDesignWorkflowApproval` (plan-spec-state-v2.mjs:218-238), `validApprovalIntent` (design-workflow-approval.mjs:18-28): KEEP legacy, ADD new kind `design-approval`.
- Implementation boundary `designAdvisoryAdmission` (guard-devplan-policy.mjs:93-212) and `inspectArchitectureDesign` (architecture-design.mjs:301-317): ADD new-record branch, freeze legacy branches.
- Catalogue `sanctionedDesignCourseArgs` (lib/guard/command-catalogue.mjs:123): REMOVE → typed refusal; approve-plan shape gains the new flag.

## Slices
Unprotected (now, parallel): **U1** `lib/design-consistency-check.mjs` (pure checker, typed codes only); **U2** review-receipt schema + `lib/design-review-receipt.mjs` (initial/delta, round ≤ 2 per QG-13, source-drift refusal); **U3** `lib/design-approval-binding.mjs` (binding = PRD/Spec/companions/receipts digests; intent kind `design-approval`; no dispatch ids; depends U2); **U4** docs.
Protected (one signed package, RED tests first): **P0** RED fixtures (finished sources → present-plan --review-receipt → sign → approve; zero continuity-cas/overrides; legacy approvals still admit); **P1** new record + validator; **P2** legacy re-read; **P3** pipeline-state present-plan/inspect/approve-plan; **P4** po-human-approval describer (summary to file); **P5** guard-devplan-policy + architecture-design branches; **P6** catalogue/args; **P7** kernel list adds U1–U3; **P8** retire writers (typed stubs); **P9** verify registrations. After the package: typed stubs for course/builder/readiness scripts; close triage §2 items as superseded. R5-6 coordinator registration becomes moot.

## Migration
Existing approvals keep the frozen legacy branches; the new branch is selected only by the new record schema. Typed retirement codes table (`lib/retired-design-codes.mjs`): `DESIGN-COURSE-RETIRED`, `DESIGN-ADVISORY-COURSE-RETIRED`, `DWP-PRESENT-RETIRED`, `DWP-APPROVAL-REQUEST-RETIRED`; old codes map to "run one review; present-plan --review-receipt". Rev-5 re-read: see PO questions.

## Mechanical consistency check (`pipeline.design-consistency-check.v1`)
Inputs: plan submission digests, PRD `technical-spec-sha256` marker, Spec requirement register vs traceability IDs/counts, bound companions, review receipts. Codes: `DCC-PRD-MARKER-MISSING|DUPLICATE|STALE`, `DCC-PRD-DIGEST-DRIFT`, `DCC-SPEC-DIGEST-DRIFT`, `DCC-COUNT-MISMATCH`, `DCC-ID-DUPLICATE`, `DCC-PATH-UNTRACKED|MODIFIED|IGNORED|UNSAFE`, `DCC-REVIEW-RECEIPT-MISSING|BINDING`, `DCC-REVIEW-ROUND-EXCEEDED`, `DCC-REVIEW-DELTA-CHAIN`. No content-finding slot. Runs in present-plan before the request/sign command, again in approve-plan; inspect read-only.

## Open PO questions
1. Rev-5 legacy re-read: (a) keep the course-store reader byte-frozen, or (b) approved re-read mode `DWP2-LEGACY-APPROVED-REREAD` (checks package bytes, digests, exception binding, signature; works on a fresh clone).
2. Review receipt gate: must the verdict be PASS, or may the PO sign over open findings?
3. Register definition: Spec requirement IDs via `requirement-traceability.mjs`?
4. In-flight v2 presentations at upgrade: finish via legacy approve, or re-present?
