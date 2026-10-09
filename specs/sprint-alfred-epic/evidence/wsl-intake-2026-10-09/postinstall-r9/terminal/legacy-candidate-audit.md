# ALFRED-LEGACY-CANDIDATE-TREE-FIX-R1 scratch audit

Candidate: `e87ac5f1d7071570636719a60b1649004c6e7955`
Candidate tree: `013330771fd44316db8e9b0702a5c93f33e0f903`
Ruleset: `b7115494a79c3271c224c51d0bd388b0ccfff931a4ae11a0cd6a7eb19ce0b88d`

## Isolated postimage

`public-graph/` was extracted from the candidate with:

```text
git archive --format=tar --output=scratch/alfred-legacy-candidate-tree-fix-r1-20261009/public-graph.tar e87ac5f1d7071570636719a60b1649004c6e7955
tar -xf scratch/alfred-legacy-candidate-tree-fix-r1-20261009/public-graph.tar -C scratch/alfred-legacy-candidate-tree-fix-r1-20261009/public-graph
```

The only graph overlay is `plugins/pipeline-core/lib/design-workflow-package-v2.mjs`.
The named full source postimage is `design-workflow-package-v2.mjs`.
Its SHA-256 is `9e7da019546ea71895da8998b9c8b085d51084637866d958f6761c4a668c3638`.
The workspace source baseline SHA-256 is `86a409b78c935a5694a72136608b3969360606c7ad5e65b11738f5d506da0556`.

## Change

The evidence-only descendant predicate now rejects an identical candidate/HEAD commit before ancestry and empty-diff checks. It also checks that the package's recorded candidate tree is the tree Git resolves for that candidate commit. This keeps a false candidate tuple from reaching the descendant exception and produces `DWP2-CURRENT-CANDIDATE` at the caller. The evidence-only path-set rule is unchanged.

## Preservation audit

`git diff --no-index --name-only plugins/pipeline-core scratch/alfred-legacy-candidate-tree-fix-r1-20261009/public-graph/plugins/pipeline-core` reported only the target module.
Independent comparisons reported no differences for `architecture/map/index.md`, `harness/verify-suites.json`, or `harness/scripts/verify.mjs`.
The committed descendant test was read-only and unchanged.

## Verification

- `node --test plugins/pipeline-core/lib/design-workflow-evidence-descendant.test.mjs` — 14 passed, 0 failed. Includes evidence-only successor positives, unrelated and source-drift refusals, sibling/foreign-ref refusal, malformed candidate-tree refusal, and the unchanged v1 j–l partition.
- `node --test plugins/pipeline-core/lib/design-workflow-package-v2.test.mjs` — 1 passed, 0 failed (129.9 seconds); current v2 reader, readiness, approval binding, and unavailable-Advisor paths.

The first focused run on the same-commit-only attempt correctly exposed that committed EVDESC-h is a descendant fixture: it commits the altered candidate tuple with the evidence files. The package-v2 tree-resolution check was added within the same predicate and the unchanged focused test then passed. An un-escalated fixture run hit `EPERM` spawning Git in `/tmp`; the task-authorized WSL run completed both suites.

No test file, workspace source, repository index, registry, Git history, cache, hook, real receipt, config, key, or transcript was written. The two test suites created their normal disposable synthetic fixtures under `/tmp`. No commit was made. Independent review and PO acceptance remain pending.
