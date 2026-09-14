---
id: schemas
responsibility: Canonical JSON schemas defining contracts, profiles, state, and receipts.
nonResponsibilities:
  - Execution logic
  - Dynamic state persistence
  - Test runner logic
ownedPaths:
  - schemas/**
publicContracts:
  - schemas/pipeline.architecture-profile.v1.json
  - schemas/pipeline.module-inventory.v1.json
  - schemas/pipeline.module-interaction-receipt.v1.json
  - schemas/pipeline.architecture-decision.v1.json
  - schemas/pipeline.fitness-evidence.v1.json
  - schemas/pipeline.architecture-baseline.v1.json
allowedDependencies: []
authorityEffects:
  - schema-validation-contract
verificationEntryPoints:
  - plugins/pipeline-core/scripts/module-inventory.test.mjs
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
- `schemas/pipeline.fitness-evidence.v1.json`: Fitness evaluation evidence schema.
- `schemas/pipeline.architecture-baseline.v1.json`: Architecture baseline and ratchet store schema.

## Verification
- `node --test plugins/pipeline-core/scripts/module-inventory.test.mjs`
