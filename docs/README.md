# Documentation map

Start with the top-level [README](../README.md), then follow this map. It is
the canonical order for the next documents; `overview.md` and `usage.md` are
short companion references, not competing front doors.

`0.6.2` names the next release's documented scope. It is not a tag,
installation recommendation, production-availability claim, or proof that a
local candidate has passed release gates.

## Adoption

- [`../SETUP.md`](../SETUP.md) — routine consumer adoption, prerequisites, and
  later source-maintainer reference.
- [`usage.md`](usage.md) — the normal user journey after a project is ready.
- [`../PIPELINE_FLOW.md`](../PIPELINE_FLOW.md) — route selection, gates,
  recovery, and close.
- [`v3-consumer-onboarding.md`](v3-consumer-onboarding.md) — detailed
  preview-first migration and the Codex lifecycle V4.
- [`runtime-boundary.md`](runtime-boundary.md) and
  [`runner-support.md`](runner-support.md) — what is shared methodology and
  what the installed runner can actually enforce.

## Enforcement, evidence, security, and cost

- [`enforcement.md`](enforcement.md) — configured guard and lifecycle
  enforcement, including runner limits.
- [`audit-and-evidence.md`](audit-and-evidence.md) — candidate-bound receipts,
  Audit Bundles, and offline evidence viewing; artifacts are not compliance
  certification or authority.
- [`security-controls.md`](security-controls.md) — scanner/control boundaries,
  framework mappings, waivers, and runtime limits.
- [`cost-and-measurement.md`](cost-and-measurement.md) — historical Verify
  envelopes and the explicit missing consumer-overhead comparison.
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
- [`design/README.md`](design/README.md) — optional design pre-stage.
- [`deploy/README.md`](deploy/README.md) — optional release/promotion adapter.
- [`adr/`](adr/) — durable decisions and rationale.
