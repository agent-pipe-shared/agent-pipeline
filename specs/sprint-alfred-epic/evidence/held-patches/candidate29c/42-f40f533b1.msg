docs(adr): a pre-existing red check is repaired by a maintenance dispatch (ADR-0097, D249)

K-28 (Glossover Epic 2): a check that was red before the feature, with
no criterion of the approved Spec covering it, had no sanctioned
dispatch route; the only workaround was a placeholder criterion.

PO tiles 2026-11-13: a maintenance dispatch route; "red before the
feature" proven by a red Verify receipt at or before the plan-approval
commit, otherwise one signed PO acknowledgement (both routes allowed).

The ADR fixes the binding kind (maintenance instead of a criterion,
exactly one check), the narrow write scope (test- or tooling-shaped
dependencies of the check, never a gate-strength path or the approved
PRD/Spec), the host-side red observation on the real checkout and the
green check after delivery, and the Critic packet fields. Register
entry in docs/state.md, index row in docs/adr/README.md.

AI-Assisted: true
Dispatch: stage-0 (elephant)
