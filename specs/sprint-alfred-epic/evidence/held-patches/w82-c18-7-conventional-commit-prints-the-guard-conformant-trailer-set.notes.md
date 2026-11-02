# w82 — the conventional-commit skill prints the guard-conformant trailer set per context (candidate 18, C18-7)

Applies on top of the applied chain at c9a73fb80d6f587efb5e3cd595a87fa5ae480e03. Criterion binding: AC-136 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it adds

- `skills/conventional-commit/SKILL.md`: a compact subsection "Trailer set per context" under the trailer conventions, with one literal fenced example per commit context: Elephant stage-0 (`Dispatch: stage-0 (elephant)`), dispatched Goldfish (`Dispatch: TASK-ID (goldfish)`) and Elephant finishing a Goldfish result (same `Dispatch:` plus `Commit-Act: orchestrator`). `AI-Assisted: true` is in all three.
- The same subsection states that a runner- or host-suggested `Co-Authored-By`, `Claude-Session`, "Generated with" or session-URL line must NOT be added in this repository (refused as `GIT-03-PROVIDER-COAUTHOR`), shows one refused block, and names `GIT-03-DISPATCH-MISSING` for a missing `Dispatch:` trailer.
- `lib/commit-message-policy.test.mjs`: new case CMP19 reads the examples from the skill text and judges them with `finishedCommitMessageFindings`, the validator the guard uses: all three accepted blocks yield no findings, the refused block yields `GIT-03-PROVIDER-COAUTHOR`, and a block without `Dispatch:` yields `GIT-03-DISPATCH-MISSING`.

## Checks

- `commit-message-policy.test.mjs`: 43 of 43 (CMP19 RED first on the missing skill text, then GREEN). `check-consumer-safe-paths.test.mjs`: 9 of 9.
- Skill size: 4298 bytes before, 5204 bytes after (added text about 0.9 KiB; budget 24 KiB).
- No new test file; CMP19 sits in the already registered examiner.

## Not changed / not proven

- `commit-message-policy.mjs` and every guard are unchanged; `Commit-Act` is not validated by that module (it accepts any further trailer key), the form follows the goldfish-task template.
- The `design (elephant)`, `administrative` and other GIT-03 bindings are not given an example here; they are covered in the obligations file.
- The skill's section 5 command example is unchanged.
- The full Verify run and the whole-chain size/lazy-loading checks (PSV02, PSV08) were not made.
