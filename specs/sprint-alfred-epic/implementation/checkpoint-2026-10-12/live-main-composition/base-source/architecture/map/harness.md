---
type: Governed Module
id: harness
responsibility: Verification runner, test orchestration, suite registration validation, and CI checks.
nonResponsibilities:
  - Plugin runtime hooks
  - Schema definitions
  - Product capability business logic
ownedPaths:
  - harness/**
publicContracts:
  - harness/scripts/verify.mjs
  - harness/scripts/check-verify-suite-registration.mjs
  - harness/scripts/check-verify-suite-append.mjs
  - harness/scripts/verify-case-completion-augmentation.mjs
  - harness/config/verify-case-completion-augmentations.v1.json
  - harness/verify-suites.json
allowedDependencies:
  - pipeline-core
  - schemas
authorityEffects:
  - execute-verify-suites
  - read-workspace-test-tree
verificationEntryPoints:
  - harness/scripts/check-verify-suite-registration.mjs
  - harness/scripts/check-verify-suite-append.mjs
  - harness/scripts/doc-reader-terminal-binding.test.mjs
adrReferences:
  - ADR-0063
---

# Module: harness

## Declared module dependencies
- [pipeline-core](pipeline-core.md): The harness runs checks against the plugin's public verification contracts.
- [schemas](schemas.md): The harness validates evidence against canonical schemas.

## Responsibility
Verification runner, test orchestration, suite registration validation, and CI checks.

## Public Contracts
- `harness/scripts/verify.mjs`: Main test suite verification runner. It includes the staged private-identifier scanner's focused regression suite in the required local candidate checks.
- `harness/scripts/check-verify-suite-registration.mjs`: Static and declarative suite registration completeness checker.
- `harness/scripts/check-verify-suite-append.mjs`: TP-13-era Git history and pending-postimage append-only check for the declarative registry.
- `harness/verify-suites.json`: Declarative suite registry.
- `harness/scripts/verify-case-completion-augmentation.mjs`: Canonical physical and Git-candidate loader for closed supplementary completion policies. It fills only absent policy on an exact existing suite name and file, preserving prior registration rows and rejecting conflicts or unknown targets.
- `harness/config/verify-case-completion-augmentations.v1.json`: Closed named-policy table consumed by the canonical loader. Declaration and disposition coverage remains checked by the real FD completion protocol.

## Verification
- `node harness/scripts/check-verify-suite-registration.mjs`
- `node harness/scripts/check-verify-suite-append.mjs`

## Alfred governance and lifecycle registration

Enrollment retirement registers three additional required suites through an
append-only registry proposal. Each policy names the complete stable case set
and binds a 131072-byte completion budget. The existing onboarding runtime suite
now declares all 24 callbacks as COR001–COR024 with a 65536-byte completion
budget. Its policy belongs to the existing builtin Verify row, and the existing
completion entry is required. Protected registration proposals remain distinct
from Source delivery and full verification.

Verify registers the Alfred governance, lifecycle, design advisory, topology and retirement suites once. Required completion policies bind individually registered case IDs; declarative additions preserve every earlier registry entry. Static fixture evidence does not qualify native runner execution.

## Scanner diagnostics verification

The additive declarative `security-scanner-diagnostics-tests` suite uses genuine
per-case completion. Its final producer-supplied stable case policy is required
and assigned once to deterministic-verification. Existing rows, policies and
coverage remain intact. Declarative consumption already occurs through the shared
closed loader; no builtin Verify mutation, exemption or new runner duty is needed.
Prepared graph receipts do not establish actual Source or whole Verify acceptance.
