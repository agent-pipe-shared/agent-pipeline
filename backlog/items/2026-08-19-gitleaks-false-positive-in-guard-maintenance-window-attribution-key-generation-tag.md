---
schema: pipeline.backlog-item.v1
id: pipeline.gitleaks-false-positive-in-guard-maintenance-window-attribution-key-generation-tag
type: defect
owner: pipeline
status: open
created: 2026-08-19
source: "Found while gathering full harness/scripts/verify.mjs evidence for the HGO Part C Critic round-2 delta re-review (dispatch PHX-WP-HGO-FAILCLOSED-IMPL-C), 2026-08-19."
---

# gitleaks blocks security-scan on a version-tag constant, not a credential

## Description

`harness/scripts/security-scan.mjs`'s gitleaks scanner reports one `high`-severity
`generic-api-key` finding, currently blocking the `security-scan` verify step
(threshold: block on `critical`/`high`):

```
path: plugins/pipeline-core/scripts/guard-maintenance-window.mjs:172
rule: generic-api-key
```

The flagged line assigns the pinned tag `gmw` + `-attribution-v1` (split here so
this description does not itself trip the same rule — see the file for the
real, unsplit literal) to the `ATTRIBUTION_KEY_GENERATION` constant.

This is a pinned key-generation version tag (the restricted attribution store's own
`keyGeneration` shape check requires a string, per the adjacent comment), not a
secret or credential. It matches gitleaks' generic pattern purely on the
`..._KEY... = "..."` shape.

## Affected artifact

`plugins/pipeline-core/scripts/guard-maintenance-window.mjs:172` (the flagged
constant) and `.gitleaksignore` (the project's own false-positive suppression
list, which already carries 17 prior entries via
`pipeline.gitleaks-content-fingerprint.v1` but not this one).

## Proposal

Add a `.gitleaksignore` entry for this exact finding's content fingerprint,
following the project's existing convention for the 17 already-suppressed
findings (`security-latest.json`'s `scanners[0].ignored` block names the
authority path/policy). Confirm no other occurrence of the same pattern exists
elsewhere before suppressing.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
