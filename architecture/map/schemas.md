---
type: Governed Module
id: schemas
responsibility: Canonical JSON schemas defining contracts, profiles, state, and receipts.
nonResponsibilities:
  - Execution logic
  - Dynamic state persistence
  - Test runner logic
ownedPaths:
  - schemas/**
publicContracts:
  - schemas/pipeline.security-scanner-diagnostics.v1.json
  - schemas/pipeline.architecture-profile.v1.json
  - schemas/pipeline.module-inventory.v1.json
  - schemas/pipeline.module-interaction-receipt.v1.json
  - schemas/pipeline.architecture-decision.v1.json
  - schemas/pipeline.architecture-decision.v2.json
  - schemas/pipeline.fitness-evidence.v1.json
  - schemas/pipeline.architecture-baseline.v1.json
  - schemas/pipeline.adoption-state.v1.json
  - schemas/pipeline.adoption-proposal.v1.json
  - schemas/pipeline.design-readiness-receipt.v1.json
  - schemas/pipeline.design-workflow-package.v1.json
allowedDependencies: []
authorityEffects:
  - schema-validation-contract
verificationEntryPoints:
  - plugins/pipeline-core/lib/security-scanner-diagnostics.test.mjs
  - plugins/pipeline-core/scripts/module-inventory.test.mjs
  - plugins/pipeline-core/lib/design-workflow-package.test.mjs
adrReferences:
  - ADR-0063
  - ADR-0099
---

# Module: schemas

## Responsibility
Canonical JSON schemas defining contracts, profiles, state, and receipts.

## Public Contracts
- `schemas/pipeline.architecture-profile.v1.json`: Profile schema for agent-first architecture properties.
- `schemas/pipeline.module-inventory.v1.json`: Governed module inventory row schema.
- `schemas/pipeline.module-interaction-receipt.v1.json`: Module interaction receipt schema.
- `schemas/pipeline.architecture-decision.v1.json`: Architecture decision record schema.
- `schemas/pipeline.architecture-decision.v2.json`: Explicit, sorted OKF-module applicability for newly governed module-scoped ADR sidecars; it does not reinterpret historical v1 records.
- `schemas/pipeline.fitness-evidence.v1.json`: Fitness evaluation evidence schema.
- `schemas/pipeline.architecture-baseline.v1.json`: Architecture baseline and ratchet store schema.
- `schemas/pipeline.adoption-state.v1.json`: Architecture adoption state schema.
- `schemas/pipeline.adoption-proposal.v1.json`: Architecture staged adoption proposal schema.
- `schemas/pipeline.design-readiness-receipt.v1.json`: Fresh, read-only comparison of the initial input, PRD, Spec, revised design and traceability mapping; never approval or implementation authority.
- `schemas/pipeline.design-workflow-package.v1.json`: Closed digest-bound Advisor, readiness and proposed-exception package for one final PO decision; not itself approval or implementation authority.

## Verification
- `node --test plugins/pipeline-core/scripts/module-inventory.test.mjs`
- `node plugins/pipeline-core/lib/architecture-effective-decisions.test.mjs`
- `node --test plugins/pipeline-core/lib/design-workflow-package.test.mjs`

## Scanner diagnostics contract

`pipeline.security-scanner-diagnostics.v1` is a closed diagnostic-only sidecar.
It is separate from security evidence/verdict v1/v2 and binds the existing
evidence payload/candidate. Its prepared strict EOF regex refinement has its own
digest; the approved original schema is preserved. Duplicate-key, UTF-8, byte,
privacy, binding and safe publication checks remain mandatory beyond JSON Schema.
An exact plugin-local mirror at
`plugins/pipeline-core/schemas/pipeline.security-scanner-diagnostics.v1.json`
ships the same public contract in installed plugin bundles. The runtime helper
carries an inline closed validator; this is a packaging mirror, not a claimed
JSON-resource import edge or universal root-schema parity rule.
