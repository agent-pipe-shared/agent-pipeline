# w30i8 — the obligations and the other commit-route texts say what really holds for the one-command commit (C30-19, C30I-S4B)

Applies AFTER the integrated tree including the 30i slices S1A to S7, S4 and the analysis (the clone base8): the patch is a delta on the same files and does not apply to the real HEAD until that tree is applied (`apply --check` is exit 0 against `scratch/agent-out/c30g/base8`, exit 1 against the real HEAD, as expected). The check test therefore never runs `git apply`. Criterion binding: AC-111 is the closest existing accepted criterion; the PRD and the Spec are unchanged. The Critic is suspended by the PO for candidates of this repository, so this change is verified by tests only, not by a live round.

## What

- `harness/scripts/generate-agent-obligations.mjs` (the generator): the "provenance-bearing commit" bullet now teaches, for the Elephant and any non-dispatched commit, the one-command form first (`git commit -m <subject> [-m <body>] --trailer "AI-Assisted: true" --trailer "Dispatch: <ID>" -- <paths>`), the two Git facts (a plain-prose last body paragraph keeps the blank line; a last paragraph of `Key: value` lines is glued, `GIT-03-TRAILERS-GLUED-TO-BODY`), the file route `git commit -F <msgfile> -- <paths>` as the fallback (long or multi-paragraph body, non-ASCII, backslash, newline), and the exact guard-push limit. The section 9 bullet is restated the same way. The phrase `commit with \`git commit -F <msgfile> -- <paths>\`` that the AC-106 contract tests extract is kept.
- Both generated copies (`templates/prompts/agent-obligations.md`, `plugins/pipeline-core/templates/prompts/agent-obligations.md`) come from running the generator and `generate-vendored-canon.mjs`; nothing was edited by hand. `plugins/pipeline-core/templates/prompts/goldfish-task.md` is likewise the vendored copy.
- `templates/prompts/goldfish-task.md`: the Goldfish route stays the message file (decision below); only the inaccurate reason "guard-push refuses it" is replaced.
- `lib/goldfish-commit-command-flow.mjs`: the Ruling 150 comment states the accurate reason. `lib/guard/shell-grammar.mjs`: the commit hint states the exact guard-push limit instead of "parentheses ... remain refused even when quoted".
- `generate-agent-obligations.test.mjs`: three AC-111 cases (one-command form first plus Git fact plus exact limit; none of six commit-route files keeps the blanket claim; the Goldfish route keeps the file and names the real reason). RED first: 2 of the 3 failed against the original text, then GREEN.

## Measured facts (read in code and tests)

- guard-push: `hooks/guard-push.mjs` (about line 369, Ruling 157 second-stage proof) admits a marker candidate only when it is one plain `git commit` (words 0 and 1 literal, no global option), printable ASCII, no backslash, no newline, no unquoted marker character. `guard-push.test.mjs` PGC-T82b admits `git commit -m ... --trailer "Dispatch: X (goldfish)" -- docs/a.md`. Outside that shape the parenthesis is refused.
- guard-dispatch-budget: after the working cap `isSingleGitClosingCommand` rejects a commit command that holds `( )` (`PRODUCER_ARGS_CONTROL_PATTERN`, about line 810). The Goldfish trailer `Dispatch: <id> (goldfish)` has parentheses, so the file route is the one that works at every point of a dispatch.
- Decision (b): the dispatched Goldfish route is NOT changed. guard-push and guard-git admit the one-command form with an exact pathspec before the cap, but not as a closing act after it, and the commit flow producer prints the `-F` route; no enforcement was touched.

## Not changed

- `scripts/goldfish-commit-command-flow.mjs` carries no such sentence (only a comment about duplicates), so it is untouched. `skills/pipeline-start/references/kickoff-design.md` does not repeat the blanket claim (it says `git commit --file <message-file>`, which is true), so it is untouched.
- `scripts/goldfish-commit-command-flow.test.mjs` (about lines 291 and 320) and `hooks/guard-lifecycle-ready.test.mjs` (about line 2820) still carry the old wording in comments/strings; they are outside the write list (a comment and a test string, no behaviour). Follow-up.
- No guard behaviour, GIT-03 or flow enforcement changed.

## Tests (clone, test-in.mjs, one at a time)

- `harness/scripts/generate-agent-obligations.test.mjs`: 16 of 16 (includes the byte-equality and vendored-copy cases).
- `lib/pins/agent-obligations-says-no-and-and-while-the-guard-admits-six-segments.test.mjs`: 9 of 9 (AP7 equals a fresh generation; no restatement needed).
- Also green: `harness/scripts/generate-vendored-canon.test.mjs` 8 of 8; `lib/pins/commit-grammar-hint-still-requires-scratch-message-file.test.mjs` 7 pass, 1 skipped (pre-existing).
- This check test: 3 of 3.

## Not proven

- No full Verify, no Critic, no architecture-boundary run. The check test is not registered in a Verify suite list.
