---
schema: pipeline.backlog-item.v1
id: pipeline.onboarding-spec-marker-has-no-preapproval-reconcile
type: defect
owner: pipeline
status: open
created: 2026-09-27
source: "Claude/Windows greenfield review F-04, 2026-09-27; consumer reports blocked ad-hoc hashing, source confirms marker requirement and a separate post-approval rebind helper."
sprint: alfred
done_when: manual
---

# Onboarding cannot reconcile its Spec digest marker before approval

## Description

The generated PRD contains a `technical-spec-sha256` marker. Editing the Spec
during required design work makes it stale. The Claude consumer reports that
ad-hoc `node -e` hashing was refused in `bootstrap-binding-required`, with no
returned marker-reconciliation action. The existing PO-authority rebind code
can replace a marker under an already valid approval; it does not establish a
documented preapproval onboarding repair path.

## Affected artifact

Onboarding design generation, PRD/Spec marker contract,
`project-onboarding-v3.mjs`, and lifecycle admission.

## Proposal

Return a typed digest-bound action that computes the current Spec hash and
updates only the PRD marker before PO approval, then reads both documents back.
Keep the substantive PRD/Spec review separate from this mechanical repair.

## Acceptance

- Editing a generated Spec yields an executable, phase-admitted marker repair.
- The repair changes only the marker, binds the observed Spec bytes, and has
  a clear stale-plan refusal on concurrent edits.
- A fresh Claude/Windows run reaches PO review with matching marker and Spec.

## Triage

