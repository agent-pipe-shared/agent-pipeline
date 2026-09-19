# Draft: Content-bound review before final verification

## Status

Proposed technical contract, 2026-09-19. The PO selected the workflow
`Critic → fix → diff Critic → full Verify → fix → full Verify` and requested
regular implementation rather than a one-run exception. This draft records the
implementation obligations; it does not assert a reviewed implementation or
release acceptance. Number allocation follows ADR-0069.

## Context

ADR-0005's two-part definition of done remains essential: deterministic checks
and independent judgment both qualify a delivery. Its prerequisite ordering,
however, can create a cycle when Verify requires Critic coverage while Critic
admission requires green Verify. Rerunning deterministic checks also must not
erase a genuine review of unchanged substantive content.

## Decision proposed for implementation

1. A frozen candidate with bounded specification, guardrails and honest current
   execution evidence may enter independent Critic review before Full Verify.
   Missing or failing checks remain visibly pending or failed; candidate binding
   alone is never evidence that a command passed. Review admission must not
   depend on already having its own review completion record.
2. A review verdict binds its original candidate, scope, substantive artifact
   content and governing inputs. Do not rewrite that original receipt when
   subsequent evidence is produced. A later verification run alone does not
   invalidate the verdict.
3. Retained coverage must be checked mechanically against current Git objects,
   including paths, file modes, additions/deletions and governing inputs. A
   matching filename, commit ancestry, narrative claim or directory-based
   evidence exemption is insufficient. Unknown impact requires review.
4. A substantive correction receives a fresh bounded diff review with the
   previous reviewed candidate as its base. Retain unchanged coverage and open
   finding dispositions in the coordinator's lineage; never send prior verdict
   prose to the fresh Critic. A partial first review plus a passing correction
   does not establish coverage of previously unreviewed content.
5. Full Verify, security and required review coverage must all qualify the
   final local candidate. Publication and push retain their own independent
   configured approval gates. No pending review is represented as a PASS.
6. Verification-only activity needs no new review when substantive coverage
   remains valid. A fix to a verifier, test, guard or approval contract may be
   substantive even if called an evidence repair; its label grants no exemption.

## Consequences

Critic and deterministic verification remain complementary requirements, but
neither requires the other's completed receipt merely to start. The system
needs an explicit review-readiness representation, honest no-delivery dispatch
records, and retained-coverage validation. Existing immutable receipts and
historical ADRs remain evidence of their original state.

## Affected contracts

- ADR-0005 ordering (not its two-part DoD); ADR-0081 boundary-aware Verify.
- Operating Model lifecycle and review admission; Critic skill and templates.
- Critic dispatch preflight, session finalization and review lineage.
- Dispatch-record completion/coverage and full Verify consumers.
- Local-candidate qualification and publication gate consumers.

## Required regression evidence

First review before full Verify; explicit pending/failed deterministic status;
valid unchanged-content PASS retained across evidence-only runs; substantive
and governing-input changes require diff review; unknown/new/deleted paths
cannot inherit coverage; altered or missing receipts fail closed; partial
coverage never becomes full coverage; final Verify and approval gates remain
mandatory. Tests must exercise real admission and qualification consumers, not
only a newly added helper.
