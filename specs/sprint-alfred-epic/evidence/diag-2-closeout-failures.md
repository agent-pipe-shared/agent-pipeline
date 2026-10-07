# DIAG-2: attribution of two close-out test failures (PARTIAL - tool budget reached)

## 1. GRAMMARHINT-1 AC-1 (`plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs:2349`, assertion at 2387)

Classification: NOT a working-tree effect of the staged guard change; most likely host-only (Windows) or pre-existing. Not proven to be a regression.

- Reproduced once with a filtered single-file run (`evidence/diag-2-1.txt`): same failure as `evidence/close-c-1.txt`.
- The staged change to `plugins/pipeline-core/lib/guard/evaluate.mjs` adds only one early call, `envDumpShellRefusal(command, toolName)`, which returns null unless the command prints the process environment. `rg -n lifecycle . && touch output.txt` is not such a command, so it cannot reorder or add a denial for segment 1.
- Segment naming lives in `plugins/pipeline-core/lib/guard/shell-grammar.mjs:640` (`rejectedAndChainSegment`) and `:621` (`isChainSegmentAdmitted`). Neither file is touched by the staged change. `git log -- shell-grammar.mjs` shows only `917674f20` (the module extraction), so no later commit changed it.
- The reported segment 1 means `isReadOnlyDiagnosticCommand("rg -n lifecycle .", fixtureRoot)` is false for the temp fixture root. The path goes through `isBoundedSingleRg` / `isReadOnlySimpleWords` (`shell-grammar.mjs:888-942`). I did not read `isBoundedSingleRg`, so the exact Windows path-containment cause is unconfirmed.
- "planning the route failed with code=HGO-GIT" (`human-guard-override.mjs:176`) is a side effect: the fixture root is not a git repository. It is not the cause of the wrong segment.
- Recommended fix: read `isBoundedSingleRg`'s handling of the `.` argument against a win32 tmpdir root. Re-run this test on a clean HEAD checkout (no staged change) to settle regression versus host-only.

## 2. `guard-dispatch.test.mjs` load crash (`EPERM: fsync` in `onboarding-consent-marker.mjs` `recordConsentGiven`)

Classification: NOT EXAMINED (tool budget reached before this step). Hypothesis only, unverified: fsync on a directory handle is unsupported on win32, which would make it host-only. Not confirmed.

- Recommended next step: read `recordConsentGiven`'s fsync call and run `git grep -n -e "fsync" -- plugins/pipeline-core/lib` to see whether a sibling module already guards the win32 directory-fsync case. Then run the `GD2i` filtered capture to `evidence/diag-2-2.txt`.
