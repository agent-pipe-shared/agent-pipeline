<!--
PROMPT/DOC TEMPLATE: deploy adapter reference form — Agent-Pipeline Release/Promotion
phase (ADR-0033/0034). Language: English (agent-facing config reference).
This is the FIELD REFERENCE for one adapter entry under a project manifest's
`release.adapters.<name>` (`.claude/pipeline.yaml`, see `templates/pipeline.yaml.example`
for the full commented shape in context). Copy the relevant example below when adding a
new adapter; do not invent fields beyond this list.
-->

# Deploy adapter — reference form

An adapter is the swappable "driver" a `release.environments.<env>` entry points at via
its `adapter:` field. The pipeline defines WHAT a deploy step must guarantee; the
adapter defines HOW, for one specific target.

## Fields

| Field | Required | Values | Notes |
|---|---|---|---|
| `name` | yes | free-form string | matches the key under `release.adapters.<name>` and the `adapter:` reference from an environment entry (integrity-checked). |
| `executor` | yes | `ci` \| `local` | the execution locus. `ci`: the deploy runs in CI (e.g. GitHub Actions), triggered by sanctioned git state (tag/release push) — the agent session prepares, obtains consent, triggers via git, and verifies evidence; it never executes a prod deploy directly. `local`: the deploy runs as a local command/process (e.g. a home-automation box). `local` is first-class but NOT softer — a service restart that activates config IS the live deploy; it carries the full promote gate and guard interception, same as `ci`. |
| `trigger` | required for `ci` release-triggering adapters | git ref pattern(s) (`ci`) or a command (`local`) | for `ci`, a list of ref patterns (e.g. `refs/tags/v*`) that `guard-push`'s deploy branch matches pushes against; for `local`, the command/condition that starts the deploy. |
| `deploy` | yes | workflow reference (`ci`) or command reference (`local`) | what actually performs the deploy once triggered. |
| `healthcheck` | yes (per environment, not per adapter — see the environment entry) | command/workflow ref | referenced from `release.environments.<env>.healthcheck`; kept here as the adapter-side implementation the environment entry points at. |
| `rollback` | **mandatory**, one of two honest forms | a documented procedure back to the previous artifact, **or** the literal `none-irreversible` plus a REQUIRED compensating action | silent absence is invalid (`guardrails/deploy.md` DP-04). Example compensating action for an irreversible publish: `supersede: publish a patched release + deprecate/yank where the registry supports it`. |
| `evidence` | yes | where results land | typically `evidence/deploy-<env>-latest.json` per the `pipeline.deploy-evidence.v0` contract documented in `docs/deploy/README.md`. |
| `credentials` | yes | `oidc` \| `ci-secret` \| `external` | how the deploy target authenticates. **Never an inline value** (SEC-08) — this field names a MECHANISM, never a secret, token, or key. `oidc` is the reference mechanism (keyless); `ci-secret` is the documented fallback (a CI-platform secret store); `external` means the credential is managed entirely outside this repo's tooling (e.g. a separately administered vault). |

## Example: `ci` executor

```yaml
release:
  adapters:
    vercel-prod:
      executor: ci
      trigger:
        refs:
          - refs/tags/v*
      deploy: .github/workflows/deploy-prod.yml
      healthcheck: .github/workflows/health-check.yml
      rollback: "redeploy previous tag via deploy-prod.yml workflow_dispatch with ref=<prev-tag>"
      evidence: evidence/deploy-prod-latest.json
      credentials: oidc
```

## Example: `local` executor

```yaml
release:
  adapters:
    home-automation-box:
      executor: local
      trigger: "systemctl restart ha-app.service"
      deploy: "scripts/deploy-local.sh"
      healthcheck: "scripts/health-check-local.sh"
      rollback: "scripts/rollback-local.sh --to <prev-artifact>"
      evidence: evidence/deploy-prod-latest.json
      credentials: ci-secret
```

> Honest limitation (stated in `docs/deploy/README.md`): neither of the v1 worked
> examples in that guide exercises the `local` executor — it ships specified-but-untested.
> `local` is not a lighter-weight path; "credential-free" never means "consent-free".
