---
schema: pipeline.backlog-item.v1
id: pipeline.readiness-input-omits-current-advisor-observation
type: defect
owner: pipeline
status: open
created: 2026-09-28
source: "Two real independent native Readiness runs report absent current Advisor evidence although the canonical current no-child receipt was exported before each run."
sprint: none
done_when: manual
---

# Supply current Advisor observations to independent design readiness

## Reproduced behavior

For candidates `9a416793af66d75e1cdcefe162e47bfef182b688` and
`628df5aa29f613510c36e0543cfcea6507b8bcb9`, the canonical design coordinator
produced and exported current candidate/design-bound no-child unavailable
Advisor receipts before the native independent Readiness turn.
Readiness nevertheless reported `CURRENT_ADVISOR_BINDING_MISSING` and
`ADVISOR-CURRENT-BINDING-MISSING`, respectively. The second report confirms
that the five sources align on coverage, preservation, implementation
authority and one final PO decision; the sole blocker is missing supplied
current Advisor evidence.

`buildCodexToolFreeReadinessRequest` serializes only five normative sources.
The tool-free reviewer cannot read their linked receipt files, and the
bootstrap has no declared Advisor-observation input. Citing an earlier
receipt inside a newly committed design remains historical; demanding a
receipt hash inside the same design commit to which that receipt binds
would create a circular publication requirement.

Evidence is the unchanged public receipts:

- `specs/sprint-alfred-epic/evidence/design-readiness-9a416793-20260928b.json`
- `specs/sprint-alfred-epic/evidence/design-readiness-628df5aa-20260928c.json`
- `specs/sprint-alfred-epic/evidence/design-advisor-90ff3992e820656a3f4f10f1e92fb017a05ca9fb572614fb20b84f0ce420b5b3.receipt.json`
- `specs/sprint-alfred-epic/evidence/design-advisor-90ff3992e820656a3f4f10f1e92fb017a05ca9fb572614fb20b84f0ce420b5b3.route-selection.json`

## Acceptance

- Supply bounded, explicitly declared current Advisor result/failure and
  disposition observations to the independent turn alongside the same five
  normative sources. No undeclared sixth source or inherited conversation.
- Verify applicable canonical receipt/route contracts and actual current
  candidate/question/source binding before transmission; keep no-child,
  unavailable and answered observations distinct and truthful.
- Bind the exact observation context through the actual request and immutable
  private execution custody. A fresh independent verifier reconstructs that
  binding; caller assertions and model identity claims cannot replace it.
- Final package validation still independently checks current canonical
  Advisor and readiness provenance, final sources and the PO decision.
- Preserve old not-ready reports as historical failures. No manual conversion
  to Ready, hidden instruction to waive evidence or alternative export after
  a host denial.
- Exercise actual bootstrap-to-host-to-fresh-verifier context delivery and
  refusal of substituted receipt, wrong candidate/question, context drift,
  oversized data, aliases and missing context. Re-run the actual independent
  review only after the declared context is available.

No repeated Advisor model call was observed: the canonical results contain
zero invocation attempts and no child. This item concerns the Readiness
input boundary and remains open until source integration and verification.
