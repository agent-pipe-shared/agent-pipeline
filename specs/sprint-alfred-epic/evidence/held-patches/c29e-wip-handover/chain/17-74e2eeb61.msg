feat(security): the close scan runs Trivy and blocks only on findings the feature added

- security-scan.mjs runs Trivy as the fifth scanner, enabled by default. A tree
  with no Dockerfile, Terraform file or Kubernetes manifest reads not-applicable
  and spawns nothing; a walk error is an ERROR.
- lib/trivy-baseline.mjs scans the feature's base commit in a temporary detached
  worktree and treats a candidate finding as existing when the base had the same
  rule at the same path (counted, line ignored). Existing findings are listed and
  never block; new ones block at the configured severities. Without a feature or
  base, every blocking-severity finding blocks.
- Inline trivy:ignore comments are counted and printed, never applied as a block.
- security-close-status knows trivy; the iac-cloud catalog control applies only
  when the tree has infrastructure files (revision 2).
- Fixtures that pinned four scanners now name trivy or disable it explicitly.

AI-Assisted: true
Dispatch: stage-0 (elephant)
