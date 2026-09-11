# Critic disposition path-binding correction

Date: 2026-09-12  
Candidate: `0b34dbc111f98dd4b3b6d1408ef012a924cd9d63`  
Tree: `ec7e4e0e4ff3a24a9c9bd7e86054c2223089c20f`

The first independent Critic review of the v3 dispatch-disposition package
failed with three blocking findings:

- a free-text T5 skip could stand in for mandatory T1-T4 review;
- a legacy v2 record could still bind authorship;
- rollout, rollback, ownership and expiry were incomplete.

The first correction replaced free text with structured trigger input and an
explicit `criticRequired` state, made v2 nonbinding, and documented the rollout
and rollback. The bounded re-review failed with one remaining major finding:
the trigger flags were still supplied by the record itself, so a false
all-clear declaration could bypass mandatory review.

Commit `0b34dbc1` closes that path by deriving conservative architecture,
guardrail and security signals from the actual paths in each bound commit.
Coverage reads those paths from Git by object ID; authorship reuses its own
already-derived commit paths. T0 binds only when every changed path is in the
bounded mechanical set. Unversioned, v1 and v2 records remain readable as
history but cannot produce a new binding PASS.

Focused verification after the correction:

- `critic-skip-decision.test.mjs`: 12/12 passing;
- `dispatch-record.test.mjs`: 10/10 passing;
- `check-critic-skip-coverage.test.mjs`: 12/12 passing;
- `dispatch-record-write.test.mjs`: 10/10 passing;
- `dispatch-authorship-verify.test.mjs`: 54/54 passing;
- `workflow-runner-boundary.test.mjs`: 38/38 passing;
- vendored-template sync, documentation contracts, Verify-suite registration,
  product-inventory validation and backlog-state validation passing;
- live coverage scan: 615 historical records, 0 v3 records, no false current
  PASS minted from legacy evidence.

QG-13 limits this package to the completed initial review and one re-review.
The final correction therefore has focused self-verification and is not called
a Critic PASS. The product capability inventory stays
`required-before-publication`; a later bundled candidate review must cover this
exact correction lineage before publication or release.

This contract is runner-neutral. It does not require or claim a native Codex
sandbox on WSL.
