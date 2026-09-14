---
id: backlog
responsibility: Sprint backlog items, evidence records, interruption baseline, and ledger history.
nonResponsibilities:
  - Runtime code
  - Execution hooks
  - Test harness scripts
ownedPaths:
  - backlog/**
publicContracts:
  - backlog/transitions.ndjson
  - backlog/items/**
allowedDependencies: []
authorityEffects:
  - audit-trail-retention
verificationEntryPoints:
  - plugins/pipeline-core/scripts/check-backlog-state.mjs
adrReferences:
  - ADR-0063
---

# Module: backlog

## Responsibility
Sprint backlog items, evidence records, interruption baseline, and ledger history.

## Public Contracts
- `backlog/transitions.ndjson`: Sprint backlog transitions ledger.
- `backlog/items/**`: Detailed specification and audit files for backlog tasks.

## Verification
- `node plugins/pipeline-core/scripts/check-backlog-state.mjs`
