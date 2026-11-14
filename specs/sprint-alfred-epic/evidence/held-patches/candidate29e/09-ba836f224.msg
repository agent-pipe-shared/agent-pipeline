fix(critic): a split part's envelope names its scope marker, a stage-0 commit without production code is no finding, re-pin once

PO tile T5+T1 of 2026-11-14: one approved re-pin of the Critic template
preimage for two changes.

T5: an Antigravity split part could not be attributed. The paths-only
envelope had no row for the part's scope marker, so the builder only
reported a limitation and the merge refused the child verdict with
CSM-CHILD-UNATTRIBUTED. The envelope now has a scope-marker row, filled
for one part of a split review and dropped for a whole-range review, and
the template body tells the Critic to begin trajectory_evidence with the
marker it is given (row or batch scope). The row carries no prose, so
the Contamination Rule still admits the envelope.

T1: with ADR-0101 a stage-0 commit may change tests, pins and documents.
roles/critic.md and the template now say that a commit with the
trailer Dispatch: stage-0 (elephant) that touches no production path is
no finding, and one that touches production code is judged against the
stage-0 criteria in EL-01.

The preimage pin takes the new digests of roles/critic.md and the
template; the plugin template copy and the vendored roles/critic.md are
byte-identical copies. Tests: each split part carries exactly one
scope-marker row, passes CRITIC_DISPATCH_PROSE, carries no forbidden
value and a verdict that begins with it is attributed to that part; a
whole-range envelope has no row.

AI-Assisted: true
Dispatch: stage-0 (elephant)
