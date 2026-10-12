# Epic/feature design approval

Load this before the first `submit-plan` for an `epic` or `feature`. The
Coordinator owns the sequence; routine preparation is agent work. ADR-0085
governs the receipt-based flow: one independent design review, at most one delta
follow-up, and one final PO decision. Do not assemble a design-workflow package
or register an authoring dispatch as an approval input.

Normal architecture/design choices use Chat tiles with concrete options,
tradeoffs and a recommendation. Preserve the PO's actual selections, affected
contracts and digest-bound decision lineage in this same fixed design submission.
The configured final design approval covers those selected decisions together
with the design; when a signature is required, obtain one bundled design
signature. No separate normal ADR terminal, activation or adoption signature is
added. After genuine aggregate approval, the sanctioned source consumer verifies
the binding and materializes the approved records internally. Chat selections
alone do not grant implementation authority or let an agent self-approve records.
Exceptional recovery and higher-layer exceptions retain their applicable checks.

Advisor capability preflight is model-free for these profiles. Consultation is
on demand for one concrete question, reason and digest-bound evidence, under
the existing Advisor-consult contract. Bootstrap, resume, Compact, a configured
route or export consent does not by itself trigger consultation. There is no
mandatory initial Advisor course or exception rationale when no consultation
was needed; capability evidence is not an Advisor answer.

1. Complete the material input, PRD, Spec and bound companions in draft. Finish
   relevant document corrections before binding the final source hashes.
   Run deterministic checks for paths, hashes, references and configured
   verification. Check explicit machine-checkable rules; do not invent
   arithmetic from prose. Preserve the separately adopted Reader-review course
   and evidence; it is not the independent technical design review.
2. Obtain one independent review of the final design sources. Resolve its
   findings; if sources change, use at most one delta follow-up and bind the
   final receipt to the current sources. Do not add a separate readiness child
   that repeats the content review. Preserve the report and canonical review
   receipt, including the receipt chain when a delta is used.
3. Use the sanctioned source-binding and document-integration routes. Keep
   PRD/Spec markers current and commit the finalized sources, bound companions,
   review reports and receipts. Before presentation every bound path must be
   a tracked, unmodified regular file. If bound or submitted sources require
   material edits, use the current inspector's sanctioned draft recovery;
   never edit authority markers manually or invent a rebind command.
4. Establish an exact current submission with `submit-plan` when needed. This
   is mechanical agent work, not another PO permission. Inspect the resulting
   state. For `epic`/`feature`, use `present-plan --by <presenter>
   --review-receipt <repo-relative-json-path>`, repeating `--review-receipt`
   once only when the current review chain includes the delta follow-up.
   Supply one or two distinct tracked receipts in chain order. The retired
   `--design-workflow-package` flag is rejected with `DWP-PRESENT-RETIRED`;
   it is not a recovery route.
5. The lifecycle writer checks the current source/receipt binding mechanically:
   PRD/Spec hashes and technical marker, register/traceability consistency,
   tracked unchanged paths, receipt/report provenance and committed candidate.
   Resolve typed inconsistencies through the returned sanctioned actions; this
   check does not judge content or replace the independent review. Present the
   final design, then follow the inspector's exact action for the configured
   single PO approval ceremony. Only that final recorded decision opens
   implementation. No separate package or Advisor-exception approval is added.

`pipeline-state inspect` is the current action authority. Its receipt request
does not dispatch reviewers or waive ordinary authoring/provenance obligations.
The approval binding must be rebuilt after material source or review drift;
an older receipt or approval request is not current evidence. Keep historical
approval evidence intact and use typed migration hints for retired machinery.
