# Critic record: WINACLFIX-F bounded re-review (`5de5eaab1`)

Independent Critic, Opus 5.5 (route pre-check passed, SECURITY subject; effort not observed), ruleset
`0.7.0+claude.20261005202045.7170ed20`. Lane: functional-equivalent read-only, OS isolation not asserted.
`critic-notes.md` could not be written (GUARD-REDIRECT-UNAPPROVED); this file, written by the Elephant from the
returned report, is the durable copy.

**Status: partial review, pass/fail withheld** (budget checkpoint at counted call 20 of 24; 9 of 20 calls were guard
refusals). Not reached: category 3 (Verify discovery of the new install suite; consumers of the
`PB-WINDOWS-ASSURANCE` text in the three installers), category 7 (guardrail files, CLAUDE.md from disk), rest of
category 4 (failing-name lists; range `b54b108d9..6a36c0c4d` on `lib/hardened-private-directory*.mjs`).

## F-1 (minor) — the fixed remedy line contradicts the "removed again" disposition

`lib/hardened-private-directory.mjs:24` (`ASSURANCE_REMEDY`) is appended to every refusal (`:61-67`), including a
created segment that "has been removed again", and including status `unavailable` (no PowerShell, DACL time budget,
`windows-private-state.mjs:121,129,187,193,208`), where removing or re-securing a directory does not address the
cause. Pinned by `hardened-private-directory.test.mjs:164`. Fails closed; guidance only. Registry F2, remedy element.

## Cleared

Registry F1 (real `applyInstall` of all three installers in fresh temp repos, win32 secure assertion, premise check
`install.test.mjs:39-75`); F2 rollback (only created segments, non-recursive, errors rethrown unchanged, anchor-
relative name, single probe result); scope (four files, `changedFiles` matches the three lib files); authorship
trailers; test integrity (append-only hunk, no skips); edge cases (non-empty segment kept, earlier secure segments
kept, harden throw rolled back); no host path in messages; no new dependency; English. Trajectory consistent for all
nine logs (red 14/8/6, green 14/14, install 3/3, pre-push 44/44, commit-msg 22/20/2, pre-commit 56/5/51 before and
after). Not verifiable: consumer-safe-paths 9/9 (no log submitted), logs not bound to a tree.

## Elephant disposition

- F-1 → small fix slice: remedy line chosen by disposition and status (removed-again: retry after fixing the
  observation cause; existing/unremovable: owner removes or re-secures).
- Remaining categories 3, 7 and rest of 4 → follow-up Critic with the enumerated scope above.
