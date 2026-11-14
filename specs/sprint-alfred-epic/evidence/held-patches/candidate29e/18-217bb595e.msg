fix(security): Trivy applicability reads tracked files and skips List documents

- At the top level of a Git work tree the trigger files come from the tracked
  listing (regular files only). Untracked and ignored bytes are no part of the
  candidate; the walk over a working copy took 28 s and exceeded the entry bound.
  A subdirectory and the archive snapshot are still walked.
- A kind List or <X>List document is no trigger. Trivy 0.76.2 reports no target
  for it, so the trigger-not-scanned rule turned every such close into an ERROR.
- Adapter tests pin both, measured against the real binary.

AI-Assisted: true
Dispatch: stage-0 (elephant)
