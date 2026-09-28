---
schema: pipeline.backlog-item.v1
id: pipeline.design-approval-validator-rejects-json-key-reordering
type: defect
owner: pipeline
status: open
created: 2026-09-28
source: "Actual Source validator reproduction against the genuinely approved package: original request accepted; semantically identical recursively sorted JSON rejected as DWP-APPROVAL-INTENT-DRIFT. Terminal 03e031, exit 0; no signing or provider call."
sprint: alfred
done_when: manual
---

# Design approval validation incorrectly depends on JSON key order

`validateDesignWorkflowPackageApprovalRequest` compares recomputed and received
approval intents using `JSON.stringify`. This compares insertion order even
though PO intent hashing uses a canonical JSON contract. A transport that sorts
keys therefore makes an unchanged valid request appear to have drifted.

The reproduction uses the actual approved package and Source validator, with
the supported approved-package reader for unrelated descendant commits. The
original request succeeds, the reordered request fails, and canonical bytes
are identical. Canonical request SHA-256:
`719e8af8d1414d8a1ef81a066b797db646b9b4e94e3c3646101c7071864c6980`.
Evidence: `scratch/0.7-dwp-ordering-reproduction-20260928.json`.
This is distinct from the registered Claude readiness alias defect. Both can
obstruct the default-validator signing integration fixture.

## Acceptance

- Validate semantic equality with the existing canonical PO intent contract,
  preserving exact shape, bindings and recomputed digest verification.
- Accept equivalent JSON member order at all nested intent levels.
- Continue to reject unknown properties, changed feature/candidate/source/
  package/decision values and incorrect digests before confirmation or signing.
- Complete a default-validator disposable-key signing and proof-readback
  fixture; do not override package or readiness validators to force acceptance.
- Retain the genuinely approved current package and signature without a new
  plan ceremony merely to correct its transport validator.

## Triage

- **Decision:** Confirmed 0.7 signing-transport defect.
- **Assignment:** Approval-request validator and default signing regression,
  alongside the separate readiness alias correction.
- **Date:** 2026-09-28.
