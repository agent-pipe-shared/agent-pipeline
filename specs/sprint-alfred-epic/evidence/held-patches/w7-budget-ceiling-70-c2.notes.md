# Held patch notes: raise the implementor turn leash to 76 (one grant reaches a total of 70 calls)

Status: INTERIM (budget checkpoint reached at call 28 of 35). Patch written and sized; broader suite sets NOT yet compared.
Candidate d3f0e65890370429a82eb9d89d6e1a0d9fe575ce. Proposed commit message:
`feat(budget): raise the Goldfish implementor turn leash so one grant reaches a total of 70 calls`

## Cause
Ceiling = maxTurns - 6, working cap = maxTurns - 15 (lib/dispatch-budget-core.mjs). With maxTurns 50 the briefed base is 35, ceiling 44, headroom 9.
At maxTurns 76: base 40 (tier cap 40), ceiling 70, single-grant headroom 30. No change to dispatch-policy.mjs or dispatch-briefing.mjs.

## Changed lines (in the patch)
- plugins/pipeline-core/agents/goldfish-implementor.md: line 6 `maxTurns: 50` -> `maxTurns: 76`; the comment at line 32 now states the PO decision and the arithmetic instead of calling 50 the start value.
- plugins/pipeline-core/lib/dispatch-budget-binding.test.mjs: imports readAgentMaxTurns and four core helpers; new case DBB12 (reads the real implementor definition: maxTurns 76, ceiling 70, base 40, headroom 30, working cap 70 at grant 30 and clamped at 31); corpus count assertion 11 -> 12 (required by the added case, not a weakening).

## RED / GREEN
- RED (clone, agent unchanged): `node plugins/pipeline-core/lib/dispatch-budget-binding.test.mjs` exit 1, only DBB12 failed (actual 50, expected 76). Log: scratch/agent-out/w7mm/red.dispatch-budget-binding.test.mjs.log (scratch is untracked).
- GREEN after the frontmatter edit, baseline vs patched failing-name sets for the 8 listed test files: STARTED in background, NOT collected (checkpoint). Not verifiable from this dispatch.

## Known remaining work (from reading, not yet run)
Tests that read the real implementor definition and will break at maxTurns 76 and need updates that are NOT in this patch:
- lib/pins/budget-checkpoint-fires-below-the-briefed-cap.test.mjs: "P1 ... (50 / 50 / 80)" asserts implementor 50 (line 77); "P1/P3 ... 45 on the implementor binds effective 35" derives maxTurns from the file (lines 82-93) so effective cap becomes 45 not 35; P4 template-default test (line 129ff) reads the file value.
- Other listed files (grant-notice, guard-dispatch-budget, calibration, windows lock pin, parallel-work pin, three-runner pin) were not yet shown to need changes; the three-runner pin uses a fixture agent with its own maxTurns 50.
- Not done by design: goldfish-deep and goldfish-mechanic definitions, docs/operating-model.md, the doc comment at hooks/guard-dispatch-budget.mjs (about line 94).

## Operator flow (after the follow-up completes)
apply the diff, `git add -u` with a path limit, commit with --no-verify, stamp, install. Protected-path classification: the agent definition and tests are not on the TP list; not further classified. Independent Critic review stays a parent-owned batch gate.

CONTINUATION CARD -- done: clone setup, DBB12 RED, frontmatter + DBB12 edits, patch written (2 files); remaining: collect green/base failing-name sets per file (logs in scratch/agent-out/w7mm), update the budget-checkpoint pin and any other broken listed file in the clone, regenerate patch, `driver check`, cleanup; next step: re-run `driver patch` after edits.
