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
- `harness/scripts/verify.mjs`: Main test suite verification runner.
- `harness/scripts/check-verify-suite-registration.mjs`: Static and declarative suite registration completeness checker.
- `harness/scripts/check-verify-suite-append.mjs`: TP-13-era Git history and pending-postimage append-only check for the declarative registry.
- `harness/verify-suites.json`: Declarative suite registry.

## Verification
- `node harness/scripts/check-verify-suite-registration.mjs`
- `node harness/scripts/check-verify-suite-append.mjs`
