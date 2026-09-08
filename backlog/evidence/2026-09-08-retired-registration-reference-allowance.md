# Retired registration reference allowance — 8 September 2026

The reference-path checker had an ALLOWLIST entry for
`plugins/pipeline-core/lib/codex-host-plugin-list.test.mjs` in
`harness/scripts/check-verify-suite-registration.mjs`. The scheduling-comment
cleanup had already removed that source reference, leaving the ALLOWLIST entry
unused.

The pre-change live checker capture
`scratch/NVA-B-REFERENCE-RETIRED-ALLOWANCE-1/reference-paths-before-red.json`
records exit code 2 and its sole finding: the unused entry must be removed.

This change removes that obsolete entry only. It closes the integration
obligation missed by the earlier cleanup; it does not add a product path or
relax reference-path scanning.
