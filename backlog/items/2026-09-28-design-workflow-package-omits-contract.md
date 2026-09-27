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
The later selected Codex readiness replay additionally confirmed that PRD and
Spec do not state the design-workflow sequence, shared authority gate, or
single final approval as explicit normative 0.7 requirements. Amending only
the addendum and traceability would leave this cross-document gap open.
The tool-free Codex host review of the prepared correction found a further
internal sequencing contradiction: PRD puts E1 freeze after implementation
authority, whereas Spec's implementation-ready predicate requires that
freeze. Spec also lacked explicit host-verifiable freshness and read-only
requirements for the independent reviewer.

## Affected artifact

`specs/sprint-alfred-epic/prd_sprint-alfred-epic.md`, `spec.md`,
`design/greenfield-0.7-remediation-2026-09-27.md`,
`design/greenfield-0.7-traceability-2026-09-27.md`, and the final package's five-source
inventory. A proposed exact correction is in
`scratch/greenfield-design-readiness-fix.patch`.

## Proposal

Place the product obligation in PRD and the testable authority contract in
Spec, with matching design and traceability in the five-source package. Make
the final plan approval the one ordinary
package decision; distinguish earlier intake acknowledgement and per-file
write signatures from that decision. Specify the narrow unavailable exception,
its real route attempts and non-authorizing status. Map Critic/Verify ordering,
installed-version drift, and chat/signature equivalence explicitly.
Separate implementation authorization from dependent-WP readiness: the first
authorized foundation act creates E1; later WPs require its valid committed
output. Make fresh-session isolation, exact tool/profile admission, effect
checks and private host evidence explicit in the readiness contract.

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
- E1 can be created after valid implementation authorization without depending
  on its own output, while dependent WPs still require the committed freeze.
- Freshness and read-only readiness are established by independently verified
  host evidence, including negative mutation, inherited-tool and crash tests;
  reviewer self-assertions do not satisfy the authority predicate.

## Triage

Confirmed as a five-source package coverage gap. The provisional review
returned five blocking findings. A later selected-sandbox diagnostic produced
a host-bound probe receipt with three blocking findings, including the PRD/Spec
gap, but used substituted Scratch code and is not production readiness.
A later authenticated tool-free host comparison of the prepared five sources
confirmed the E1 cycle and missing normative execution assurance. Both were
verified against the exact PRD/Spec passages and corrected in the scratch
patch. One fresh correction-scoped host re-review then returned
`ready-for-po-review` with no findings or unresolved choices, bound to the
updated patch digest and unchanged proposed source bytes. This closes the
provisional content-correction course, not the backlog item. Recheck after
the full correction is committed; no provisional result is a production gate
or release stamp.
