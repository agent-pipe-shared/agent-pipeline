feat(guard): protect the boundary policy and the fitness model as gate-strength paths GS-16/GS-17

- ADR-0096 (D248, L4): architecture/boundary-policy.json and
  architecture/fitness-model.json join GATE_STRENGTH_PATHS; the Write/Edit
  guard, the shell lane and the pre-commit hook follow the table.
- First creation stays free by the existing first-appearance rule; a later
  change, a deletion or a re-creation after a deletion needs a proof.

AI-Assisted: true
Dispatch: stage-0 (elephant)
