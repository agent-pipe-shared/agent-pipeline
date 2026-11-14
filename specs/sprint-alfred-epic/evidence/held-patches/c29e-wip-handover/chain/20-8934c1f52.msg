test(security): the Semgrep-only diagnostics fixture disables Trivy

- Trivy is a default-enabled scanner now, so the fixture that enables only
  Semgrep names it disabled, as the other single-scanner fixtures do.

AI-Assisted: true
Dispatch: stage-0 (elephant)
