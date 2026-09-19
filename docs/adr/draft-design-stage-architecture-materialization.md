# ADR: Explicit design-stage architecture materialization

Status: Proposed

Date: 2026-09-19

## Context

The normal bootstrap can observe a greenfield scaffold or a Brownfield
adoption requirement without making bootstrap itself non-ready.  The later
implementation transition, however, needs more than an `AGENTS.md` pointer or
an adoption decision: it needs a physical navigation map, fitness model,
baseline, a PO-bound adoption disposition, and a plan that declares its
implementation surface.

Treating a generated scaffold as an adopted architecture would make the
control meaningless.  Conversely, a generic writer cannot safely invent a
repository's modules, contracts, ownership boundaries, verification entry
points, or accepted architecture debt.

## Decision

Architecture is explicitly materialized during design from governed project
input.  The design package must record bounded module responsibilities,
ownership, public contracts, the implementation surface, fitness model and
baseline before implementation authority is requested.

Bootstrap remains read-only and surfaces the applicable architecture
orientation.  For an unresolved estate it exposes the staged, read-only
adoption proposal; it never creates a map or makes a PO decision.  A
greenfield scaffold is honestly `design-pending`, not a baseline.

The implementation boundary remains hard.  It admits only a valid physical
map bundle, valid fitness model and baseline, a current scoped PO adoption
disposition, and a plan with a bounded implementation surface.  A failed
transition must return the typed architecture remediation/proposal that
explains which design-stage evidence is absent.  Existing repositories use the
same read-only proposal and then an explicit PO disposition; they are never
silently reclassified as greenfield.

## Consequences

Feature packages must be large enough to carry a meaningful architecture
design before their single implementation transition.  Tests that previously
jumped from approval directly to implementation must materialize real
architecture evidence and a scoped plan surface rather than stubbing
readiness.

This adds deliberate design work, but prevents both false map claims and a
post-approval dead end.  It does not authorize blind map generation, automatic
adoption, or a second normal PO approval beyond the package's final approval.

## Affected Contracts

- `pipeline.start-preflight.v1` architecture orientation
- `pipeline.architecture-adoption-orientation.v1`
- `pipeline.architecture-entry-readiness.v1`
- `pipeline.adoption-proposal.v1`
- `pipeline.architecture-decision.v1`
