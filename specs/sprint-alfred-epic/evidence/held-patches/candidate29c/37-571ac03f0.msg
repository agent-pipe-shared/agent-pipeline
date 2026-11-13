feat(close): refuse an unproven gate-definition change and add the PO acknowledgement route

ADR-0096 (D248, Claude test run 3 finding L4). The close walks every
gate-definition change of the feature range and refuses one without a
proof (CLOSE-GATE-CHANGE-UNPROVEN; an unreadable range is
CLOSE-GATE-CHANGE-UNREADABLE). The one-shot close asks the read-only
close-coordinator gate-changes command before Verify and stops there,
so nothing is written and no Verify is spent.

The repair is the new critical kind acknowledge-gate-definition-changes:
pipeline-state.mjs approve-gate-change-acknowledgement --by <label>
prints the PO's signing line, and po-human-approval.mjs builds the same
subject from the same builder (feature, range base, sorted change list
and its digest, candidate = clean HEAD). The record is labelled
"acknowledged after the fact". A dated Spec folder sets the range from
the first commit of that folder, read from the State by all three
callers alike.

The audit bundle carries the proven list as evidence item gate-changes
(GATE-CHANGE-LABELLED when a proof is a label), and the PO's
acknowledgement proof travels with the other critical proofs. The kind
constant lives in the leaf module critical-action-approval-request.mjs
and the rule table is built on first use: both closed an import cycle.

Tests: gate-definition-changes 9/9, audit-bundle 45/45,
critical-action-signature-round-trip (with a consumer leg) and
goldfish-host-commit-recover 48/48, finish-feature 68/68,
close-coordinator 56/56, close-path-e2e 9/9 (two cases re-run alone
after an edit during the run), happy-path pin 33/33 (1 skipped).

AI-Assisted: true
Dispatch: stage-0 (elephant)
