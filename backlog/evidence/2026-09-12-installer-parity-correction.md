# Installed-plugin attestation parity correction

Date: 2026-09-12

This correction addresses the first substantive Critic round without claiming
native Codex sandbox or App-Server readiness under WSL.

## Corrected boundaries

- Claude's directory marketplace is treated as a gitless distribution copy,
  never as the clean Git provenance source. The registry binds the one enabled
  local plugin and its exact loaded cache path; an explicit source checkout
  supplies provenance and complete source/cache equivalence to the host receipt
  writer.
- A legacy Claude copy with no source locator remains
  `plugin-attestation-required` with `nextAction: null`. The documented host
  command must be run from the clean checkout; bootstrap does not guess or
  reconstruct that path.
- Every gitless Antigravity plugin root is now inside the hard attestation gate,
  including when its path registry is missing, duplicated, malformed, or points
  elsewhere. Those states return `plugin-attestation-required` with
  `nextAction: null`; only one exact binding may reach receipt verification.

The focused host fixture models three distinct trees for Claude: a clean Git
checkout, a gitless directory marketplace copy, and the loaded cache. It proves
that the legacy bootstrap is closed, a source-free host request is rejected,
the gitless marketplace copy is rejected when supplied as source, the explicit
clean-source operation writes the receipt, and renewed bootstrap is ready. The
same case proves Antigravity's missing, duplicate, and mismatched
registries stay closed even after a valid receipt exists.

## Focused verification

- `node plugins/pipeline-core/scripts/installed-plugin-attestation-host.test.mjs`
  — 7/7 passed.
- `node --test plugins/pipeline-core/lib/public-core-observation.test.mjs plugins/pipeline-core/lib/installed-plugin-attestation.test.mjs`
  — 2/2 suite files passed.
- `node plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs`
  — 55/55 passed in the host-side run required by its nested Git fixtures.
- `node harness/scripts/check-doc-contracts.mjs` — passed.
- `git diff --check` — passed.

Candidate/tree-bound final evidence remains the Coordinator's responsibility
after the correction bundle is frozen.
