---
schema: pipeline.backlog-item.v1
id: pipeline.implementation-without-dispatch-escapes-review-coverage
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-23
source: "Reconstructed from the pin header, PO permission 2026-10-23, for exactly this file (decision tile batch 12, row 37). The original item file has no public text; this text is derived 1:1 from the header and the cases of plugins/pipeline-core/lib/pins/implementation-without-dispatch-escapes-review-coverage.test.mjs (ALF-C-P14-03, AC-204)."
sprint: none
done_when: manual
---

# Implementation without a dispatch escapes review coverage (reconstructed)

> Reconstructed item, reconstructed from the pin header, PO permission 2026-10-23.
> The original text was not preserved publicly. Only the acceptance points below
> are known, taken from the regression pin header and the cases that pin it.
> Nothing else of the original description is claimed here.

## Description

The reverse inventory (candidate commit range to dispatch records) must expose
implementation commits that carry no dispatch record. An empty or unproved
comparison is never treated as coverage. The report stays report-only and has no
completion effect.

## Acceptance

The pin cases carry no explicit ids; they are numbered P1 to P10 in file order
(the ten cases of the main block) and R1 to R3 (the three RED cases). Each clause
below lists exactly what those cases assert.

- (A) An implementation commit without a dispatch record is exposed, and a record that does not prove coverage does not cover its commit.
  - (A1) P1: a commit with no dispatch record is reported as a `REPORT-IMPLEMENTATION-WITHOUT-DISPATCH-MAPPING` finding (state `gaps`, mapping `missing`), and its path is still mapped to the commit.
  - (A2) P2: a commit with a structurally matching record is mapped (`structural-match`) but stays unproved: admission `REPORT-AUTHENTIC-ADMISSION-NOT-PROVED`, review `REPORT-BOUND-REVIEW-NOT-PROVED`, authorship `unknown`; the mapped commit raises no finding, and the record-carrying commit, having no record of its own, is surfaced.
  - (A3) P7: two records claiming one commit are reported ambiguous (`REPORT-AMBIGUOUS-DISPATCH-MAPPING`); an invalid record stays `unknown` (`REPORT-DISPATCH-INVALID`); the state is `gaps`.
  - (A4) P8: a non-terminal dispatch record is `not-applicable` and does not cover its implementation commit, which is reported as missing.
- (B) An empty or unproved comparison is never coverage.
  - (B1) P3: an empty comparison range is explicit (`trueEmptyRange`, `zeroApplicableRowsIsCoverage` false), the state is `unknown` and there are no findings.
  - (B2) P4: without a base commit the state is `unknown`, the baseline is unavailable (`REPORT-BASE-NOT-SUPPLIED`), there is no comparison and no findings.
  - (B3) P5: a base that is not an ancestor degrades to `unknown` with the baseline unavailable (`REPORT-GIT-UNAVAILABLE`), never to a pass.
  - (B4) P6: the baseline owner stays unresolved even for a good range (`REPORT-IMPLEMENTATION-BASELINE-OWNER-UNRESOLVED`); no baseline authority is claimed.
- (C) The report is report-only with no completion effect.
  - (C1) P9: in every state the report has `reportOnly` true, `completionEffect` `none`, schema `pipeline.candidate-implementation-coverage-report.v1`, and a state that is `unknown` or `gaps`, never a pass.
  - (C2) P10: the CLI surfaces the same gap (A1), is report-only (exit 0, `completionEffect` `none`), gives `unknown` without a base (B2) and the empty-range result (B1), and rejects malformed arguments with exit status 2.
- (D) The assertions are shown to be able to fail.
  - (D1) R1: a mirror of the module that drops the unmapped-commit findings fails the A1 assertion.
  - (D2) R2: a mirror that counts an empty range as coverage fails the B1 assertion.
  - (D3) R3: the unmodified production function passes the same assertions.

## Open work

- Every case is a typed skip on a host without a trusted `git` in the fixed trusted roots (native Windows without git there); the pin records the owner as Coordinator, due 2026-10-19 for the Linux/WSL run (PO decision K7).

Source: pin header ALF-C-P14-03 / AC-204 (reconstructed from the pin header, PO permission 2026-10-23).
