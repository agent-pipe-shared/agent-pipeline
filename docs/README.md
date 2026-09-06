# Documentation map

Start with the top-level [README](../README.md) for the product model and
[SETUP](../SETUP.md) for installation or adoption.

`0.6.2` is the current release. Phoenix is the integrated
delivery-governance foundation; Nova is the active execution and adoption
stream. The released scope includes a tested public Greenfield Driver for
Claude, Codex, and Antigravity, but does not claim that every Nova B item or
every host-specific assurance is complete. See [What's new in
0.6.0](whats-new-0.6.0.md) for what changed in that earlier release.

## User journey

- [`../SETUP.md`](../SETUP.md) — installation, V3 activation, and per-repository
  adoption.
- [`usage.md`](usage.md) — start, Greenfield Driver, delivery after readiness,
  and normal human decision points.
- [`../PIPELINE_FLOW.md`](../PIPELINE_FLOW.md) — end-to-end V3 flow, recovery
  boundaries, and gates.
- [`v3-consumer-onboarding.md`](v3-consumer-onboarding.md) — detailed
  preview-first V3 migration and the Codex lifecycle V4.
- [`runtime-boundary.md`](runtime-boundary.md) — methodology shared across
  runners versus runner-specific enforcement and assurance.

## Product and governance

- [`overview.md`](overview.md) — the integrated Phoenix foundation and the
  active Nova product stream.
- [`whats-new-0.6.0.md`](whats-new-0.6.0.md) — what was new in the `0.6.0`
  release: product scope, release boundary, and non-claims at that time.
- [`operating-model.md`](operating-model.md) — normative roles, lifecycle,
  review, evidence, and human authority.
- [`codex-onboarding-threat-model.md`](codex-onboarding-threat-model.md) —
  trust boundaries and residual risks for the Codex lifecycle V4.
- [`phoenix-governance-threat-model.md`](phoenix-governance-threat-model.md) —
  governance and external-action threat model.
- [`nova-execution-plane-threat-model.md`](nova-execution-plane-threat-model.md)
  — execution-plane scope, evidence, and intentionally excluded claims.
- [`change-control.md`](change-control.md) — promotion gate that reconciles
  Pipeline human authority with an authenticated external change receipt.
- [`organization-policy-packs.md`](organization-policy-packs.md) — governance
  floors and document-publication rules an organization pack can add on top of
  the Pipeline's own authority, without creating a second authority system.

## Governance and audit evidence

- [`audit-bundles.md`](audit-bundles.md) — create-only, offline-verifiable
  copy of one completed Feature Package's validated artifacts; evidence, not
  a compliance claim.
- [`evidence-viewer.md`](evidence-viewer.md) — static, offline HTML
  projection of one governed Feature Package for reading, not for granting or
  changing authority.
- [`agent-decision-journal.md`](agent-decision-journal.md) — canonical record
  of material, closed agent observations (assumptions, selections,
  verification scope); cannot grant, consume, revoke, or replace human
  authority.
- [`governance-replay.md`](governance-replay.md) — read-only local
  reconstruction of the canonical lifecycle event stream into per-dispatch
  timelines; non-authoritative.
- [`governance-event-export.md`](governance-event-export.md) — one-way,
  non-authoritative projection of governance events to an external
  destination under an explicit, field-limited policy.
- [`external-traceability.md`](external-traceability.md) — provider-neutral,
  sanitized references binding a Pipeline artifact to an external system
  object, with credentials and coordinates kept out of the reference.

## Operations and reference

- [`observation-intake.md`](observation-intake.md) — public observation intake,
  privacy routing, triage, and backlog-link governance.
- [`github-issue-operations.md`](github-issue-operations.md) — project-scoped
  GitHub login, issue operations, and safety boundaries.
- [`design/README.md`](design/README.md) — optional design pre-stage.
- [`deploy/README.md`](deploy/README.md) — optional release/promotion adapter.
- [`adr/`](adr/) — durable decisions and rationale.
