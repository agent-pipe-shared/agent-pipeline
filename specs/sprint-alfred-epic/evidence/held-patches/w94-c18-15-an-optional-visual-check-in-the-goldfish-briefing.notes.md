# C18-15 optional visual check in the Goldfish briefing (held patch notes)

Patch: `w94-c18-15-an-optional-visual-check-in-the-goldfish-briefing.patch` (git diff --binary, 2 files).
Criterion binding: AC-239 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## Order (chain slice)
The patch is a delta on held patch w85 (it edits the same plugin files). Apply w85 first, then this patch. Against a checkout without w85
`git apply --check` fails; that is expected. Plugin files are protected, so the operator applies and commits them as the human operator.

## What
- `plugins/pipeline-core/lib/dispatch-briefing-build.mjs`: the package schema accepts one optional key `visualCheck`, a closed object
  `{ question, evidencePath }` (both required, question one line up to 300 characters, evidencePath a repository-relative file under
  `specs/<feature>/evidence/` with no `..`, `.`, `.git`, backslash or absolute form, up to 240 characters). Validation is `isVisualCheck` /
  `isVisualEvidencePath`; a bad value is refused `DBG-PACKAGE-FIELD-TYPE` naming the repair, like the other field refusals. The key joins KNOWN_KEYS.
- `renderGoldfishBriefing`: when the key is present, a fixed `**Visual check**` block closes field 3 (screenshot at evidencePath, answer the
  question yes/no plus one sentence, never claim the check passed without the file, otherwise report not verifiable). When absent the text is unchanged.
- `plugins/pipeline-core/scripts/dispatch-briefing.test.mjs`: three appended cases (accepted and rendered; the block is the only difference a present
  key makes, so an absent key stays byte-identical; unknown/malformed shapes refused).

## Why
A consumer run passed all green tests with a camera defect and a bad stair block visible only in screenshots; no step required a look at the result.

## Not changed
`goldfish-task.md`, the guard-dispatch admission, the briefing hash scheme, any existing package key or refusal code.

## Not proven
- `path` existence of the screenshot is not checked at build time (the file is produced by the dispatch).
- The block is not parsed by any guard; the Goldfish following it is not enforced.
- No new test file; the three cases live in an already registered test file.

## Counts
- RED before the production edit: 3 new cases failing (DBG-PACKAGE-KEY-UNKNOWN).
- GREEN: dispatch-briefing.test.mjs 146 tests, 145 pass, 1 fail. The one failure, "public --help and -h work before setup without private reads", fails with
  HELP-FORBIDDEN-IO identically before the production edit (it was red in the RED run too), so it is not caused by this change; cause not investigated.
- check-consumer-safe-paths.test.mjs: 9/9.
