# Example deviation record — paired with `deploy-policy.yaml`

> Agent-facing fixture content (English, adjacent-to-policy convention, mirrors
> `governance/examples/worked-example.md`). This is a governance pairing: a
> FILLED deviation record showing how a `mandate`-mode violation against
> [`deploy-policy.yaml`](deploy-policy.yaml) is legitimately carried, instead of
> silently blocked or silently ignored. It is a fictional example — copy the shape,
> never the content, into a real project's own `docs/risks.md`
> (template: `templates/risks.md`).

## The scenario

`deploy-policy.yaml` declares `mode: mandate` with an `adapters` allowlist of
`vercel-prod` / `gcp-cloud-run`. A hosted project needs a short-lived exception: its
`prod` environment temporarily deploys via `fly-io-prod`, an adapter outside the
allowlist, while the team migrates off a legacy provider. Under `mandate` mode this
is a blocking violation (`checkDeployPrecedence`, ADR-0034) — UNLESS a valid,
non-expired deviation record covers it. Here is that record, in the fenced-`yaml`
format `templates/risks.md` and ADR-0034 both specify (deterministic extraction: the
checker scans for `yaml` fences and parses each with `yaml-lite`; everything between
fences is free-form prose and is never parsed).

```yaml
id: DEV-2026-07-11-01
policy-rule: adapters
deviation: "prod environment uses adapter 'fly-io-prod', outside the central allowlist (vercel-prod, gcp-cloud-run)"
justification: "legacy-provider migration in progress; fly-io-prod is the interim target while the team completes the move to gcp-cloud-run, tracked in backlog item MIGRATE-42"
owner: platform-team
expires: 2026-09-30
approved-by: release-po
```

## Why this is a legitimate carry, not a bypass

- The record names the EXACT violated rule (`policy-rule: adapters`), not a vague
  "we know" — `checkDeployPrecedence` matches deviation records against the specific
  rule category they cover (`guardrails/deploy.md` DP-02).
- It has an `owner` and a non-expired `expires` date. Per DP-02, a record missing
  either field, or one past its `expires` date, counts as ABSENT — the violation would
  block again the moment the record lapses, exactly as if it had never existed. This
  is deliberate: a deviation is a carried debt with a due date, never a permanent
  amnesty.
- It carries `approved-by` — a PO-level sign-off, not something an agent self-grants.
- `strict` mode (the harder alternative in `deploy-policy.yaml`'s commented lines)
  would ignore this record entirely; deviation records only ever work under `mandate`.

Cross-references: ADR-0034 (`docs/adr/0034-deploy-precedence-central-vs-project.md`,
precedence axis + deviation-path semantics), `guardrails/deploy.md` DP-02 (precedence
check rule), `templates/risks.md` (the general-purpose template this fixture
instantiates).
