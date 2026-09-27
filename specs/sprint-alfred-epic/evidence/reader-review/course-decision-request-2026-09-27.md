# Reader-review course decision needed

The 0.7 documentation course completed four fresh two-stage rounds
(`20260923a`, `20260924a`, `20260927a`, `20260927b`) and three public-document
correction batches. The final round reviewed the committed document set at
`c3ff4084872ff5351b37e0438a932573479fb3c3` and left five concrete
findings open. Their evidence and scope are summarized in
`course-handover-2026-09-27.md`; the phase reports are retained separately.

The `reader-review` skill and `harness/reader-review-protocol.md` require an
explicit documentation-owner course decision at this limit. A new decision
does not itself close a finding or replace a fresh passing final review.

## Decision options

1. **Authorize one newly bounded correction course (recommended).** Scope it
   to the five findings in the handover. Prepare one reviewable document patch,
   use the normal guard/PO routes for protected root files, commit the exact
   document state, and run a fresh two-stage reader review. Preserve the old
   course and its open findings. Release remains unqualified until a passing
   binding is recorded.
2. **Defer these documentation corrections and the 0.7 release.** Keep the
   current reader outcome as an explicit blocker; resume only under a later
   course decision. No `record.json` or source release readiness claim follows.

No option authorizes publication, push, a plan approval, or a guard override.
Those authorities remain separate.

## Documentation-owner decision (2026-09-27)

The documentation owner initially selected option 1 for the five findings
above. The prior four-round course and its final reports remain intact.
This decision does not pre-approve individual guarded root-document writes.

The owner then clarified the limit: complete this single terminal correction
batch and **do not run another two-stage reader review afterward**. This
explicit instruction supersedes the review step in option 1. The five known
findings are resolved editorially in the prepared patch. The source binding
checker currently has no terminal-correction evidence contract, so this
decision alone cannot create a passing source-bound `record.json`. Release
readiness must report that limit honestly.
