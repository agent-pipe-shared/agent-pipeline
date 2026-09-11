# Required `done_when` enforcement evidence

Date: 2026-09-11

Before graduation, the live checker reported 654 items, zero malformed, zero
stale-open, zero regression, and zero undeclared `open`/`in_progress` items.
This establishes the campaign prerequisite recorded in the item's PO decision.

The focused synthetic suite passes after graduation and covers fatal
`UNDECLARED` for an open item, plus the preserved non-fatal counting of
undeclared rejected and deferred items. The live checker then reports only the
expected `STALE-OPEN` finding for the item whose own predicate is satisfied by
this implementation; closing that resolved item removes the finding.

Candidate-exact Verify and independent Critic results are appended here after
the administrative closure is part of the fixed candidate.

