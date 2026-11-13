docs(adr): accept ADR-0092, the tool registry asked for at onboarding

PO tiles 2026-11-12, register D241-D243.

- ADR-0092: one registry feeds docs/toolchain.md, the preflight floors and
  the readiness findings; the required set (Node.js, Git, gitleaks,
  osv-scanner, semgrep; Trivy only with infrastructure files; OpenSSL to
  sign); onboarding asks, the person installs or defers, the deferral is
  recorded on the machine and lifts no plan or close check
- docs/state.md: register lines for D241 (ADR-0092), D242 (Semgrep blocks
  only findings new in the feature) and D243 (packages.config reader)
- ADR index row and doc-governance classification for the new ADR

AI-Assisted: true
Dispatch: stage-0 (elephant)
