---
schema: pipeline.backlog-item.v1
id: pipeline.design-workflow-package-omits-contract
type: defect
owner: pipeline
status: open
created: 2026-09-28
source: "Independent provisional Codex five-source readiness comparison on 2026-09-28; scratch/codex-readiness-provisional-report.json."
sprint: alfred
done_when: manual
---

# The five-source design package omits material workflow rules

## Description

The proposed readiness package lists the original input, PRD, Spec, the 0.7
greenfield design addendum and traceability. The addendum and traceability
delegate essential workflow rules to `design-advisory-workflow.md`, a sixth file
outside the review set. A valid independent reviewer therefore cannot verify
the requested sequence, Advisor fallback and exception boundary, implementation
authority predicate, or one-final-approval rule from the supplied design.
The original input's Critic-before-Full-Verify and chat/signature consistency
integration is also incomplete in the five-source mapping.

## Affected artifact

`specs/sprint-alfred-epic/design/greenfield-0.7-remediation-2026-09-27.md`,
`greenfield-0.7-traceability-2026-09-27.md`, and the final package's five-source
inventory. A proposed exact correction is in
`scratch/greenfield-design-readiness-fix.patch`.

## Proposal

Place the material workflow and authority contract in the design source that
the readiness reviewer actually receives, or formally choose and bind a
different complete design source. Make the final plan approval the one ordinary
package decision; distinguish earlier intake acknowledgement and per-file
write signatures from that decision. Specify the narrow unavailable exception,
its real route attempts and non-authorizing status. Map Critic/Verify ordering,
installed-version drift, and chat/signature equivalence explicitly.

## Acceptance

- The five selected committed sources are self-contained for every material
  requirement in the original input, with exact current hashes.
- A fresh independent reviewer validates the complete design and traceability
  without needing unlisted files or inferring approval from a draft.
- The package validator and each runner transition reject missing, forged,
  stale, mismatched, failed and replayed required evidence.
- The one final ordinary PO decision binds the full package, readiness and any
  Advisor exception. Neither a proposed exception nor an exact-file write
  signature creates implementation authority.
- Candidate-bound Critic-before-Full-Verify, installed-plugin readback and
  chat/signature consistency have owned acceptance checks.

## Triage

Confirmed as a five-source package coverage gap. The provisional review
returned five blocking findings; its standalone probe is not a host-bound
readiness receipt. Recheck after the design correction is committed.
