# Critic C6d and C6e correction-diff reviews 1 of 3: results

Both reviews stopped at the 80 % budget checkpoint (call 24 of 30) and withheld pass/fail as partial.
Route: requested claude-sonnet-5-5 at high; observed claude-sonnet-5-5 in each runtime prompt.

## C6d-diff (73bd3766a)

Notes: scratch/dispatch/critic-a2758928951309d07/critic-notes.md (local, untracked).

| ID | Severity | Gap | Evidence |
|----|----------|-----|----------|
| D1 | minor | The renamed cause text says guardRefusals counts "every guard refusal", but Explore/Plan dispatch refusals are routed to exploreOrPlanRefused, so the label over-claims. | elephant-context-measure.mjs:19 vs :114; roles/elephant.md:119 and its vendored copy |

Cleared: F4 chunked strict-UTF-8 pre-push log scan and its physical-file checks; F5 measure rules and the pin pair keys; 02B to 02C comment id everywhere; scope; reachability; test integrity; security; dependencies; language.
Not reached: project-uninstall.mjs apply/resume handling of log.jsonl after privateHookArchive; pre-push-hook-install.mjs recordLog; the AC-216 item text; the AC-168 pin pair data beyond the hunks; guardrail files; test execution.
Observation: the 4 MiB line bound has no discriminating case (a valid JSON record above the bound would be one).

## C6e-diff (3628fb3c9)

Notes: scratch/dispatch/critic-a8ed6d3277ef09cf4/critic-notes.md (local, untracked).

No finding survived the evidence gate in the part reached.
Cleared: plan-submission pin exact codes DWP-ADVISOR-DISPOSITION and DCC-REVIEW-RECEIPT-MISSING against source order; brownfield pin (c) title vs assertion; v2 skip owner/due at both sites; R5/R6 stale sentence and the added negative assertions; trailers; test integrity.
Not reached: the AC-119, AC-227, AC-113 items; portable-original entries for AC-134/154/232; pipeline-state.mjs ~10930-10976; the design-workflow-package schema disposition nullability; guardrail files.
Observation: the brownfield pin header (lines 1-6) understates its own coverage of the net-new ratchet.

## Coordinator note

The 30-call base cap is too small for these correction diffs; both reviews spent their budget on orientation. Remaining unreached items are bounded and listed above.
