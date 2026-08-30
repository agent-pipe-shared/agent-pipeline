# Documentation map

Start with the top-level [README](../README.md) for the product model and
[SETUP](../SETUP.md) for installation or adoption.

`0.6.0` is a local release candidate, not a published release. Phoenix is the
integrated delivery-governance foundation; Nova is the active execution and
adoption stream. The candidate includes a tested public Greenfield Driver for
Claude, Codex, and Antigravity, but does not claim that every Nova B item or
every host-specific assurance is complete. Read [What's new in
0.6.0](whats-new-0.6.0.md) first for the precise scope and non-claims.

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
- [`whats-new-0.6.0.md`](whats-new-0.6.0.md) — candidate-level product scope,
  release boundary, and non-claims.
- [`operating-model.md`](operating-model.md) — normative roles, lifecycle,
  review, evidence, and human authority.
- [`codex-onboarding-threat-model.md`](codex-onboarding-threat-model.md) —
  trust boundaries and residual risks for the Codex lifecycle V4.
- [`phoenix-governance-threat-model.md`](phoenix-governance-threat-model.md) —
  governance and external-action threat model.
- [`nova-execution-plane-threat-model.md`](nova-execution-plane-threat-model.md)
  — execution-plane scope, evidence, and intentionally excluded claims.

## Operations and reference

- [`observation-intake.md`](observation-intake.md) — public observation intake,
  privacy routing, triage, and backlog-link governance.
- [`github-issue-operations.md`](github-issue-operations.md) — project-scoped
  GitHub login, issue operations, and safety boundaries.
- [`design/README.md`](design/README.md) — optional design pre-stage.
- [`deploy/README.md`](deploy/README.md) — optional release/promotion adapter.
- [`adr/`](adr/) — durable decisions and rationale.
