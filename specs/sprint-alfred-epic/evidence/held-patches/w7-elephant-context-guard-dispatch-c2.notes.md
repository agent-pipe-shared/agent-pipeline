# W7 elephant-context guard-dispatch (C2): complete, tests plus production, green on the new cases

Candidate e3110a64b46d72308caf467759f4fbac0ee725c7. This patch is against the CANDIDATE and contains BOTH halves (test file plus `guard-dispatch.mjs`). It SUPERSEDES `w7-elephant-context-guard-dispatch.patch` (tests only): apply this one alone, never both. Safe to apply: all six new cases are green; the 22 pre-existing red cases are unchanged.

## Cause
A freehand Goldfish or Critic prompt reached the guard unannounced, and a refused Explore or Plan dispatch was retried unchanged with the full refusal text repeated, spending Elephant main context (item pipeline.elephant-main-context-spent-on-wake-ups-and-inline-reads).

## Changed lines (plugins/pipeline-core/hooks/guard-dispatch.mjs, +48/-1 net of the diff)
- import list: `mkdirSync` added.
- after the imports: `promptTemplateShapeWarning` (slice A; pipeline-core goldfish-* needs the six `### n.` field headings, critic needs `Fail-closed reference boundary`, `## Phase A`, `## Phase B`; returns one `WARNING (guard-dispatch): GUARD-DISPATCH-PROMPT-NOT-TEMPLATE-SHAPED ...` line naming the template; never changes the exit code) and `refusedDispatchRetrySeen` (slice B; state `<git common dir>/agent-pipeline/refused-dispatch-retry/<sha256(session_id)>/<sha256(type NUL prompt)>.json`; fails open with no session id or common dir).
- before the carrier loop: shape warning emitted per dispatch. In the carrier refusal: unchanged retry in the same session gives `GUARD-DISPATCH-REFUSED-RETRY` plus pointer to `backlog/items/2026-10-05-elephant-main-context-spent-on-wake-ups-and-inline-reads.md`; first refusal of Explore or Plan appends `admitted route: Explore through a direct Agent call ...`.
- Test file: cases GD67..GD72 (names GD67-GD72, registered ids GD68-GD73), corpus count 67 to 73. No existing case changed (the test half is identical to the earlier held tests patch).

## RED / GREEN (whole file, `node --test plugins/pipeline-core/hooks/guard-dispatch.test.mjs`, logs written by the driver)
- Baseline (clone2, candidate, no patch): tests 67, pass 45, fail 22.
- RED (tests only): tests 73, pass 47, fail 26. New red: GD67, GD69, GD71, GD72 (GD68, GD70 are negative cases and pass by construction).
- GREEN (patched): tests 73, pass 51, fail 22. All six new cases pass.
- Failing-name sets: baseline and patched are IDENTICAL (22 names): GD12-14 (GD2i/GD2j carrier-policy expect ALLOW for Plan/general-purpose/Explore batch), GD22, GD23, GD27, GD33, GD34, GD36, GD38, GD39, GD41-43, GD58-GD65. Pre-existing, not touched; they fail the same in both clones.
- Apply check: `git apply --check` of this patch in clone2 at the candidate: exit 0.

## NOT done
- The 22 pre-existing failures (not in scope). Critic dispatches with the em-dash heading variants are matched by `## Phase A`/`## Phase B` prefix only. Transport-specific (Codex/Antigravity) shape checks were not added; the warning applies to any evaluated dispatch with a pipeline-core goldfish/critic type. Full Verify not run.

## Proposed commit message
feat(guard): warn when a dispatch prompt is not template-shaped and stop unchanged retries of a refused Explore or Plan dispatch

## Operator flow
Apply the diff, `git add -u` limited to the two paths, `--no-verify` commit, stamp, install. Protected-path classification observed: neither `guard-dispatch.mjs` nor its test matches TP-1..TP-13; edits in the scratch clone were admitted.

## Gates
An independent Critic review stays a parent-owned batch gate.
