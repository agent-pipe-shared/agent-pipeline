# w140 — the design skeleton states the module cut rule (candidate 19, M1.1, all three greenfield runs)

Applies on top of the chain at dadc1f8bd. Elephant-built small item (PO exception for small items), built in a clone. Criterion binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it changes

- `lib/design-authoring.mjs`: the comment line of `renderArchitectureDesignSkeleton` ("Split modules as needed") now states the cut rule: one module per separable responsibility, a part that two people could build without talking to each other, each with its own `ownedPaths`, `publicContracts` and `verificationEntryPoints`; a single module means no slice can run in parallel. The unfinished-draft detector (`stagingDesignNeedsAuthoring`) keys on the unchanged prefix of that comment, so the signal is the same.

## Checks

- `design-authoring.test.mjs` run alone in the clone: 4 of 4. The intake cases of `onboarding-continuity.test.mjs` (`--name intake`): 25 of 25.

## Not changed / not proven

- The skeleton still holds one example module; the cut is guidance, not a generated multi-module layout (a readiness criterion for the decomposition is M1.2, planned).
- It is not shown that a model cuts modules differently because of this sentence; that is a greenfield measurement, not a test.
- The full Verify run was not made; no independent Critic review (suspended by the PO until a working local candidate exists).
