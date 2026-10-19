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
   receipt, including the receipt chain when a delta is used. Produce each
   receipt with `node <plugin-root>/scripts/design-review-receipt.mjs create`
   (`--repo`, `--feature`, `--report`, `--prd`, `--spec`, `--out`; `--companion`,
   `--previous` for the delta and `--open-finding` as needed). It reads the
   sources and the report from disk and stamps the review time, runner and
   reviewer model itself. Never write or edit a receipt by hand: a hand-written
   receipt is not admissible evidence.
   Dispatching the design review: the `critic-review` skill is for implementation
   batches (diff range, batch preflight) and does not fit uncommitted design
   sources. Dispatch the agent type `pipeline-core:readiness-reviewer` instead.
   Its briefing needs a line `Ruleset SHA: <sha>` (`ruleset-sha` or `=` also
   read; without it `DISPATCH-NO-RULESET-SHA`) and any model-family token such
   as `Requested route: claude-sonnet-5-5` (without it `DISPATCH-NO-MODEL`), and
   none of the contamination phrases (claims-to-verify, hunt list, expected
   verdict). Naming Opus additionally needs `Batch scope (MP-07):` and a
   rationale line (`DISPATCH-OPUS-NO-BATCH-RATIONALE`). Then create the receipt.
   After the delta round: if round 2 still reports open findings, correct the
   sources with `reopen-design`, `submit-plan`, `present-plan`. The approval
   then carries the change as `unreviewedSourceDelta`, which the PO signs
   knowingly; there is no round 3. `DRR-SOURCE-DRIFT` with `nextRound: null` is
   not a dead end here: `present-plan` does not use that check.
3. Use the sanctioned source-binding and document-integration routes. Keep
   PRD/Spec markers current and commit the finalized sources, bound companions,
   review reports and receipts. Before presentation every bound path must be
   a tracked, unmodified regular file. If bound or submitted sources require
   material edits, use the current inspector's sanctioned draft recovery;
   never edit authority markers manually or invent a rebind command.
4. Author the architecture design package in the draft PRD (physical map,
   fitness model, baseline and the declared implementation surface, committed
   in draft) before `submit-plan`; without it `submit-plan` refuses with
   `ARCHITECTURE-DESIGN-PACKAGE-REQUIRED`. Source files stay out of the draft
   commit until `set-phase implementation`.
5. Establish an exact current submission with `submit-plan` when needed. This
   is mechanical agent work, not another PO permission. Inspect the resulting
   state. For `epic`/`feature`, use `present-plan --by <presenter>
   --review-receipt <repo-relative-json-path>`, repeating `--review-receipt`
   once only when the current review chain includes the delta follow-up.
   `--by` is an actor attribution, not a substitute for approval.
   Supply one or two distinct tracked receipts in chain order. The retired
   `--design-workflow-package` flag is rejected with `DWP-PRESENT-RETIRED`;
   it is not a recovery route.
6. The lifecycle writer checks the current source/receipt binding mechanically:
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
