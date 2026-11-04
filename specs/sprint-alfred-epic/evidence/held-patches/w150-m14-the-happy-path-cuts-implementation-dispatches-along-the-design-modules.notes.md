# w150 — the happy path cuts implementation dispatches along the design modules (candidate 19, M1.4, all three greenfield runs)

Applies on top of w132 and w145 (both change the same file); it does NOT apply to the chain before them. Elephant-built small item, built in a clone that carries w132 and w145. Criterion binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it changes

- `plugins/pipeline-core/skills/pipeline-start/references/happy-path.md`, Implementation step 2: dispatches are cut along the modules of the design (`architecture/fitness-model.json`), one dispatch per module with that module's `ownedPaths` as the `--path` scope, so write scopes are disjoint and the dispatches can run in parallel; a design with a single module leaves no parallel slice and is taken back to the design (the readiness question of w144) instead of splitting one module by file.

## Checks

- Run alone in the clone: `happy-path-guide-names-only-existing-scripts.test.mjs` 2/2, `runner-capabilities.test.mjs` 5/5.

## Not changed / not proven

- Guidance only: the slice planner and `dispatch-briefing.mjs` do not derive the paths from the modules, and nothing enforces the cut. Whether agents follow it is a greenfield measurement.
- No full Verify run; no independent Critic review (suspended by the PO).
