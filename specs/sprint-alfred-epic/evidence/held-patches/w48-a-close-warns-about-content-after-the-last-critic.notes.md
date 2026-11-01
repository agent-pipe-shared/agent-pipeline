# w48 — the close warns about content commits after the last Critic round (candidate 17, slice 1)

Found by the Toolbox consumer close: its Critic course had review-2 on candidate 23fe12d; after the first freeze four content commits
(lockfile, dependency bump, AGENTS.md, `.gitleaksignore`) followed. The 16a re-freeze admitted them (it only protects the State file,
`audit-bundles/<feature>/` and `specs/<feature>/`), the feature reached `closed-local`, and then the push gate refused: its Critic
carry-forward treats those commits as unreviewed content (`CVL-CARRY-CONTENT-CHANGED`), and a closed course takes no review any more
(`CCA-REGISTRATION-SHAPE`, `SCF-TAKEOVER-IDENTITY`). Two gates judged the same commits differently, and the second one only spoke after
the close, when the course could no longer help.

## Change

- `lib/critic-course-admission.mjs`: new `criticCarryAdvisory({repoRoot, featureId, candidateCommit})`. It reads the retained course history,
  takes the last reviewed candidate, and classifies `last-reviewed..candidate` with the SAME function the carry-forward uses
  (`classifyRegisteredEvidenceOnlyCommits` with `admitCriticExports: true`). Content commits yield a read-only advisory
  (`pipeline.critic-carry-advisory.v1`: the reviewed candidate, up to 20 commit ids, a message naming the way out); anything unreadable or
  carried yields null, so it never blocks.
- `scripts/close-coordinator.mjs`: a `candidate-frozen` plan (first freeze and re-freeze) prints `criticCarryAdvisory` beside the plan,
  outside the plan digest (like `courseAuthorship`). Never a refusal.
- `skills/close-feature/SKILL.md`: the re-freeze paragraph names the advisory, the correction-DIFF route before the close, and the new-feature
  route (rigor 1, full Critic) after it.
- Test (existing suite `critic-verify-lifecycle.test.mjs`, "17 the carry advisory ..."): a carried documentation commit is silent, content
  commits are listed with the carried one left out, no registered review and the reviewed candidate itself are silent, an unreadable course
  never blocks. A mutation that stops admitting Critic exports fails it.

## Open for the PO

- Warn or refuse: the advisory only warns. Refusing the re-freeze (or the freeze) on content after the last review would close the gap
  fully but changes what a close may do; PO decision.
- The advisory starts from the last REGISTERED review of the course; a course without registered history gets none.

## Not proven here

- No run on a real consumer close; the process-level `plan-transition` output is not asserted (a course history is needed that the
  coordinator fixture does not build). No Full Verify on the applied tree; batch Critic still paused for this repo.
