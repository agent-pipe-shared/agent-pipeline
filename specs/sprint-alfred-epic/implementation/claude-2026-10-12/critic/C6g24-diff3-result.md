# Critic C6g24 correction-diff review 3 of 3: result

Review object: 29df88cad, restricted to plugins/pipeline-core/lib/protected-baseline.mjs and its test (git show). Route: requested claude-sonnet-5-5 at high; observed claude-sonnet-5-5.
Verdict: **FAIL** (one major finding, one minor). This was the last correction-diff round of batch C6g24; per the PO rule the Coordinator verifies the fix itself.
Notes: scratch/dispatch/critic-a1362458779812e32/critic-notes.md (local, untracked).
Critic's own run: protected-baseline.test.mjs 12 tests, 10 pass, 2 fail (the environmental WT-GIT-FAILED and symlink EPERM cases), 0 skipped, 0 todo.

| ID | Severity | Gap | Evidence |
|----|----------|-----|----------|
| G24-D3-F1 | major | The doubled-separator collapse closes the alias only in the library matcher, whose only production caller receives git-normalised paths. The live Edit/Write and shell-lane matchers fold backslashes only and match the raw path, so a doubled-separator spelling of a protected guard file still misses its pattern. | plugins/pipeline-core/lib/protected-test-paths.mjs:103-108,119-120,394-395; hooks/guard-testpath.mjs:151,191; lib/tool-write-target.mjs:40; spec §4.3 A3 |
| G24-D3-F2 | minor | The commit's single Dispatch trailer (ALF-C-AC258-UNBORN) cannot bind the protected-baseline paths, and two unrelated themes share one commit. | git show --stat 29df88cad; guardrails/git.md GIT-02, GIT-03 |

Cleared: the normal() change and its three pins, scope, edge cases of normal(), test integrity, guardrails, security of the changed function, dependencies, language.

## Coordinator disposition

- G24-D3-F1: correction dispatch ALF-C-C6G24-LIVE puts the live matchers on the same separator normalisation, with regression cases. The Coordinator verifies it; no further Critic round exists for this batch.
- G24-D3-F2: accepted as recorded. The commit-msg hook admits only one Dispatch trailer, and the second dispatch is named in the commit body. Both changes needed one PO signature for the signed quality package. Future packages split per concern where the PO's signing effort allows.
