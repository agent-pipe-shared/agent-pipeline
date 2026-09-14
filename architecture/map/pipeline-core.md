---
id: pipeline-core
responsibility: Core agent pipeline engine, hooks, lifecycle management, guards, and CLI scripts.
nonResponsibilities:
  - Test harness orchestration outside plugins
  - Root schemas store
  - Sprint backlog ledger tracking
ownedPaths:
  - plugins/pipeline-core/**
publicContracts:
  - plugins/pipeline-core/scripts/pipeline-start-preflight.mjs
  - plugins/pipeline-core/scripts/module-inventory.mjs
  - plugins/pipeline-core/scripts/architecture-remedy.mjs
  - plugins/pipeline-core/scripts/architecture-fitness.mjs
allowedDependencies:
  - schemas
authorityEffects:
  - read-write-workspace
  - execute-node-scripts
verificationEntryPoints:
  - plugins/pipeline-core/scripts/module-inventory.test.mjs
  - plugins/pipeline-core/scripts/architecture-remedy.test.mjs
  - plugins/pipeline-core/scripts/architecture-fitness.test.mjs
adrReferences:
  - ADR-0063
  - ADR-0099
---

# Module: pipeline-core

## Responsibility
Core agent pipeline engine, hooks, lifecycle management, guards, and CLI scripts.

## Public Contracts
- `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`: Runtime bootstrap and preflight inspection.
- `plugins/pipeline-core/scripts/module-inventory.mjs`: Architecture map bundle loading, validation, and module resolution.
- `plugins/pipeline-core/scripts/architecture-remedy.mjs`: Architecture finding analysis and conformant remedy generation.
- `plugins/pipeline-core/scripts/architecture-fitness.mjs`: Architecture fitness evaluator and baseline ratchet store.

## Verification
- `node --test plugins/pipeline-core/scripts/module-inventory.test.mjs`
- `node --test plugins/pipeline-core/scripts/architecture-remedy.test.mjs`
- `node --test plugins/pipeline-core/scripts/architecture-fitness.test.mjs`
