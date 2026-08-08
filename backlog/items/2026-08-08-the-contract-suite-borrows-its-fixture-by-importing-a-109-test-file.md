---
schema: pipeline.backlog-item.v1
id: pipeline.contract-suite-borrows-its-fixture-by-importing-a-109-test-file
type: improvement
owner: pipeline
status: resolved
created: 2026-08-08
due: 2026-08-22
source: "Elephant, 2026-08-08, GF-057. Noted while verifying the C1/C3 contract suite; recorded rather than fixed so the block's remaining consumer blockers keep the budget."
---

# The recovery-contract suite borrows its fixture by importing a 109-test file

`plugins/pipeline-core/hooks/guard-lifecycle-recovery-contract.test.mjs` needs
seven fixture helpers (`root`, `dispose`, `fakeDeps`, `fakeGit`,
`initializeRestartRequiredRoot`, `clearRuntimeBarrier`, `completeKickoff`) to
reach a real `partial` lifecycle state. It gets them by importing
`plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`, which was widened
with `export` for exactly that purpose.

That choice was right for what it avoided. The alternative — a second
hand-built fixture, or a hand-typed result shape — is the precise anti-pattern
the suite exists to prevent: a mocked shape that drifts from what the library
really returns is how the guard's dead `nextAction === null` clause survived
from 2026-08-02 to 2026-08-08 under a green suite.

The cost is that importing the file runs its 109 tests as a side effect. Two
consequences, neither a coverage gap:

- Every run of the 2-test contract suite prints 109 unrelated PASS lines
  first, so its own result is at the bottom of a screen of noise.
- A failure in `project-onboarding-v3.test.mjs` surfaces inside the contract
  suite's output, which invites attributing it to the guard. The direction is
  safe (loud, not silent), but the attribution is wrong.

## Direction, not a design

Extract the shared helpers into a fixture module both suites import — the
natural name is `plugins/pipeline-core/lib/project-onboarding-v3.fixture.mjs`
— so neither test file is the other's dependency. The move is mechanical but
touches a large, heavily-used test file, and the acceptance criterion is that
`project-onboarding-v3.test.mjs` still reports 109 passed / 0 failed
afterwards.

Worth doing when something else already touches that file, rather than as its
own errand.

## Related

- `2026-08-08-the-guard-refuses-the-recovery-the-inspection-prescribes.md` —
  the item the suite closes.
- `docs/pending-verify-registrations.md` — the suite is not yet registered in
  `verify.mjs`.

## Triage

- **Decision:** accepted and fixed 2026-08-09, but **not** by the extraction this
  item assumed. `project-onboarding-v3.test.mjs` now guards its own `test()` and
  its summary line behind `isDirectInvocation(import.meta.url)`. An importer gets
  the exported helpers and nothing else; running the file directly is byte-for-byte
  unchanged (109 passed, 0 failed, verified before and after). The contract suite
  went from 109 borrowed cases plus 2 of its own to 2, in under a second.
- **Rationale for guarding rather than extracting:** the helpers are woven through
  the suite's own setup, so lifting them into a separate module means moving code
  out of a 109-case file to save an import — and a mis-lift there breaks in a way
  that *looks* like a fixture problem, which is the most expensive kind of
  breakage to diagnose. The guard is two lines, changes nothing when the file is
  run directly, and fixes it for every importer that will ever exist rather than
  for this one caller. The PO's framing was cost/benefit: this is the version
  where the benefit is general and the cost is two lines.
- **Assignment:** GF-057, Elephant.
- **Date:** 2026-08-09
