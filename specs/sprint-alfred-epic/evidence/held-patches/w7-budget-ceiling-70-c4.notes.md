# Held patch notes: implementor turn leash 76, fourth attempt (c3 content plus the last calibration case)

Status: patch complete; targeted checks green except the pre-existing parallel-work failures (identical in baseline).
Candidate 4cdb2bd9d1689d89945a196092fb5860ba3bcbd5. Patch: w7-budget-ceiling-70-c4.patch (git diff --binary against the candidate, 6 files, 38 insertions, 16 deletions). Apply check in a clean clone at the candidate: exit 0.
Proposed commit message: `feat(budget): raise the Goldfish implementor turn leash so one grant reaches a total of 70 calls`

## Cause
Ceiling = maxTurns - 6, working cap = maxTurns - 15 (lib/dispatch-budget-core.mjs). At maxTurns 50: base 35, ceiling 44. At maxTurns 76: base 40 (tier cap 40), ceiling 70, single-grant headroom 30, working cap 61.
c3 left one calibration case red: "the evaluator exposes both a weak formula and a tier cap that truncates a stronger formula" asserted workingCap/effectiveBaseCalls 35 from the old implementor limit, and used observedCalls 40.

## Changed lines (patch = c3 content + the calibration fix)
- agents/goldfish-implementor.md: maxTurns 50 -> 76 and the comment (c3).
- lib/dispatch-budget-binding.test.mjs: new DBB12 (shipped implementor: maxTurns 76, ceiling 70, base 40, headroom 30) and corpus count 11 -> 12 (c3).
- lib/pins/budget-checkpoint-fires-below-the-briefed-cap.test.mjs, lib/pins/dispatch-budget-lock-refuses-every-subagent-call-on-windows.test.mjs, lib/pins/parallel-work-in-one-checkout-is-unsafe.test.mjs: fixture updates (c3).
- lib/dispatch-budget-calibration.test.mjs (this attempt, the only new change): inside the truncation case, `const implementorCap = dispatchWorkingCap(rule().maxTurnsByTier.implementor)` is computed first (76 -> 61, from the rule helper, no new literal); the sample uses observedCalls: implementorCap instead of 40; the assertions on workingCap and effectiveBaseCalls compare to implementorCap instead of 35; proposedBaseCalls 68, tierLimited true and undercutsObservedBound true are unchanged. Justification: with the cap 61, observedCalls 40 gives required base 45 which no longer exceeds 61, so undercutsObservedBound is false; observed = cap restores the intent (a tier cap truncates a stronger formula and the evaluator reports the undercut, required 66 > 61). The old assertions were not weakened; the 35 literal is replaced by a derived figure. No other case in that file used the old figure (read whole file: the first case uses deep 80 -> 65; the truncated case brings its own limits).

## RED / GREEN
- RED: calibration test in the clone with c3 applied and the case unfixed: 12 pass, 1 fail (the case above). Log: scratch/agent-out/w7tt/green.dispatch-budget-calibration.test.mjs.log (the first run, scratch is untracked).
- GREEN: same file after the fix: 13 tests, 13 pass, 0 fail (green2 log).
- Whole files, clone (patched) versus clone2 (baseline), failing-name sets:
  - dispatch-budget-calibration: patched {} (13/13); baseline {} (13/13)
  - dispatch-budget-binding: patched {} (12/12 with DBB12); baseline {} (11/11)
  - lock pin (windows): patched {} (10/10); baseline {} (10/10)
  - parallel-work pin: patched {M6a, M6c, M6d, M6e, M6f}; baseline the same five (pre-existing, identical, not caused by this patch)
  - budget-checkpoint pin: patched {} (11/11); baseline {} (not listed as failing)
  - guard-dispatch-budget: patched {} (127 tests, 125 pass, 2 skipped); grant-notice: {} (13/13); dispatch-budget-core: {} (11/11); three-runner pin: {} (22 tests, 21 pass, 1 skipped). Baseline for these four showed no failing names.

## 76/40/40 fixture of the lock and parallel pins
Not derived, only passing. In lib/dispatch-budget-binding.mjs baseCalls is parsed from the prompt and workingCap = dispatchWorkingCap(maxTurns) = maxTurns - 15 = 61 at 76. The fixture counter record writes workingCap 40, which equals the effective base cap (min(40, 61)), not the binding's workingCap. The pins pass because they only exercise the count against that stored record.

## NOT done
goldfish-deep and goldfish-mechanic definitions, docs/operating-model.md, the doc comment in hooks/guard-dispatch-budget.mjs (about line 94).

## Operator flow
Apply the diff (`git apply` of the patch), `git add -u` with a path limit to the six files, commit with --no-verify, stamp, install.
Protected-path classification: none of the six files is on the TP list (agent-obligations section 2); the agent definition is plugin source, not a test path. Note that the write scope of this dispatch named only the binding test, notes and patch; the other five files travel inside the patch only.
An independent Critic review stays a parent-owned batch gate; Full Verify and PO acceptance are pending.
