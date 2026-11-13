# ADR-0045 — Canonical artifact topology

**Status:** accepted · **Date:** 2026-07-24 · **Amended:** 2026-08-18, 2026-11-13

**Governs:** specs/**

## Decision

Durable rigor-1/2 feature authority is expressed by a stable package rooted at
`specs/<safe-feature-id>/`: `prd_<topic>.md`, `spec.md`, `acceptance.md`,
`result.md`, `lifecycle.json`, `plans/`, `design/`, and `evidence/`. The PRD
filename carries a topic suffix (matching the bootstrap skill's shipped
`prd_short-topic.md` convention) rather than the bare `prd.md` this decision
originally named — amended 2026-08-18 to match the convention every package
actually uses, in both this repository and its sibling Nova checkout. This
enumeration is the required core, not an exhaustive closed set — amended
2026-08-18 to state explicitly what practice already does in both checkouts:
a package root MAY carry further session- or feature-appropriate artifacts
beyond it (e.g. a recovery note, a phase plan, a point-in-time spec revision
snapshot), and their presence is not a topology violation. Paths make the
CORE package membership discoverable; they do not bound the full root
contents. The closed lifecycle manifest records authority, state, candidate
and retention bindings. A phase change moves an artifact only when its
retention class requires it; Result and candidate evidence retain a stable
path to avoid reference and digest churn.

The lifecycle states are `draft`, `awaiting-approval`, `approved`,
`implementing`, `verifying`, `completed`, `superseded`, `abandoned`, and
`retained`. `completed` requires the candidate delivery/readback binding; it
does not mean merely locally verified. Historical authority is never deleted
as an implicit transition cleanup.

**Amendment 2026-11-13 (PO tile, candidate 28e):** the approved PRD and Spec
stay where the PO approved them. When a feature's id changed after its design
(its PRD and Spec were written in an earlier folder), the package carries those
two artifacts at the approved path, bound by digest like every entry, instead of
refusing the registration and with it every dispatch after the approval. The
exception is closed: only the `prd` and `spec` classes, only inside `specs/`,
never in a folder that is itself another feature's package (one holding a
`lifecycle.json`); acceptance, result, plans, design and evidence stay under
`specs/<safe-feature-id>/`. `present-plan` refuses a PRD or Spec the package
could not carry (`DAB-PACKAGE-PATH`) before a signature can be asked for.

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
