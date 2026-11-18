# w311b: lane M1 (L20) completed by the Elephant, supersedes the patch of w311

The Goldfish of lane M1 stopped at a checkpoint: one line lay outside its write list. This patch is the cumulative diff of the clone against the candidate 31 base clone and REPLACES `w311-...patch` in the chain (apply only this one; the w311 notes stay the recon and the cause record).

What differs from w311:

1. `lib/critic-review-lineage.mjs` (`compileRegisteredCriticReviewLineage`): the key list of the second `resolveRegisteredCriticCourseIdentity` call passes `successorOf` when the course request carries it (the line named in the w311 notes, section 3). With it the seven lineage cases C31-L20-1 to 4 are green.
2. `scripts/session-critic-finalizer.mjs` is back at the base: the Goldfish's `consumedReplayFor` (answering an identical replay of a consumed finalize from the journal) turned two pins of `session-critic-finalizer.test.mjs` red (Cut A cases 1 and 3: a replay of a caller-authored completion is refused). That pin is the single-use property of the caller-authored fallback label; weakening it is an admission-rule decision, not part of this lane. The route that completes a consumed round is the lineage verb itself, which now works.
3. C31-L20-5 is restated as a pin: a replay stays refused (`SCF-PRELAUNCH-ADMISSION`) and the lineage verb registers the consumed round (or reports it already registered).

Open (for the PO, default: leave as is): the cause of the replay refusal (the first finalize removes the packet's disposable checkout, so the prelaunch read fails `CPP-GIT`) stays; its text could say that the lineage verb is the next step. Not built here.

Tests run in the clone, one at a time: `register-feature-package-readback.test.mjs` 43 of 43, `critic-review-lineage.test.mjs` 1 of 1, `critic-course-admission.test.mjs` 104 of 104 (Goldfish run), `session-critic-finalizer.test.mjs` 129 of 129 (base state). The Critic is suspended and no Full Verify ran.
