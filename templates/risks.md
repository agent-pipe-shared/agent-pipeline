<!--
PROMPT/DOC TEMPLATE: docs/risks.md — deviation-record template for a project's own
central-deploy-policy exceptions (ADR-0034). Language: English (agent-facing
template).
Copy this file to `docs/risks.md` in a project that declares a central
`deploy-policy.yaml` (governance/examples/policies/deploy-policy.yaml is the paired
generic example) and fill records as deviations arise. Delete this header comment and
the "How this file works" section in your own copy if you prefer a leaner file — the
records section below is the part the checker reads.
-->

# Deployment policy deviations

Standardized, checkable exception mechanism for `mandate`-mode central deploy policy
violations (`guardrails/deploy.md` DP-02, ADR-0034). This file stays human-readable
Markdown; each individual deviation RECORD lives inside a fenced ` ```yaml ` block —
deterministic extraction, no Markdown-parser precedent needed. The checker scans this
file for `yaml` fences and parses each block with the pipeline's existing yaml-lite
parser; everything BETWEEN fences (like this prose) is free-form and never parsed.

## How this file works

- **One record per deviation**, each its own fenced `yaml` block.
- **Mandatory fields**, every record:
  - `id` — a stable identifier for this deviation (free-form, but unique in this file).
  - `policy-rule` — the exact central-policy rule category being deviated from
    (`adapters`, `targets`, `gates.promote_prod.type_floor`, etc.) — must match what
    the precedence engine names in its violation message, so the checker can pair
    record to rule.
  - `deviation` — one line: what the project actually does that differs from the
    central floor.
  - `justification` — why this deviation is accepted, in enough detail for a reviewer
    (a Critic, or a later reader) to judge it without re-deriving context.
  - `owner` — the person/team accountable for this deviation while it stands.
  - `expires` — an ISO-8601 date. The record has a due date; it is not a permanent
    exemption.
  - `approved-by` — the PO (or org-equivalent sign-off) who accepted the deviation. An
    agent never self-grants this field.
- **Missing or expired ⇒ absent.** If any mandatory field is missing, or `expires` is
  in the past, the record counts as ABSENT for enforcement purposes — the underlying
  violation blocks again exactly as if no record existed (an exception without an
  owner and an expiry is a finding, not a mitigation).
- Only `mandate` mode reads this file at all. `advisory` mode never blocks regardless;
  `strict` mode ignores deviation records entirely, even valid ones — see ADR-0034 and
  `guardrails/deploy.md` DP-02 for the full precedence rules.

## Records

<!-- One filled example, kept here as a live reference; delete or replace with your
own project's real deviations. See governance/examples/policies/deploy-risks.example.md
for the same shape paired against the generic deploy-policy.yaml example. -->

```yaml
id: DEV-2026-07-11-01
policy-rule: adapters
deviation: "prod environment uses adapter 'fly-io-prod', outside the central allowlist (vercel-prod, gcp-cloud-run)"
justification: "legacy-provider migration in progress; fly-io-prod is the interim target while the team completes the move to gcp-cloud-run, tracked in backlog item MIGRATE-42"
owner: platform-team
expires: 2026-09-30
approved-by: release-po
```
