feat(security): add the Trivy adapter for infrastructure and container files

C29e Trivy, first slice (PO tiles 28d 4/5, 29d T8; ADR-0092). A new
security adapter scripts/security-adapters/trivy.mjs, not yet wired
into the scan loop:

- applicability decided without the binary from the scan root:
  Dockerfile/Containerfile variants, *.tf, and YAML/JSON Kubernetes
  manifests (column-0 apiVersion and kind; Kustomization/Component and
  templated files excluded, as measured); none means SKIPPED "success"
  with no spawn;
- offline, neutral invocation: --skip-check-update, an empty private
  cache, an empty --config and --ignorefile, a private cwd and no
  TRIVY_* variable, so a candidate's own trivy.yaml, .trivyignore or
  TRIVY_SEVERITY cannot narrow its scan (the real-binary test proves
  it);
- fail closed on a nonzero exit, unparseable JSON, a SchemaVersion
  other than 2, any ERROR/FATAL stderr line except the embedded-checks
  fallback, and a trigger file Trivy did not report as a target;
- FAIL misconfigurations as findings (rule = ID, path = target, line
  from CauseMetadata), inline trivy:ignore comments listed;
- capability contract cap.iac.

Tests use spawn stubs; one real-binary case is skipped without trivy.

AI-Assisted: true
Dispatch: stage-0 (elephant)
