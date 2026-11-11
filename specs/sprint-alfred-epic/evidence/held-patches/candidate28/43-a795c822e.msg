feat(host-commit): warn on commits into a running Goldfish's scope and recover idempotently

- guard-git and commit-pipeline-owned warn once when a commit touches the
  write scope of a running Goldfish; commit-pipeline-owned takes
  --acknowledge-goldfish <id> and records the trailer
  Concurrent-Goldfish: <id> (held patch C28-HOST-COMMIT-RECOVERY,
  Goldfish-built; shared reader lib/running-goldfish-scope.mjs).
- goldfish-host-commit-recover moves forward when HEAD advanced and has a
  record-only mode, both idempotent on a rerun.
- Stop-failure hints are bound to their dispatch id, so a later unrelated
  dispatch no longer receives an old hint.
- Elephant: the native host-state (82) and wait-host-commit (7) suites
  run green; the guard admits the new flag (probed against this clone's
  guard).

AI-Assisted: true
Dispatch: stage-0 (elephant)
