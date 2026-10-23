---
schema: pipeline.backlog-item.v1
id: pipeline.domain-scanner-findings-need-reproduction-before-remedy
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-23
source: "Reconstructed 2026-10-23 with explicit PO permission for exactly this file (decision tile batch 8, row 17). The original item file has no git history; this text is derived 1:1 from the acceptance points in the header of plugins/pipeline-core/lib/pins/domain-scanner-findings-need-reproduction-before-remedy.test.mjs (ALF-C-P21-05 / AC-166)."
sprint: none
done_when: manual
---

# Domain-scanner findings need reproduction before a remedy (reconstructed)

> Reconstructed item. The original text was not preserved in git history. Only the
> acceptance points below are known, taken from the regression pin header. Nothing
> else of the original description is claimed here.

## Description

A credential scanner reports a domain-shaped value as a finding (for example a
host name flagged as a generic API key). The remedy must not start from an
assumption that the finding is a false positive: the finding is first reproduced
and its exact value reviewed, and only that reviewed value is suppressed.

## Acceptance

- (A) An unknown or unavailable historical match stays explicit and no false-positive PASS is invented.
- (B) Credential-shaped positive controls still fail while an exact reviewed domain value is the only thing suppressed.
- (C) There is no secret-prefix whitelist, no automatic ignore generation, no blanket suppression and no lexical concealment.
- (D) The scanner verdict and the push authority are bound separately.
- (E) The value-identity repair keeps its scope (no duplicate ignore repair).

## Open questions for the PO

- R3: is the reproduction requirement a process rule, a scanner-output requirement, or a remedy-rejecting gate, and who may source the sanitized finding? The real gitleaks reproduction is a WSL Verify run.

Source: pin header ALF-C-P21-05 / AC-166 (reconstructed)
