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
  - backlog/ledger.csv
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
- `backlog/ledger.csv`: Sprint backlog items ledger.
- `backlog/items/**`: Detailed specification and audit files for backlog tasks.

## Verification
- `node plugins/pipeline-core/scripts/check-backlog-state.mjs`
