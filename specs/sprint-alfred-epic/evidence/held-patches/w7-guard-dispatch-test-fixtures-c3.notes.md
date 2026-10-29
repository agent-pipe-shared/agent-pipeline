# W7-GUARD-DISPATCH-TEST-FIXTURES-C3-C1: checkpoint, no patch delivered

State: budget checkpoint reached during recon. NO test edit was made, so NO patch file exists (`w7-guard-dispatch-test-fixtures-c3.patch` is intentionally absent). Targeted delivery: blocked (not started on the edit).

## Measured baseline (clone at candidate 03a09bbfe, whole `plugins/pipeline-core/hooks/guard-dispatch.test.mjs`)
- 75 tests, 60 pass, 15 fail (log `scratch/agent-out/w7gh/base.log`, untracked).
- Failing positional ids (labels in parentheses): GD22 (GD4), GD27 (GD9), GD34 (GD15a), GD36 (GD15c), GD38 (GD15e), GD39 (GD15f), GD43 (GD15j), GD58 (GD57), GD59 (GD58), GD60 (GD59), GD61 (GD60), GD62 (GD61), GD63 (GD62), GD64 (GD63), GD65 (GD64). This matches the briefing's set (briefing used labels GD58..GD65 for the runtime ids GD58..GD65 = labels GD57..GD64).
- After-state: not measured (no change made). clone2 baseline equals the clone baseline by construction (same candidate, same file).

## Recon findings for the follow-up
1. Fixture shape is `itemBackgroundRepo(itemGoverned)` (test lines ~792-823) and `markedGoldfishPrompt()` / `markedGoldfishDispatch()` (~824-848), which build a hand-made v1 marker with no generator marker. The helper `generatedMarkedPrompt(root)` must replace `markedGoldfishPrompt()` for these.
2. Generator route: `node plugins/pipeline-core/scripts/dispatch-briefing.mjs build --package pkg.json --root <fixture>`; package keys: id, item, agentType, modelId, check (.test.mjs), title, ac, goal, paths, context, targeted, optional spec, criterion, estimatedToolCalls. Needs in the fixture: `project/pipeline.json` (project, handover), the spec file, every named path existing (`check`, `paths`), a git repository (candidate commit is read from it, so the "no commit" assumption of GD59/GD61/GD63 expecting NGHS-CANDIDATE-MISMATCH changes: the fixture will need a commit, and the queue row baseCommit/id/writeScope must equal the generated binding, else DBG-QUEUE-ROW-DRIFT).
3. Probe (`scratch/agent-out/w7gh/probe.mjs`, untracked) with a spec line `- **AC-1:** The change is delivered under test.` was refused: `DBG-CRITERION-REFUSED ... unsupported-or-ambiguous (CAC-CRITERION-UNSUPPORTED)`. The host parser accepts only the criterion shapes listed in `CRITERION_SHAPES` (dispatch-briefing.mjs ~line 163; table row whose first cell is exactly the id with the criterion in the second cell is the safest) and `parseAcceptedCriticCriterion` (lib/critic-accepted-contract.mjs) may require more (accepted-status wording / an evidence cell). Next step: use a table row `| AC-1 | <criterion text> | <evidence> |`, re-probe, then read `parseAcceptedCriticCriterion` if still refused.
4. GD22/GD27: replace with guard-level honest expectation DBG-GENERATED-BRIEFING-REQUIRED (both hand-assembled incomplete briefing and hand-filled template) and name the library-level property move. The function deciding an incomplete briefing is found by `rg DISPATCH-INCOMPLETE-BRIEFING plugins/pipeline-core` (not run; budget). Library test file not in this slice's paths, so the smallest follow-up is: add a case for that function in its existing `*.test.mjs` (likely `lib/dispatch-policy.test.mjs`) asserting incomplete briefing -> DISPATCH-INCOMPLETE-BRIEFING.
5. GD34/36/38/39/43 (packets with no role, unknown namespaced role, malformed/empty Antigravity, Codex without message): not investigated why the generated gate fires for them (the briefing requires reading that first). Baseline fixture is `bindingRepo` (enrolled, not item governed).

## Not done
All edits, the patch, the apply check, the after-run, the failing-name comparison. Independent Critic review and Full Verify stay parent-owned.

## Proposed Conventional Commit (for the eventual patch)
test(guard-dispatch): build the marked Goldfish fixtures through the briefing generator and pin the generated-briefing refusal for hand-assembled briefings

## Operator flow (eventual)
Apply the diff, `git add -u -- plugins/pipeline-core/hooks/guard-dispatch.test.mjs`, commit, stamp, install. Critic review remains a parent-owned batch gate.
