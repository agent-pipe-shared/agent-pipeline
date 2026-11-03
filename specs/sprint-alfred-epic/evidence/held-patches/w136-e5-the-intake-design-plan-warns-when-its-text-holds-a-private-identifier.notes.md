# w136 — the intake design plan warns when its generated text holds a private identifier (candidate 19, E5)

Touches `plugins/pipeline-core/lib/onboarding-continuity.mjs` and its test only. Criterion binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it adds

- `buildOnboardingIntakeGeneratePlan` runs the pre-commit detector (`scripts/check-private-identifiers.mjs`: `derivePatterns` and `inspectAddedLines`, imported, no copied regex) over the three generated texts (`design-input.md`, the PRD, `spec.md`).
  Patterns come from the target repository's configured `user.email`, the machine's home and user path, and the ignored local pattern file the scan reads; a caller (the test) may inject `privateIdentifierPatterns`.
- On a match the plan result carries `warnings: [{ code: "INTAKE-PRIVATE-IDENTIFIER", categories, targets, remedy }]`. It holds category names and target file names only, never the matched value.
  The remedy says to remove the identifier from the answer or question, or record the answer privately, before apply, because the pre-commit hook refuses the commit otherwise.
- Without a match the result has no `warnings` key (unchanged shape). The warning is outside `binding`, so `planSha256` and `targets` are identical with and without a match. The plan is never refused.
- Any failure of the detector (no git, unreadable or invalid pattern file, thrown error) is silent: no warning, no exception.

## Checks

- Existing happy-path intake-generate case (OBC242) extended, no new `test(` case: an injected local pattern on a token of the generated text yields the warning with category `local-pattern` and target `design-input.md`, the warning lacks the matched value, no match gives the old shape, `planSha256` and `targets` equal, a throwing detector yields nothing. The first fixture used a second answer round, which the intake refuses; the Elephant rebuilt it from the generated text.
- `onboarding-continuity.test.mjs` run alone and clean in the clone (before the fixture fix): 324 tests, 323 pass, 1 fail (OBC242 only; the 8 failures of the Goldfish's earlier run were caused by editing production during that run). OBC242 alone after the fix: 1 of 1 pass. The full suite was not rerun after the test-only fix.
- `check-private-identifiers.test.mjs` run alone: 6 of 6 pass.

## Not changed / not proven

- The detector, the hook and the pattern file reader are untouched; the pattern file is read by its default path because the reader is not exported.
- The apply step does not re-warn and does not block; the pre-commit hook stays the gate.
- The e-mail category was not exercised by a test (the machine's own e-mail is not injected into the fixture); the local-pattern path shares the same detector function.
- The full Verify run was not made.
