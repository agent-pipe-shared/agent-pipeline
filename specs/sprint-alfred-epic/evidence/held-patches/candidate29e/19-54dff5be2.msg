fix(security): the Trivy scan sends no usage data and asks for no update

- The adapter passes --disable-telemetry and --skip-version-check. Trivy 0.76.2
  names both as network uses in its own help; the scan of a bank repository must
  stay offline, as Semgrep's metrics and version check already are.
- The adapter test pins both switches.

AI-Assisted: true
Dispatch: stage-0 (elephant)
