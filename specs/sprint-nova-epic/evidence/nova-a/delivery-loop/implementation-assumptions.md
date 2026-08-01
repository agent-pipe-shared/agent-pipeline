# Nova A6R implementation assumptions

Status: active local-candidate assumptions for Issue #98. Each assumption is
bounded by the accepted PRD, Spec, Acceptance matrix and post-v0.4.7 design;
none widens publication authority or closes another Nova issue.

1. The immutable adoption baseline is commit
   `89cb12b99e3fd86ac44878d0c23b278f00538921`, tree
   `b6537dcaa7bee526d9a393e2603b28648f4b0438`. A newer `main` does not silently
   retarget Nova.
2. Released v0.4.7 behavior wins semantic overlaps unless Issue #98 explicitly
   requires a correction. Existing contracts outside the A6R manifest remain
   unchanged.
3. The local `ahead=120, behind=50` divergence is the expected result of the
   approved history rewrite. Local work and commits are PO-authorized; the
   configured upstream remains
   `upstream/feat/sprint-nova-codex-v046`, and no push occurs before the named
   Push PO gate.
4. Replacing the existing remote feature ref after a clean rebase is a
   separately reviewed Push-PO operation. The #98 publication-v2 product path
   remains non-force and rejects a non-fast-forward candidate; it must not
   smuggle the later branch replacement through an internal lease option.
5. `pipeline.publication-channel.v1` stays byte- and behavior-compatible. New
   Critic and release-preflight bindings use a v2 successor in the same private
   authority family/store; v1 approval cannot authorize v2.
6. The universal PO emergency path is final only for an exact project-policy
   decision after normal/narrower recovery is exhausted. It never manufactures
   host/OS capability, publishes, ignores Security, executes the action, or
   claims its effect; ordinary retry and readback remain mandatory.
7. Full Verify resume state is private machine-local recovery data under the
   physical Git common directory per ADR-0050. It is neither tracked project
   State nor portable PASS evidence.
8. Pre-rebase and historical v0.4.7 Verify, Security, Critic, preflight and
   publication results are provenance only. Every final Nova candidate gate is
   rerun from the exact final commit/tree.
9. Issue #98 changes only A6R-authorized shared surfaces. It does not reopen
   completed v0.4.7 Hotfix behavior or claim completion of the remaining Nova
   issue set.
10. Temporary TP-1/TP-3/TP-5 lifts are confined to the exact Nova tests and
    registration work already authorized by the PO. All protected surfaces
    must be restored before candidate gates and remain active through the Push
    PO gate.
11. A replayed pre-v0.4.7 onboarding addition may be corrected only where the
    combined tree is mechanically invalid or contradicts the newer released
    lifecycle contract. The bounded corrections are the duplicate schema
    declaration, unreachable V4 CLI dispatch, missing selected-runner and
    authenticated-repair bindings, and the testable Codex executable binding;
    released v0.4.7 lifecycle behavior remains controlling. The complete
    onboarding regression suite must pass after that reconciliation.
