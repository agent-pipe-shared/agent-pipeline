# NVA-B-CRITICINPUT-1 — findings registry, round 1

Independent T1 Critic review (opus, max) of commits `a5e264a8`, `fa8362a2`,
`5d0e537e`. Four findings, all open pending the round-2 re-Critic.

## F1 (major)

The stripped projection's safe field set included `outcome`, an unbounded
free-text field in the real corpus rather than an enum, with no machine
consumer of the stripped copy.

## F2 (major)

`dispatch-record-strip-for-critic.test.mjs` was not registered in
`harness/scripts/verify.mjs`'s `TEST_SUITES` array.

## F3 (minor)

A `report.changedFiles` entry outside the three contracted shapes
(`templates/prompts/goldfish-task.md`) was silently dropped by the stripper
rather than surfaced.

## F4 (minor)

The new "Dispatch-record citation rule" paragraph in
`templates/prompts/critic-review.md` cited its source backlog item via a
path broken across a line inside backticks, an unresolvable literal string.
