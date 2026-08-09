# Importing the onboarding suite no longer costs an importer 109 unrelated tests

Date: 2026-08-09
Closes: `pipeline.contract-suite-borrows-its-fixture-by-importing-a-109-test-file`
Closing commit: `1dade30b72b9fec6f69fd163ca128c32a5769580` (dispatch GF-057)

## What the item asked for

`guard-lifecycle-recovery-contract.test.mjs` borrows seven fixture helpers from
`plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`, and importing that
file ran its 109 tests as a side effect: the 2-test contract suite printed 109
unrelated PASS lines before its own result, and a failure in the onboarding suite
surfaced inside the contract suite's output, inviting a wrong attribution.

The item proposed extracting the helpers into a shared fixture module and named
one acceptance criterion explicitly: **`project-onboarding-v3.test.mjs` still
reports 109 passed / 0 failed afterwards.**

## Which commit answered it, and how it differs from the proposal

`1dade30b` — `perf(project-onboarding-v3): stop charging importers for the whole
suite`. It solves the item's problem by a different route than the item assumed,
which the item's own Triage records: the suite guards its `test()` and its
summary line behind `isDirectInvocation(import.meta.url)` instead of moving the
helpers out. The line that answers the ask, from `git show 1dade30b --
plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`:

```diff
-function test(name, run) { try { run(); passed += 1; console.log(`PASS  ${name}`); } catch (error) { ... } }
+function test(name, run) { if (!RUNNING_AS_SUITE) return; try { run(); passed += 1; console.log(`PASS  ${name}`); } catch (error) { ... } }
```

with `const RUNNING_AS_SUITE = isDirectInvocation(import.meta.url);` above it and
the trailing summary/exit-code block guarded by the same flag. An importer gets
the exported helpers and nothing else; a direct run is unchanged.

The deviation from the item's proposed design is deliberate and is argued in the
commit and the Triage: the helpers are woven through the suite's own setup, so
lifting them out is a large move whose breakage would look like a fixture
problem — the most expensive kind to diagnose. The guard is two lines and fixes
it for every importer that will ever exist, not just the one caller that noticed.
The item's acceptance criterion is unaffected by that substitution, which is why
it can still close on this commit.

## What was actually measured, at the current tip

Both suites were run at tip `4be63c87bb43d09139ffd9480f40aa53d04d9c1d`:

- `node plugins/pipeline-core/lib/project-onboarding-v3.test.mjs` — exit 0,
  109 PASS lines, final line `project-onboarding-v3: 109 passed, 0 failed`,
  31.3 s. **This is the item's own acceptance criterion, met.**
- `node plugins/pipeline-core/hooks/guard-lifecycle-recovery-contract.test.mjs` —
  exit 0, 1.0 s wall clock (`duration_ms 929.9` from its own reporter), and its
  output contains **zero** `PASS ` lines from the onboarding suite. Both
  consequences the item complained about are gone, and gone for measurable
  reasons rather than by assertion.

Raw run output: `evidence/close-2-measurements.json` (untracked working
artifact, `item2_importCost`).

## What this closure does NOT cover

The contract suite is still not registered in `verify.mjs`; it remains listed in
`docs/pending-verify-registrations.md`. That is the item's own "Related" pointer,
not something this closure changes.
