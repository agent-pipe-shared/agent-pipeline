# ADR-0046 — Project authority layering

**Status:** accepted · **Date:** 2026-07-24

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
