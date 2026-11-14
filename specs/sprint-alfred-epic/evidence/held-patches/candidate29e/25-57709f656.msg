test(security): restate two expectations for the Trivy scanner row and files

- close-quality-readback: the security-scan evidence line now names
  "trivy: not applicable" beside the other scanners (the behaviour is
  new, the expectation follows it).
- project-onboarding-v3 SECGATE-2: the installed-plugin fixture copies
  security-adapters/trivy.mjs and lib/trivy-baseline.mjs, the two modules
  security-scan.mjs now imports; its import closure grew by them.

AI-Assisted: true
Dispatch: stage-0 (elephant)
