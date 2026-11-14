test(security): fixtures that disable every other scanner disable Trivy too

- Trivy is default-enabled (ADR-0103), so a fixture that lists the four
  other scanners explicitly now runs it as a second scanner. The producer
  fixture of security-scanner-failure-provenance and the manifest of
  security-scan-large-inventory add trivy: enabled: false; both suites
  are green again, the assertions are unchanged.

AI-Assisted: true
Dispatch: stage-0 (elephant)
