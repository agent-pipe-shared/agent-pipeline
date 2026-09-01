---
schema: pipeline.backlog-item.v1
id: pipeline.approve-announce-test-fixture-missing-present-plan-step
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-29
closure_repository: self
closure_commit: dc53bd7922bf0492d1710fa812fcaa5e5c5b4a62
closure_evidence: plugins/pipeline-core/scripts/pipeline-state-approve-announce.test.mjs
created: 2026-08-29
sprint: nova
done_when: "script-exit-zero plugins/pipeline-core/scripts/pipeline-state-approve-announce.test.mjs"
source: "Found by NVA-R31-STATEPHASEDRIFT while verifying unrelated work (2026-08-29), independently re-confirmed by the Elephant. Not caused by that dispatch or by any 2026-08-29 change."
---

# `pipeline-state-approve-announce.test.mjs` is red: its fixture omits the required `present-plan` step

## What happened

`node --test plugins/pipeline-core/scripts/pipeline-state-approve-announce.test.mjs`
fails on this repository's current HEAD:

```
Error: approve-plan requires a prior present-plan record bound to this exact
submission -- an approval of unseen content is refused; run present-plan
--by <name> first.
✖ approve-plan success output announces the required set-phase --phase
  implementation step
  AssertionError: Expected values to be strictly equal: 2 !== 0
```

The test's fixture calls `approve-plan` directly after `submit-plan`, without
an intervening `present-plan --by <name>` call. `pipeline-state.mjs` now
requires `present-plan` to have run and be bound to the exact submission
before `approve-plan` will succeed (visible as the correct, expected
sequence in every OTHER currently-passing pipeline-state test this
session — e.g. `submit-plan` → `present-plan` → `approve-plan` →
`set-phase`).

## Confirmed unrelated to any 2026-08-29 work

`git log` shows this test file was last touched `2026-08-12`
(`c01dbf76`, "approve-plan announces required set-phase step") — well
before today's session and before the `present-plan` precondition was
introduced elsewhere in `pipeline-state.mjs`. This is a pre-existing gap:
the precondition was added without updating this older test's fixture to
match.

## Proposal

Add the missing `present-plan --by <name>` call to the fixture, in the same
position every other passing test in this repository's `pipeline-state.*`
suite already uses it (submit-plan → present-plan → approve-plan). No
production code change expected — this is a test-fixture-only fix.

## Acceptance criteria

- `node --test plugins/pipeline-core/scripts/pipeline-state-approve-announce.test.mjs`
  exits 0.
- The fixture change does not alter what the test actually asserts (the
  `set-phase --phase implementation` announcement in `approve-plan`'s
  success output) — only adds the missing precondition step.

## Fixed, 2026-08-29 (dispatch NVA-R35-APPROVEANNOUNCEFIX, commit `dc53bd79`)

Inserted the missing `present-plan --by "coordinator"` call between
`submit-plan` and `approve-plan`, matching the shape used elsewhere in
`pipeline-state.test.mjs`. Test-fixture-only fix, no production code
touched. Verified: `pipeline-state-approve-announce.test.mjs` 1/1,
`check-consumer-safe-paths.test.mjs` 9/9.
