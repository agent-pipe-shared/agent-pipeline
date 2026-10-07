# Close-out evidence — governance-scope proposal loses enrollment with a stale worktree

- Item: `backlog/items/2026-09-28-governance-scope-proposal-loses-enrollment-with-stale-worktree.md`
- Fix commit: `26fef9e7d26be3d59b7e609c1dad9dd04c747b4d`
- Regression case: `plugins/pipeline-core/lib/governance-scope.test.mjs`, RC14C017 "closest containing nested linked worktree keeps its own decision despite a stale sibling"
- Run (2026-10-07, win32 host, dispatch CLOSE-A, captured by `capture-evidence.mjs`):

```text
command: node --test "--test-name-pattern=stale sibling" plugins/pipeline-core/lib/governance-scope.test.mjs
exitCode: 0
✔ RC14C017 closest containing nested linked worktree keeps its own decision despite a stale sibling
ℹ tests 1 · pass 1 · fail 0
```
