# ADR-0046 — Project authority layering

**Status:** accepted · **Date:** 2026-07-24

**Governs:** pipeline.user.yaml, templates/CLAUDE.project.md, templates/pipeline.json.example, plugins/pipeline-core/lib/project-authority.mjs, plugins/pipeline-core/lib/project-authority.test.mjs, plugins/pipeline-core/scripts/project-authority-migration.mjs, plugins/pipeline-core/scripts/project-authority-migration.test.mjs, plugins/pipeline-core/lib/project-onboarding-v3.mjs, plugins/pipeline-core/lib/project-onboarding-v3.test.mjs, plugins/pipeline-core/lib/runner-profile-migration-v3.mjs, plugins/pipeline-core/lib/runner-profile-migration-v3.test.mjs, plugins/pipeline-core/lib/runtime-projection-v3.mjs, plugins/pipeline-core/lib/runtime-projection-v3.test.mjs, plugins/pipeline-core/scripts/pipeline-user-v3.schema.json, plugins/pipeline-core/lib/manifest.mjs, plugins/pipeline-core/scripts/pipeline-manifest.schema.json, plugins/pipeline-core/scripts/v3-bootstrap-authority.mjs, plugins/pipeline-core/scripts/pipeline-state.mjs, plugins/pipeline-core/scripts/pipeline-state.test.mjs, plugins/pipeline-core/hooks/post-compact-reground.mjs, plugins/pipeline-core/hooks/guard-devplan.mjs, plugins/pipeline-core/hooks/guard-devplan.test.mjs, plugins/pipeline-core/hooks/guard-push.mjs, plugins/pipeline-core/hooks/guard-push.test.mjs

## Decision

Public Core contains portable code, schemas, routing registries, migration
logic, fixtures and neutral templates only. Private user defaults stay in the
sealed, admitted private overlay. A new collision-audited runner-neutral
project authority layer owns project gates, autonomy and lifecycle state.
`.claude/**` and `.codex/**` are generated runner projections, never a second
portable authority.

The project layer will dual-read the legacy `.claude` authority during the
documented compatibility window and write only the neutral layer after an
explicit, recoverable migration. The migration preserves project calibration,
redacts plans to paths/digests/ownership metadata, keeps lock and registry
updates source-last, and has rollback/recovery semantics. A development Public
Core checkout is distinct from a stable consumer binding; development cannot
silently replace that binding.

## Boundary

`.agent-pipeline/` remains sealed to the authenticated core lock and admitted
private extension classes. It is not the generic project-state namespace.
Machine-local state, credentials, caches and host settings remain outside the
portable repository.
