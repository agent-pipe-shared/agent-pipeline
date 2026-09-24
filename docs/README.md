# Documentation map

The canonical reader path is the top-level [README](../README.md),
[`SETUP.md`](../SETUP.md), [`PIPELINE_FLOW.md`](../PIPELINE_FLOW.md), and then
[`usage.md`](usage.md). Use the rest of this map as
reference; `overview.md` is a short companion, not a competing front door.

**Command convention:** In user-repository examples, `<plugin-root>` is the
installed directory of the approved GitHub-distributed `pipeline-core` plugin.
Run commands from the governed repository unless the example says otherwise.
It never means a maintainer checkout.

**Audience rule:** This map, Setup, Usage, the flow, enforcement, evidence,
security, cost, onboarding, and operation pages describe what an application
repository does with the installed plugin. Source-maintainer procedures are
explicitly labelled and isolated in the maintainer sections, local-development
guides, release records, architecture decision records, and state archives.
Those durable records retain their original repository/commit context as
evidence; they are not copy-and-run instructions for a consumer project.

## Adoption

- [`../SETUP.md`](../SETUP.md) — routine consumer adoption, prerequisites, and
  later source-maintainer reference.
- [`../PIPELINE_FLOW.md`](../PIPELINE_FLOW.md) — route selection, gates,
  recovery, and close. [Deutsche Lesefassung](../PIPELINE_FLOW.de.md).
- [`usage.md`](usage.md) — the normal user journey after a project is ready.
- [`usage.md#assess-architecture-adoption-in-an-existing-project`](usage.md#assess-architecture-adoption-in-an-existing-project)
  — read-only status and proposal before an existing project adopts the
  architecture controls.
- [`v3-consumer-onboarding.md`](v3-consumer-onboarding.md) — detailed
  preview-first migration and the Codex lifecycle V4.
- [`onboarding-recovery.md`](onboarding-recovery.md) — exceptional, explicitly
  returned recovery paths after a typed onboarding or migration failure; not
  a routine first-install checklist.
- [`runtime-boundary.md`](runtime-boundary.md) and
  [`runner-support.md`](runner-support.md) — what is shared methodology and
  what the installed runner can actually enforce.

## Enforcement, evidence, security, and measurement

- [`enforcement.md`](enforcement.md) — configured guard and lifecycle
  enforcement, including runner limits.
- [`audit-and-evidence.md`](audit-and-evidence.md) — candidate-bound receipts
  and offline evidence viewing; artifacts are not compliance
  certification or authority.
- [`security-controls.md`](security-controls.md) — scanner/control boundaries,
  framework mappings, waivers, and runtime limits.
- [`cost-and-measurement.md`](cost-and-measurement.md) — measurement boundary,
  historical Verify observations, and the explicit missing consumer-overhead
  comparison; not a cost estimate.
- [`parallel-work.md`](parallel-work.md) — bounded parallel delivery and
  integration boundaries.

## Product and governance reference

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
- [`po-human-approval.md`](po-human-approval.md) — the one-time external-key
  setup and the bounded human signing commands; agent-side preparation remains
  agent work.
- [`human-authorization-inventory.md`](human-authorization-inventory.md) —
  reference inventory of every Pipeline authority mechanism and its limits.
- [`design/README.md`](design/README.md) — optional design pre-stage.
- [`deploy/README.md`](deploy/README.md) — optional release/promotion adapter.
- [`adr/`](adr/) — durable decisions and rationale.
