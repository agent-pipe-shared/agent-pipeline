feat(security): block a Semgrep finding only when the feature introduced it

PO tile 2026-11-12 (D242): findings that existed before the feature are
listed and do not block; new ones block.

- lib/semgrep-baseline.mjs: the baseline is read from the candidate
  snapshot (active or last closed feature, the start of its range, an
  ancestor commit), never from a caller; blockingFindings is the one
  verdict function the scan's exit code uses
- close-commit-split.mjs: featureRangeBase is the one definition of a
  feature range's start, shared by the commit count and the baseline
- security-scan.mjs: when the full Semgrep scan has a blocking-severity
  finding, a second --baseline-commit pass runs in its own throwaway
  worktree (Semgrep checks the base out in the tree it scans), reads a
  project rules_dir from that worktree so rule ids line up, and is
  removed afterwards; the judgement goes to execution.semgrepBaseline
  (the v1 key set and the finding envelope are unchanged); older
  findings are printed as not blocking
- fail closed: no feature, unreadable range, missing or non-ancestor
  base, a failed pass, a new finding without a counterpart in the full
  scan, or an existing finding in an added file make the baseline
  unavailable and every blocking-severity finding blocks
- semgrep adapter: an optional full commit id is passed as
  --baseline-commit; scanRootRelativePath is exported
- semgrep-baseline.test.mjs (registered, inventory line): unit cases and
  the real two-pass chain with the installed semgrep

AI-Assisted: true
Dispatch: stage-0 (elephant)
