# Critic C6g5 correction-diff review 1 of 3: result

Review object: 7d18fc766, 57f51ffc1, a370201fa, 869b62f09 (git show per SHA).
Route: requested claude-sonnet-5-5 at high; observed claude-sonnet-5-5 in the runtime prompt.
Verdict: pass/fail withheld (partial review at the 80 % checkpoint); two major findings prevent a PASS.
Critic notes: scratch/dispatch/critic-a6344aa3090e15054/critic-notes.md (local, untracked).

| ID | Severity | Commit | Gap | Evidence |
|----|----------|--------|-----|----------|
| D1 | major | 57f51ffc1 | Section 6 of templates/prompts/agent-obligations.md is a GENERATED file; the generator harness/scripts/generate-agent-obligations.mjs still emits the old literals ("two legitimate forms", "single direct-Elephant trailer", "no separate design-phase trailer form"), so generate-agent-obligations.test.mjs AC-2 (byte equality) fails and a regeneration reverts the fix. The commit message omits this red check. | generator :257, :264-270; test :43-46 |
| D2 | major | 7d18fc766 | The beyond-delta check reads only the label line; the real template spreads the Diff field over :234-245 with the SHA slot on :236-237 and the example `git diff {{FIRST_SHA}}^..{{LAST_SHA}}`; RANGE needs hex adjacent to the dots, so `sha^..sha` never matches. The new pin cases append a bare range to the label line, a shape the template does not produce. | critic-review.md :234-239; dispatch-policy.mjs :181, :187, :201; opus pin :103-123 |
| D3 | minor | 7d18fc766 | The stated limits (line-oriented, no continuation lines, no sha^..sha) have no owner or due date (QG-06), unlike the F4/F6 notes. | dispatch-policy.mjs :185-186; pin :7-9 |

Cleared (examined, in order): 869b62f09 blob identity; vendored pair hashes for git.md and agent-obligations.md; verifier text vs logic (stage-0/design, 10-path bound, administrative branch); MP-07 closure claims (0359cc85a, 363a96005, codes present); shell-grammar checkKernel/RED P1; F4 and F6 disclosures; a370201fa caller set and dispositions; no new dependency; language.

Not reached: guardrails/git.md GIT-03 text; guardrails/security.md; roles/goldfish.md; project/pipeline.json; shell-grammar pin outside its hunks; greenfield pin outside its hunks; role-dispatch-preflight.mjs :360-380; hooks/guard-dispatch.mjs evaluateBriefingRoute; the AC-127 backlog item.

Observation (Coordinator): the AC-222 item Triage still says "STILL OPEN: (c)"; correction-diff dispatches carry no `Re-critic (MP-07):` line, so the mechanical re-critic checks do not engage for them (non-contiguous SHA list).
