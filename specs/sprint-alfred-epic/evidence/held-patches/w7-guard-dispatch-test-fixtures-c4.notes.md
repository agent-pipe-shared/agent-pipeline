# W7-GUARD-DISPATCH-TEST-FIXTURES-C4-C1: checkpoint, no patch delivered

State: tool-budget checkpoint reached during probe work. NO test edit was made, so NO patch exists (`w7-guard-dispatch-test-fixtures-c4.patch` is intentionally absent). Targeted delivery: blocked.

## Measured (candidate 2274069aa, whole guard-dispatch.test.mjs, clone2, unchanged)
Baseline run was started and completed (scratch log base.log, untracked); the failing set matches the C3 notes: GD22 GD27 GD34 GD36 GD38 GD39 GD43 GD58 GD59 GD60 GD61 GD62 GD63 GD64 GD65 (75 tests, 60 pass, 15 fail per C3). Not re-counted in this attempt beyond the completed run.

## New findings (resolve the two open items of the C3 notes)
1. Criterion refusal cause: the fixture spec must carry a normative heading and a three-column table. Working shape (probe accepted it, next refusal moved on):
   `## Acceptance criteria` / `| # | Criterion | Evidence |` / `|---|---|---|` / `| AC-1 | The change is delivered under test. | src/change.test.mjs |`.
   A bare table row or the bullet `- **AC-1:**` outside an "Acceptance criteria" heading is "not normative" (NORMATIVE_HEADING in lib/critic-accepted-contract.mjs line 145).
2. NEW blocker for the CLI route: `node scripts/dispatch-briefing.mjs build --root <fixture>` then refuses `DBG-RULESET-UNAVAILABLE` (status absent): the CLI always uses the real `observePipelineStartPreflight` on the fixture root, which yields no loaded/installed ruleset identity and no pluginRoot for a plain fixture (setting CLAUDE_PLUGIN_ROOT did not change this). Next step: do not use the CLI via spawnSync; import `buildDispatchBriefing(options, deps)` from `plugins/pipeline-core/scripts/dispatch-briefing.mjs` (exported, line 952) in the test and pass `deps.observePreflight` returning `{ rulesetSource: { loadedIdentity: { status: "available", algorithm: "content-sha256", value: "<64 hex>" } } }` (the same seam scripts/dispatch-briefing.test.mjs uses, line ~79). The marker is still produced by the real generator, so no marker is forged (D185). Confirm the guard's admission does not recompute the ruleset identity differently (read the guard path for the generated-briefing admission before relying on it); if it does, STOP and name the file that needs a change.
3. Other fixture needs (unchanged from C3): project/pipeline.json {project, handover, verify}, spec file, existing check and path files, a git commit in the fixture, a queue row equal to the generated binding (else DBG-QUEUE-ROW-DRIFT).

## Not done
helper generatedMarkedPrompt, re-measure of GD58-GD65, GD34/36/38/39/43 why-analysis, GD22/GD27 expectation change, patch, apply check, after-state. The library-level follow-up for GD22/GD27 (a case for the function raising DISPATCH-INCOMPLETE-BRIEFING, likely plugins/pipeline-core/lib/dispatch-policy.test.mjs, found by `rg DISPATCH-INCOMPLETE-BRIEFING plugins/pipeline-core`) stays outside this slice.

## Proposed Conventional Commit (eventual)
test(guard-dispatch): build the marked Goldfish fixtures through the briefing generator and pin the generated-briefing refusal for hand-assembled briefings

## Operator flow (eventual)
Apply the diff, `git add -u -- plugins/pipeline-core/hooks/guard-dispatch.test.mjs`, commit, stamp, install. Critic review stays a parent-owned batch gate.

## Continuation card
done: baseline measured; criterion-shape cause found; ruleset-identity blocker found with the in-process seam as the route. remaining: everything in "Not done". next step: write the helper with buildDispatchBriefing + injected observePreflight, probe once, then edit the clone and re-measure.
Scratch state: clones under scratch/agent-out/w7gh/ (untracked) may still exist; driver.mjs there is already pointed at candidate 2274069aa and the c4 patch name.
