# C6g3 correction-DIFF review 2 of at most 3 (ordinal 3) — result (2026-10-17)

- Candidates: `14cfd349b` (ALF-C-C6G3-F2) and `0462d3f4c` (ALF-C-C6G3-F1).
- Re-critic range: `a5d7b63bc..0462d3f4c`. That range also contains `e29da0cc4` (C6g5), which was not reviewed here.
- Route: claude-sonnet-5-5, observed in the runtime prompt. Lane: functional-equivalent-read-only.
- Verdict: **FAIL**, with two minor findings.
- Trajectory: not verifiable. There is no tracked verify log, and the Critic could only hand-trace the regexes.
- Critic notes: `scratch/dispatch/critic-a9bb62f0acae54a0b/critic-notes.md` (local).

## Registry

| ID | Status |
|---|---|
| F1 | Partially closed. SOURCE-DRIFT and PLAN-SPEC-MISMATCH now match the guard. DIGEST-DRIFT now diverges from it (see D1). |
| F2 | Closed for the registered behaviour. The Critic hand-traced all nine pin sentences. |

## New findings

| ID | Severity | Finding | Evidence | Disposition |
|---|---|---|---|---|
| D1 | minor | `0462d3f4c` adds `DWP-APPROVAL-DIGEST-DRIFT` to the reopen allowlist on the premise that the guard treats it the same way. That premise is false: the `contentDrift` list in `guard-devplan-policy.mjs:274` does not contain the code. The Elephant confirmed this with an rg at HEAD. The new pin asserts parity without reading the guard side. The premise came from the Elephant's F1 briefing. | `architecture-design.mjs:319-320`; `guard-devplan-policy.mjs:274-279`; `design-workflow-package.mjs:832`; pin `foreign-worktree…:112-122` | open → ALF-C-C6G3-D12 |
| D2 | minor | `14cfd349b` widens `precedes ` to `precedes? `, but no refused-form case uses "precede". Reverting the change would keep every case green. | `design-workflow-package.mjs:145`; pin `design-workflow-package-omits-contract.test.mjs:327-340` | open → ALF-C-C6G3-D12 |

## Not reached

- The devplan hook caller of `designAdvisoryRemediation`.
- The body of `validateDesignWorkflowPackage` beyond the call at `:433`.
- No test was executed.

One review remains in the budget: DIFF 3 of 3 (ordinal 4).
