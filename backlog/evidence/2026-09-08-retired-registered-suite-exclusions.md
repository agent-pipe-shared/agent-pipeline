# Retired registered-suite exclusions — 8 September 2026

The live `EXCLUSIONS` table in `harness/scripts/check-verify-suite-registration.mjs`
is empty. Seven scheduling exclusions expired on 2026-09-07 and were retired
because their files were already registered in `harness/scripts/verify.mjs`.

The preserved pre-change registration-suite capture is
`scratch/NVA-B-EXPIRED-REGISTERED-EXCLUSIONS-1/registration-baseline-red.json`.
It records seven `EXPIRED-EXCLUSION` findings, zero unregistered files, zero
honoured exclusions, and no malformed exclusions.

The retired paths are:

- `harness/scripts/check-adr-consistency.test.mjs`
- `harness/scripts/check-critic-contract-citations.test.mjs`
- `harness/scripts/check-doc-reconciliation.test.mjs`
- `harness/scripts/print-verify-failures.test.mjs`
- `plugins/pipeline-core/hooks/guard-push-release-tag-ancestry.test.mjs`
- `plugins/pipeline-core/scripts/check-critic-skip-coverage.test.mjs`
- `plugins/pipeline-core/scripts/measure-tofu-push-e2e.test.mjs`

The membership regression in `check-verify-suite-registration.test.mjs` pins
the empty table and verifies that each listed path has exactly one actual Verify
registration. QG-06 expiry enforcement remains non-vacuous through its
nonempty controlled exclusion fixture.

`harness/scripts/verify.mjs` was not modified: its SHA-256 is
`fd91e948b444031ad51c52bb96731dc0fd0a5625f5dd3f088550cef26734bc77`
both before and after this retirement. The frozen full-gate receipt
`evidence/verify-1788844434239-28f4021290f9de3d.json` records exit code 0 for
the seven corresponding Verify steps. Final local evidence is captured in
`scratch/NVA-B-EXPIRED-REGISTERED-EXCLUSIONS-1/registration-suite-green.json`
(37 checks), `registration-check-green.json` (515 registrations, no
exclusions or unregistered suites), and `consumer-safe-paths-green.json`.
