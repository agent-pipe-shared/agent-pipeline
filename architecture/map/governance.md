---
type: Governed Module
id: governance
responsibility: Canonical operating rules, agent roles, and guardrails for this repository.
nonResponsibilities:
  - Plugin runtime enforcement
  - Verify harness execution
  - JSON schema ownership
  - User-facing setup and cost guidance
  - ADR storage and decision approval
ownedPaths:
  - docs/operating-model.md
  - policies/**
  - roles/**
  - guardrails/**
publicContracts:
  - docs/operating-model.md
  - policies/model-policy.md
  - roles/elephant.md
  - roles/goldfish.md
  - guardrails/token-budget.md
allowedDependencies: []
authorityEffects:
  - define-process-rules
verificationEntryPoints:
  - plugins/pipeline-core/scripts/module-inventory.test.mjs
adrReferences:
  - ADR-0009
---

# Module: governance

## Responsibility

This module owns the repository's canonical human-readable operating rules,
role descriptions, policies, and guardrails. Runtime hooks and scripts may
consume those rules, but this map does not claim that prose alone enforces
them. The implementation of enforcement belongs to `pipeline-core`; Verify
orchestration belongs to `harness`.

## Public contracts

- `docs/operating-model.md`: lifecycle and working-method contract.
- `policies/model-policy.md`: model-choice and route policy.
- `roles/elephant.md` and `roles/goldfish.md`: agent responsibilities.
- `guardrails/token-budget.md`: budget and stop conditions.

## Navigation and verification

Read only the policy or role files relevant to the touched task. Check module
ownership with `node plugins/pipeline-core/scripts/module-inventory.mjs` and
the generated overview with
`node plugins/pipeline-core/scripts/generate-architecture-overview.mjs --check`.
An ADR reference here is a navigation pointer; effective applicability still
requires an independently valid decision record for this module.
