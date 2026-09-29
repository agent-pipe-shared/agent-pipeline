---
schema: pipeline.backlog-item.v1
id: pipeline.semgrep-offline-default-version-check
type: defect
owner: pipeline
status: open
created: 2026-09-29
done_when: manual
source: "Bounded native Semgrep controls, 2026-09-29: same executable and shipped local rules time out with default version check; disabling only that check completes valid JSON in 3615ms."
---

# Suppress Semgrep's default version check during offline local-rules scanning

## Confirmed defect

With private HOME and network disabled, native Semgrep completed its clean scan
summary but did not exit before the adapter's 60,000ms deadline. A separate bounded
control using the same binary and shipped rules changed only
`SEMGREP_ENABLE_VERSION_CHECK=0`: Semgrep 1.170.0 exited 0 with complete valid JSON
in 3615ms. This narrows the observed failure to the version-check behavior in that
environment; it does not establish every possible scanner timeout cause.

The adapter already fixes metrics, log, settings and version-cache environment,
but leaves Semgrep's enabled-by-default version check active. The upstream
[scan option definition](https://raw.githubusercontent.com/semgrep/semgrep/develop/cli/src/semgrep/commands/scan.py)
declares that default and the environment variable.

## Narrow correction and acceptance

Fix `SEMGREP_ENABLE_VERSION_CHECK` to `0` after caller environment merge. Preserve
argv, shipped/local rules, deadlines, ERROR handling and candidate/gate bindings.
Capture the actual child environment under a caller attempting to enable the
check; run the registered adapter/security regressions. Native public-PUSHSEED
acceptance remains a separate obligation until its owner executes the unchanged
callback after the Source repair is frozen.

Evidence: `scratch/0.7-native-semgrep-bounded-diagnosis-20260929/manifest.json`
and `version-check-control.manifest.json` (control SHA
`7bc0847b24fb7b11ef3e9a4342a0750dd042fd36450d9ea90bfe5b93648a1a28`).
Source delivery/qualification: `scratch/0.7-semgrep-offline-version-check-fix-20260929/`.
The separate scanner-provenance improvement covers diagnostic retention, rather
than this production offline-environment defect.
