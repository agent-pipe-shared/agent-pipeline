---
type: Governed Module
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
  - plugins/pipeline-core/scripts/generate-architecture-overview.mjs
  - plugins/pipeline-core/scripts/architecture-remedy.mjs
  - plugins/pipeline-core/scripts/architecture-fitness.mjs
  - plugins/pipeline-core/scripts/architecture-adoption.mjs
  - plugins/pipeline-core/scripts/finish-feature.mjs
  - plugins/pipeline-core/lib/execution-plane-contract.mjs
  - plugins/pipeline-core/scripts/execution-plane-launch.mjs
  - plugins/pipeline-core/lib/critic-course-admission.mjs
  - plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs
  - plugins/pipeline-core/scripts/session-critic-finalizer.mjs
allowedDependencies:
  - schemas
authorityEffects:
  - read-write-workspace
  - execute-node-scripts
verificationEntryPoints:
  - plugins/pipeline-core/scripts/module-inventory.test.mjs
  - plugins/pipeline-core/scripts/architecture-remedy.test.mjs
  - plugins/pipeline-core/scripts/architecture-fitness.test.mjs
  - plugins/pipeline-core/scripts/architecture-adoption.test.mjs
  - plugins/pipeline-core/scripts/finish-feature.test.mjs
  - plugins/pipeline-core/lib/execution-plane-contract-real.test.mjs
  - plugins/pipeline-core/scripts/execution-plane-launch.test.mjs
  - plugins/pipeline-core/lib/critic-course-admission.test.mjs
  - plugins/pipeline-core/scripts/critic-dispatch-preflight.test.mjs
  - plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs
adrReferences:
  - ADR-0062
  - ADR-0063
  - ADR-0099
---

# Module: pipeline-core

## Declared module dependencies
- [schemas](schemas.md): Runtime contracts and receipts are validated against canonical schemas.

## Responsibility
Core agent pipeline engine, hooks, lifecycle management, guards, and CLI scripts.

## Public Contracts
- `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`: Runtime bootstrap and preflight inspection.
- `plugins/pipeline-core/scripts/module-inventory.mjs`: Architecture map bundle loading, validation, and module resolution.
- `plugins/pipeline-core/scripts/generate-architecture-overview.mjs`: Offline, deterministic HTML overview generated from the governed map; its default check detects stale output, and `--write` refreshes it for the consuming repository.
- `plugins/pipeline-core/scripts/architecture-remedy.mjs`: Architecture finding analysis and conformant remedy generation.
- `plugins/pipeline-core/scripts/architecture-fitness.mjs`: Architecture fitness evaluator and baseline ratchet store.
- `plugins/pipeline-core/scripts/architecture-adoption.mjs`: Architecture adoption demand, proposal generator, and state management.
- `plugins/pipeline-core/scripts/finish-feature.mjs`: Explicit feature-close driver over the durable coordinator; interrupted runs require an exact lifecycle ID to resume and never imply release authorization.
- `plugins/pipeline-core/lib/execution-plane-contract.mjs`: Preserves `succeeded-unverified` after a real worker return; a separate exact-result, exact-output verifier receipt is required before a state can become `verified`.
- `plugins/pipeline-core/scripts/execution-plane-launch.mjs`: Runs the bounded real-child fixture path; host readback of workspace bytes and the supervisor change manifest supplies the success verifier evidence before scheduling completion.
- `plugins/pipeline-core/lib/critic-course-admission.mjs`: Derives the Critic review round and correction budget from registered, immutable candidate evidence and the exact Git range; caller-supplied counters cannot grant admission.
- `plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs`: Reads the candidate's retained Critic course before a new review is launched and rejects stale parents or exhausted courses.
- `plugins/pipeline-core/scripts/session-critic-finalizer.mjs`: Admits and persists an exact claimed Critic packet before a fresh session starts, then finalizes only that existing admission after a validated return.

## Verification
- `node --test plugins/pipeline-core/scripts/module-inventory.test.mjs`
- `node --test plugins/pipeline-core/scripts/architecture-remedy.test.mjs`
- `node --test plugins/pipeline-core/scripts/architecture-fitness.test.mjs`
- `node --test plugins/pipeline-core/scripts/architecture-adoption.test.mjs`
- `node plugins/pipeline-core/scripts/finish-feature.test.mjs`
- `node plugins/pipeline-core/lib/execution-plane-contract-real.test.mjs`
- `node plugins/pipeline-core/scripts/execution-plane-launch.test.mjs`
- `node --test plugins/pipeline-core/lib/critic-course-admission.test.mjs`
- `node --test plugins/pipeline-core/scripts/critic-dispatch-preflight.test.mjs`
- `node --test plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs`
