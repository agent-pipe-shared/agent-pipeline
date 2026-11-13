feat(writer-commit): materialize-architecture arms the fitness model commit through a closed writer-to-gate map

- ADR-0096 (D248): WRITER_GATE_STRENGTH_IDS maps exactly
  "pipeline-state.mjs materialize-architecture" to GS-17; a gate-strength
  path is otherwise never armed, and the pre-commit hook passes the gate
  rule id so another writer's record never admits it.
- materialize-architecture joins WRITER_COMMIT_COMMANDS.
- Hook test: the own writer commits the fitness model, approve-plan's record
  for the same bytes is excluded and refused (GS-17), a boundary-policy change
  is refused (GS-16).

AI-Assisted: true
Dispatch: stage-0 (elephant)
