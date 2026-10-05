# PO runbook — finish the Alfred design course (prepared 2026-10-04 while the PO was AFK)

One step per message. `!` = the PO runs it in the Claude prompt. SIGN = attended external PowerShell
(passphrase). The Elephant runs everything else and hands over each next command live (digests and the
continuity revision are read live, never pre-computed).

State at preparation: HEAD b3903ce7c (rev 3 sources + host-observed clarification + PO decisions of
2026-10-04), lifecycle `draft` (reopened), continuity revision 15 with the old stage-0 dispatch still registered.
Source digests: prd f34fa0fd…, spec 9c89f81b…, input 3ccc759e…, design 77d36fc8…, traceability 30cad5d0….
(Re-read live before every step; any further source edit changes them.)

## A. Hotfixes on the installed plugin (outside the repo; do these first)

1. `! node --test scratch/hotfix-readiness-schema/hotfix.test.mjs`  (P-7, expect all pass)
2. `! node scratch/hotfix-readiness-schema/apply.mjs --target "<clone>\agent-pipeline-local-marketplace\plugins\pipeline-core\scripts\runner-design-readiness-bootstrap.mjs" --expect-sha256 46399377806afe50bef0a55d84a0f20f94d5aed663be70f96244222615e08645`  (expect afterSha256 a7522bb9…)
3. `! node --test scratch/hotfix-child-course/hotfix.test.mjs`  (P-9)
4. `! node scratch/hotfix-child-course/apply.mjs --target "<clone>\agent-pipeline-local-marketplace\plugins\pipeline-core\scripts\design-advisory-coordinator.mjs" --expect-sha256 c02dceba9fa1c1230eb8f9659ad9a181f66df6f8136f0f6bb28e701924bc8b9d`  (expect afterSha256 466a6659…)

## B. Supersede the old authoring dispatch (P-8, SIGN #1)

5. Elephant re-runs the identical denied call (description "Supersede stage-0 authoring dispatch via
   continuity CAS"; `--expected-revision 15 --request-file scratch/alfred-revision-cas/clear-authoring-dispatch.json
   --lock-token alfred-rev3-supersede-20261004`) → new request → plan → prepare-for-signature.
   Only when the PO says "bereit zum Signieren". Window ~45 min from the denial — sign immediately.
6. SIGN: the `sign-intent` one-liner the Elephant prints → PO sends the proof file path.
7. Elephant: authorize-by-signature → byte-identical retry → readback revision 16, dispatch null.

## C. Resubmit and register the revision authoring dispatch

8. Elephant: `pipeline-state.mjs submit-plan --by "Elephant" --profile epic` (PO-profile receipt binds only
   repo profile files → not staled by hotfixes). Readback: lifecycle awaiting-approval, continuity revision 17,
   authority prd/spec = the digests above.
9. Elephant builds the registration request from the LIVE revision-17 continuity (queueRevision 18,
   dispatch ALFRED-REV3-AUTHOR-20261004 attempt-1, routeRequestSha256 = plain sha256 of
   `scratch/alfred-revision-cas/rev3-authoring-route.json`, digests = authority) → `continuity-cas` → almost
   certainly denied → SIGN #2 (same ceremony as B; "bereit zum Signieren").

## D. Evidence directory (PO, because agents cannot write evidence/ in this phase — K5-8)

10. `! mkdir evidence/design-course/sprint-alfred-epic/superseded-20261004`
11. `! mv evidence/design-course/sprint-alfred-epic/claude.* evidence/design-course/sprint-alfred-epic/superseded-20261004/`
12. `! cp scratch/revision-draft/claude.exception-rationale.rev3.txt evidence/design-course/sprint-alfred-epic/claude.exception-rationale.txt`

## E. Advisor stage, readiness, presentation

13. `!` Advisor stage (Elephant prints the exact `design-course-session.mjs --stage advisor … --execute`
    line with the live digests and `--authoring-dispatch-id ALFRED-REV3-AUTHOR-20261004`) → expected:
    child course, outcome unavailable-pending-final-approval, artifacts exported.
14. `!` save its stdout as `evidence/design-course/sprint-alfred-epic/claude.advisor-result.json`
    (Elephant prints the exact command; or the PO pastes the JSON and the Elephant writes it if admitted).
15. `!` `--run-v2` (Elephant prints it: `--readiness-dispatch-id ALFRED-READINESS-20261004`, live
    `--queue-revision`, exception-rationale and advisor-result with their sha256) → readiness receipt +
    package. If readiness is not-ready again: the Elephant revises (no PO action besides "ja" to the
    revision content) and repeats from C.
16. Elephant: `present-plan --by "Elephant" --design-workflow-package evidence/design-course/sprint-alfred-epic/claude.package.json`.
17. SIGN #3 = the ONE final plan approval (P-1): approves the package incl. the Advisor exception and the
    child-course linkage. PO may overrule any rev-3 default here.

## F. After approval (autonomous)

Wave 0 (W0-0…W0-3, incl. porting hotfixes 1–8), then waves 1–4 per `scratch/prework/wave-plan-v2-draft.md`
(becomes the tracked plan in W0-0). PO touches until the stamp: none planned except P-4…P-6 host runs after
install and the open questions in `scratch/prework/SYNTHESIS.md` (model families Q-MF1…3, recovery Q-RV-7).
