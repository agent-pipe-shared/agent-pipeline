# W7-CGB-BUDGET-DETAIL -- notes (state: HELD, built by the Elephant in a scratch clone)

Candidate `4c181e18b`. Patch: `w7-cgb-budget-refusal-names-its-reason.patch` (2 paths, apply-check exit 0).

## What it delivers

`CGB-BUDGET` is raised at four places in `lib/critic-generic-batch.mjs` and none of them carried a detail, so a consumer saw the code with the generic message and could not tell which counting rule had refused. Each now names its reason:

- a reservation file with a round number above the corrupt-directory bound (4096);
- a correction on a batch that holds no admitted round yet (the full review comes first);
- a request for a round that is already reserved for another packet or other digests (a new commit, for example an evidence commit, changes the digests; resume the reserved packet);
- a round whose predecessors are not all in the batch (the batch holds N admitted rounds and needs round-1; an earlier round was reviewed outside it or its reservation is missing).

No counting rule changes. Test `CGB036` pins the second reason (the others need a corrupt or foreign batch state).

## Why

A consumer (Toolbox) reported `CGB-BUDGET` at round 3 after the install of the candidate that lifts the round caps. The known cause (the round 2 reservation file was not counted) is fixed; whichever of the four remaining checks refuses there is not visible from outside. The consumer's installed version and the full output were requested.

## Checks (scratch clone)

`critic-generic-batch` (36 of 36), `critic-dispatch-preflight` and `critic-course-admission` tests: exit 0.

## Open

Full Verify, batch Critic and PO acceptance remain pending. Library path: the PO applies the patch in the same ceremony as the other held patches.
