# ALFRED-RESEARCH-REVISION-PATH-1 — condensed report (PARTIAL), saved by the Elephant 2026-10-04

The subagent's Write was refused by the tool layer ("Subagents should return findings as text"); the
full inline report is in the session transcript (agent hand-back, 2026-10-04 morning). Condensed here.
Notation: PS=pipeline-state.mjs, PSV2=lib/plan-spec-state-v2.mjs, GLR=guard-lifecycle-ready.mjs,
GDP=guard-devplan.mjs, CS=lib/continuity-state.mjs, DCS=installed design-course-session.mjs,
STORE=installed design-advisor-course-store.mjs, PGA=lib/po-gate-authority.mjs.

## Route (PRD/spec change → route B)

1. `pipeline-state.mjs reopen-design --by "<name>"` (agent-admitted shape GLR:4861-4863) → lifecycle
   `draft`; continuity untouched (rev 15, dispatch kept). K1-8 drift/nextAction quirk persists but
   does not block (fix: `observedDrift && !invalidated`, PSV2:657-662; new invalidation reuses OLD
   timestamp PS:10701-10703).
2. Edit sources: PRD/spec admitted only after reopen (GDP:519-537); other specs/ files always exempt.
3. PRD markers: exactly one `technical-spec-sha256` (= sha256(spec.md), compute LAST) and one
   `po-language` (PGA:842-870).
4. Commit the 5 sources (trailer: stage-0 form, `design (elephant)` is rejected — K5-4,
   commit-message-policy.mjs:85-94,175). Course requires sources committed (DCS:91/93).
5. **Clear dispatch ALFRED-STAGE0-AUTHOR-20261003 — BLOCKER B2.** submit-plan needs idle continuity
   (dispatch, acknowledgedFinal, blocker, result, recovery, decisionTxn all null; PSV2:700-709).
   integrate-final leaves acknowledgedFinal set (CS:955-962) → also blocks. dispose-failure needs
   failure evidence (would be fabricated). Generic continuity-cas may null it (CS:507-555) but is not
   in the sanctioned argv list (GLR:4831-4931). UNRESOLVED.
6. `pipeline-state.mjs submit-plan --by "<name>" --profile epic` (profile must stay `epic`; PO-profile
   receipt must be fresh PGA:738-753; continuity idle).
7. Register a NEW authoring dispatch via `continuity-cas` (only transaction installing a dispatch,
   PS:2658-2660; queueRevision == state revision; digests == bound authority). New id recommended.
8. `design-course-session.mjs --stage advisor ... --authoring-dispatch-id <NEW> ... --execute`
   (GLR:5159-5192; prd/spec sha must equal planSubmission digests). Needs an approved Advisor
   decision bound to the NEW initial-context digest (STORE:45/47/48, B4; claude decision source unv).
9. Save stdout as `<PFX>.advisor-result.json`; write `<PFX>.exception-rationale.txt` (≤4096 B).
10. `--run-v2 ... --readiness-dispatch-id <FRESH, e.g. ALFRED-READINESS-20261004> --queue-revision
    <current> ... --exception-rationale ... --advisor-result ... --execute` (resumed route avoids B1).
11. present-plan → one PO approval (route not read).

Move aside before step 8: all `<PFX>.*` files (preparation, advisor-result, exception-rationale,
readiness, package, initial, course-binding, failure) into a `superseded-<stamp>/` sibling dir.

## Blockers

B1 non-resumed run-v2 always OUTPUT-COLLISION (DCS:561-563 vs GLR:5196-5199) — use resumed route.
B2 dispatch clear before submit-plan (above) — UNRESOLVED.
B3 K1-8 drift + old timestamp.
B4 new Advisor course needs new approved decision bound to new context digest; reuse → DACS-OWNER-DECISION-REUSED.
B5 trailer `design (elephant)` rejected.
B6 PO-profile receipt staleness blocks submit-plan (freshness unv).
B7 continuity-cas not in sanctioned argv list.
B8 claude Advisor always unavailable → one-time final-approval exception each course.
B9 run-v2/stage guard reads planSubmission without lifecycle check → run 8-10 only after 6.
