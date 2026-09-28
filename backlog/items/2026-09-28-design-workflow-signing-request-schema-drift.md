---
schema: pipeline.backlog-item.v1
id: pipeline.design-workflow-signing-request-schema-drift
type: defect
owner: pipeline
status: open
created: 2026-09-28
source: "Source verification during local 0.7 preparation: the canonical presented design-workflow request carries approvalIntent.sha256, whereas sign-intent --request requires top-level intentSha256 before reaching its design-workflow validator. No real key or signing invocation was used to diagnose this mismatch."
sprint: alfred
done_when: manual
---

# Canonical design-workflow signing request is rejected by its signing transport

`writeDesignWorkflowApprovalRequest` emits the closed four-field
`pipeline.design-workflow-package-approval-request.v1` record. Its intent digest
is `approvalIntent.sha256`. `validateDesignWorkflowPackageApprovalRequest`
requires exactly those four fields. The sign-intent request loader instead
requires `record.intentSha256` before invoking the existing complete-package
disclosure and validator. Adding that extra field is not a valid workaround.

The physically presented request for package `001799025440419ed2d94f80d221b02fab9cae07860bc234fdf83caaa56a1b03`
exhibits this producer/consumer mismatch. The package is not now proposed for
approval of the newly expanded scope. No cryptographic failure, forged proof or
missing human consent is inferred from the transport defect.

## Acceptance

- Accept the exact canonical closed request through the standard attended
  `sign-intent --request` route, derive its nested digest and disclose the complete
  revalidated package before the existing single human confirmation.
- Preserve default source/package/independent-readiness validation, configured
  trust anchors, physical Scratch boundaries and genuine signing behavior.
- Reject malformed, extra-field, tampered, stale and mismatched requests before
  signing. Preserve all other supported request schemas and bare-digest behavior.
- Produce the ordinary public proof/signer siblings, and verify them through the
  canonical approve-plan consumer in isolated integration fixtures.
- No private PO key is read by an agent and no source/test callback can manufacture
  authority. A temporary operator helper is not closure of this defect.

## Triage

- **Decision:** Include the confirmed transport defect in the next local candidate.
- **Assignment:** Narrow signer transport and existing signing tests; preserve the
  package schema. Coordinate final source integration with the extended design
  package and installed runtime compatibility work.
- **Date:** 2026-09-28
