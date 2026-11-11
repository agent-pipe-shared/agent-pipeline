feat(security): widen the default rule pack and report scans honestly

- security/semgrep/pipeline.yml: nine more default rules for web and Node
  code (DOM sinks, eval-like calls, unsafe URL schemes, unvalidated
  redirects, postMessage without origin check, prototype pollution,
  shell-string child processes as WARNING; provider-shaped secrets as
  ERROR; credential assignments), with positive and negative fixtures
  (held patch C28-SECURITY-COVERAGE, Goldfish-built).
- A scan on a dirty or unbound worktree, or with zero loaded rules, is
  marked not-run and never counted as a result; the close prints one
  WARNING with the next step per scanner that did not run, was skipped or
  covered only part of the tree.
- security.required_capabilities (secrets, sast, sca, license) in the
  project manifest makes a capability mandatory: a declared one that did
  not run refuses SEC-CLOSE-REQUIRED-CAPABILITY-NOT-RUN; undeclared, the
  same state stays a warning.

AI-Assisted: true
Dispatch: stage-0 (elephant)
