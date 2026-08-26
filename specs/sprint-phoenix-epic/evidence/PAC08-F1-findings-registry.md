# P-AC-08 — prior finding registry (neutral, delta re-review)

Source: independent Critic review, 2026-08-11 (single commit `5420c5e7`),
full report at `specs/sprint-phoenix-epic/evidence/pac08-fb-critic-review-5420c5e7.md`.

- **F1 (major):** the state write `defaultFeaturePackageReconcileApproval`
  added called `writeState(dir, ...)`, which acquires its own exclusive
  continuity lock on `dir`. `runFeaturePackageReconcileCommand` already holds
  an exclusive continuity lock on `root` across its whole body, and the
  approval closure runs inside that window. When `dir` and `root` resolve to
  the same directory, the inner lock acquisition collides with the still-held
  outer one at the identical lock path and refuses.
- **F2 (major):** no test case in that commit's suite ever omits `dir`
  (letting it default to `projectDir()`) with `root` pointing at the same
  directory — every case injects a separate `dir` fixture from `root`.
- **F3 (minor):** a refused approval whose proof had already been consumed
  (a genuine replay) was reported to the operator with a message asserting
  the proof did not bind the candidate/plan digest — a different, false
  cause.

This delta reviews commit `3e1a727e` against these three findings only.
