# ADR-0045 — Canonical artifact topology

**Status:** accepted · **Date:** 2026-07-24

## Decision

Durable rigor-1/2 feature authority is expressed by a stable package rooted at
`specs/<safe-feature-id>/`: `prd.md`, `spec.md`, `acceptance.md`, `result.md`,
`lifecycle.json`, `plans/`, `design/`, and `evidence/`. Paths make package
membership discoverable; the closed lifecycle manifest records authority,
state, candidate and retention bindings. A phase change moves an artifact only
when its retention class requires it; Result and candidate evidence retain a
stable path to avoid reference and digest churn.

The lifecycle states are `draft`, `awaiting-approval`, `approved`,
`implementing`, `verifying`, `completed`, `superseded`, `abandoned`, and
`retained`. `completed` requires the candidate delivery/readback binding; it
does not mean merely locally verified. Historical authority is never deleted
as an implicit transition cleanup.

`docs/adr/`, `backlog/`, release manifests/evidence, handover/state, retention
manifests and security/supply-chain extension artifacts retain dedicated
classes. Private or machine-local material has no portable topology path.

## Migration

The initial mode is compatibility inventory: it classifies legacy paths without
inventing status, approval, provenance, or evidence. A migration first emits a
deterministic preview; relocating tracked authority requires explicit lifecycle
approval, a recoverable journal, and post-write validation. Existing
`artifactLifecycle.v1` Results remain valid and are the source for transition
binding; this decision does not widen their closed schema.
