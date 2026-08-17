# Closure evidence: `po-human-approval.mjs`'s `outside()` Windows/POSIX separator bug

Backlog item:
- `backlog/items/2026-08-17-po-human-approval-outside-check-uses-a-posix-only-separator-on-windows.md`

## Timeline

- `d2e2fc4c` (dispatched `NVA-WINPATH-1`) — `outside()`'s containment check
  made separator-agnostic by normalizing `path.relative()`'s output with
  `.split("\\").join("/")` before the `../`-prefix comparison.
- Round-1 Critic review: verdict **FAIL**. F1 (major): the normalization was
  applied unconditionally, including on POSIX hosts, where backslash is a
  legal filename character — a directory literally named `..\<name>` (a
  single path component, not a traversal) got misclassified after
  normalization, a fail-open regression in the opposite direction from the
  original bug.
- `ba562481` (dispatched `NVA-WINPATH-2`) — scoped the normalization to the
  win32 branch only (`platform === "win32" ? raw.split("\\").join("/") :
  raw`); POSIX now uses the raw `path.posix.relative()` output untouched.
  Added a POSIX regression test asserting a `..\keys`-named directory is
  still classified as inside root. RED-before-GREEN discipline followed
  (dispatch record: extended test run against the unfixed code first,
  confirmed it failed exactly as F1 predicted, then applied the fix and
  confirmed green).
- Round-2 Critic delta review (`ba562481`, bounded, prior F1 registry
  supplied as neutral evidence): verdict **PASS**. F1 independently
  re-traced against the fixed code and confirmed resolved by direct source
  trace plus an independently-run `node --test` (58/58, matching the
  dispatch record's claim). Confirmed the win32 branch is byte-for-byte
  unchanged from round 1 and still fixes the original backlog defect
  (same-drive external directories). No new regression found. Trajectory
  check: consistent (commit trailers, diff-range integrity, and the
  full-verify-blocked disclosure in the dispatch record were all
  independently corroborated against git history). No findings survived
  the evidence gate.
- `node --test plugins/pipeline-core/scripts/po-human-approval.test.mjs` →
  58/58, independently re-run against the current checkout, 2026-08-17.

## Independent Elephant re-confirmation, 2026-08-17

The fix is present in the current checkout's source (`ba562481` on
`feat/sprint-nova-codex-v046`), the target suite re-runs clean as recorded
above, and the round-2 Critic review concluded with an unambiguous PASS
verdict and no unresolved finding.
