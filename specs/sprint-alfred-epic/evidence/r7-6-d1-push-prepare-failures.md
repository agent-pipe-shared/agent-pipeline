# R7-6-D1: attribution of the two failing `pushPrepareReport` cases

Re-run (win32 host): `node --test --test-name-pattern "pushPrepareReport" plugins/pipeline-core/scripts/push-prepare.test.mjs`
via `capture-evidence.mjs` -> `evidence/r7-6-d1.txt`: 13 tests, 11 pass, 2 fail (exit 1). Same two cases as `evidence/r7-6-f6.txt` lines 110-150.

Both are **host-only**: POSIX path-separator expectations in the tests that cannot hold on win32. Neither is a regression
from 6ae79760d, aa5ac90a0, 292eeabfc, ac3ec248a or 4d57fa545 (none changes the code lines below; see "Why not a regression").

## Case 1: `all preconditions met -> ready:true, all three commands rendered` (test line 750, fails at 765)

- Cause: `push-prepare.test.mjs:765` matches `PIPELINE_STATE_SCRIPT_PATH` against `/^\/.*\/plugins\/pipeline-core\/scripts\/pipeline-state\.mjs$/u`.
  `push-prepare.mjs:57` defines it as `fileURLToPath(new URL("./pipeline-state.mjs", import.meta.url))`, which on win32 yields a native
  path with a drive prefix and backslashes, so the leading-slash regex cannot match.
- Classification: host-only. The production value is correct for the host (a native path handed to `node`).
- Recommended fix: `push-prepare.test.mjs:765`, make the assertion separator-agnostic, e.g.
  `assert.match(PIPELINE_STATE_SCRIPT_PATH.replaceAll("\\", "/"), /\/plugins\/pipeline-core\/scripts\/pipeline-state\.mjs$/u)`
  (drop the leading `^`, which would otherwise reject a drive-letter prefix).

## Case 2: `verify-evidence check reads the shared VERIFY_EVIDENCE_DEFAULT_PATH constant` (test line 933, fails at 948)

- Cause: `push-prepare.mjs:184` (`checkEvidenceFreshness`) reads `join(dir, relPath)`; with `relPath = VERIFY_EVIDENCE_DEFAULT_PATH`
  (`plugins/pipeline-core/lib/verify-evidence-path.mjs:22`, `"evidence/verify-latest.json"`) `join` emits backslashes on win32.
  The recording `readFile` at test line 936 stores that path and line 948 asserts `path.endsWith("evidence/verify-latest.json")`, which is false.
  The read does happen (the `verify-evidence` check is `ok` at line 947, which passed); only the string comparison fails.
- Classification: host-only (separator mismatch in the assertion, not a missing seam: `readyDeps` already injects `readFile`, `gitHead`, `gitCommonDir`).
- Recommended fix: `push-prepare.test.mjs:948`, normalise before comparing:
  `readPaths.some((path) => path.replaceAll("\\", "/").endsWith(VERIFY_EVIDENCE_DEFAULT_PATH))`.

## Why not a regression

- The case-2 assertion originates from 056c5fd07 (`git log -S`), not from the five named candidates.
- The candidates touch key-directory resolution and machine-plane pinning (6ae79760d, ac3ec248a); neither alters path construction at
  `push-prepare.mjs:57` or `:184`. The other 11 `pushPrepareReport` cases, including the machine-plane ones, pass.
- Not verified: that the cases pass on a POSIX host (none available here); the reasoning rests on the code path only.
