# Release/Deploy Phase — Front Door & Guide

> Human-readable entry door to the optional SDLC tail phase "Release/Promotion"
> (ADR-0033: `docs/adr/0033-release-promotion-phase.md`, ADR-0034:
> `docs/adr/0034-deploy-precedence-central-vs-project.md`). Sibling to
> `docs/design/README.md` and the main `README.md`.
>
> The deep canon lives in `docs/operating-model.md` §3.5 — this document does NOT
> duplicate it, it links to it and makes the activation plus two concrete worked
> runs concrete and copy-pasteable.

---

## 1. How to enable the phase

Short and readable: a project switches the phase on by declaring a `release` section
in its manifest (`.claude/pipeline.yaml`) — the fully commented example form lives in
[`templates/pipeline.yaml.example`](../../templates/pipeline.yaml.example) (section
"Release/Promotion phase"). Projects WITHOUT such a section see zero new behavior — no
new gates, no new prompts, no mandatory files (the pipeline's standing anti-bloat
guarantee). This phase is optional down to the last byte.

**The flow, in prose** (the full graph lives in `docs/operating-model.md` §3.1/§3.5):

```
Merge → deploy:test → test gate (health/smoke evidence) → promote:prod (human gate)
  → deploy:prod → operate check (prod-health evidence) → deploy-log entry
```

`operating-model.md` stays the deep canon (phase model, precedence engine, enforcement
architecture, rollback semantics) — what follows here is only the activation and
worked-run view.

## 2. Degrade shapes

The phase has three first-class shapes; none is a special case of another:

- **(a) Full test→prod run.** Both environments (`test`, `prod`) are declared,
  `promote:prod` is a blocking human gate. The normal case for a project with its own
  server deploy.
- **(b) Release without a server deploy (the OSS shape: tag/publish).** No server is
  served at all — "deploy" means tagging plus publishing a package/release. This maps
  onto the SAME flow nodes (ADR-0033): `deploy:test` = build/package + pre-check, the
  test gate = its evidence, `promote:prod` = the publish/tag approval, `deploy:prod` =
  the publication itself, operate = post-publish verification (artifact resolvable).
  See Worked Example A below.
- **(c) No deploy / local artifact only (the default).** No `release` section in the
  manifest — the phase simply doesn't exist for this project. Costs nothing.

## 3. Worked Example A — OSS tag/publish behind the promote gate

Shows shape (b): a release is an irreversible external effect (a published package
can't be pulled back), and therefore sits BEHIND the `promote:prod` gate, not in front
of it — the shape that looks lightweight must not become a copyable bypass.

**Step 1 — server-side control FIRST (primary layer).** Before any manifest field
means anything: a GitHub **tag protection ruleset** on the tag pattern that triggers
the release (e.g. `v*`), restricting push/force-push on matching tags to authorized
roles only. This is the tamper-resistant control — repo-file rules are editable by the
very agent they're meant to constrain (`guardrails/deploy.md` NOT-BLOCKED section).

```
GitHub → Settings → Tags → Tag protection rules
  Pattern: v*
  Restrict who can create/update/delete matching tags: <authorized role(s)>
```

**Step 2 — the manifest `release` section** (excerpt, shape from
`templates/pipeline.yaml.example`):

```yaml
release:
  environments:
    prod:
      adapter: npm-publish
      healthcheck: scripts/verify-published.sh
      rollback: "none-irreversible; supersede: publish a patched release + deprecate/yank where the registry supports it"
      promotion: human-gate
  adapters:
    npm-publish:
      executor: ci
      trigger:
        refs:
          - refs/tags/v*
      deploy: .github/workflows/publish.yml
      credentials: ci-secret
```

Note the `rollback` value: a publication can't be pulled back, so the explicit
`none-irreversible` form plus the required compensating action
(`templates/deploy-adapter.md`, `guardrails/deploy.md` DP-04).

**Step 3 — the runbook run** (see §6 below for the exact commands): obtain approval for
`--env prod --artifact v1.2.3`, push the sanctioned tag (the `guard-push` deploy branch
requires a matching, unconsumed `deployApproval` for exactly this artifact/environment
pair — the standing push approval does NOT cover this), run `consume-deploy`
immediately after the successful push, pull CI evidence, write the evidence file plus
the log entry.

## 4. Worked Example B — Private repo, test→prod

Shows shape (a): a full test→prod run with a real server deploy.

**Step 1 — server-side control FIRST (primary layer).** GitHub **Environments** with
**required reviewers** on the `prod` environment — the merge/deploy workflow may only
touch `prod` after explicit reviewer approval in the GitHub UI, regardless of what the
manifest says. In addition: OIDC trust conditions that scope the deploying
workflow/identity to exactly this purpose (no static secret value in the repo).

```
GitHub → Settings → Environments → prod
  Required reviewers: <team/people>
  Deployment branches: protected branches/tags only
  OIDC: trust condition scoped to repo + workflow + environment
```

**Step 2 — the manifest `release` section:**

```yaml
release:
  environments:
    test:
      adapter: cloud-run-preview
      healthcheck: .github/workflows/health-check-test.yml
      rollback: "redeploy previous revision via cloud-run rollback"
    prod:
      adapter: cloud-run-prod
      healthcheck: .github/workflows/health-check-prod.yml
      rollback: "redeploy previous artifact via deploy-prod.yml workflow_dispatch with ref=<prev-tag>"
      promotion: human-gate
  adapters:
    cloud-run-preview:
      executor: ci
      deploy: .github/workflows/deploy-test.yml
      credentials: oidc
    cloud-run-prod:
      executor: ci
      trigger:
        refs:
          - refs/tags/v*
      deploy: .github/workflows/deploy-prod.yml
      credentials: oidc
```

**Step 3 — agent-side guard as a SECONDARY layer:** the `guard-push` deploy branch
additionally requires a matching `deployApproval` for every push on a
`refs/tags/v*` trigger, independent of the standing push approval. This is
defense-in-depth, not the load-bearing wall — see `guardrails/deploy.md`
"NOT-BLOCKED".

## 5. Local-class honesty flag

Neither worked example above uses the `local` executor. It is specified-but-untested
in v1: `local` is NOT lighter-weight than `ci` — a service restart that activates a
config IS the live deploy. It carries the full promote gate and full guard
interception; "credential-free" NEVER means "consent-free" (`templates/deploy-adapter.md`
shows the field form for both executor classes, including a `local` example; same
principle as `guardrails/deploy.md`'s NOT-BLOCKED section).

## 6. Deploy runbook

The operational steps, in order:

1. **Obtain promote approval** (before the triggering push happens):
   ```
   node harness/scripts/pipeline-state.mjs approve-deploy --env <env> --artifact <tag-or-sha> --by <name>
   ```
2. **Trigger via a sanctioned git push** (e.g. pushing the matching tag). The
   `guard-push` deploy branch checks for a matching, unconsumed `deployApproval` for
   {artifact, environment} — independent of any standing push approval.
3. **Immediately after a successful push**, mark the approval as consumed (guard hooks
   are read-only, booking the consumption is an agent duty):
   ```
   node harness/scripts/pipeline-state.mjs consume-deploy --env <env> --artifact <ref> --by <name>
   ```
4. **Pull CI evidence** (read-only via `gh`): verify the CI run's completion against
   the artifact identity.
5. **Write the evidence file:** `evidence/deploy-<env>-latest.json` per §7.1 below.
6. **Append a deploy-log entry:** `docs/deployments.md` per §7.2 below.

Housekeeping: a mistakenly granted or orphaned approval is removed with
`clear-deploy --env <env> [--artifact <ref>] --by <name>` (removes unconsumed entries
only, fails loudly if nothing matches — never a silent no-op).

The residual double-trigger window (two pushes of the SAME artifact to the SAME
environment before `consume-deploy` runs) is accepted and documented: it can only
repeat the already-approved action, never reach a different artifact or environment.

## 7. Contracts appendix (verbatim)

### 7.1 Evidence schema `pipeline.deploy-evidence.v0`

A documented contract, NOT a formal `.schema.json` file (precedent:
`pipeline.verify-evidence.v0` — an evidence artifact read by a gate and ENFORCED is
also only documented plus written by `verify.mjs`, with no schema file of its own;
deploy evidence in v1 is parsed by NO gate — this is a process check). Git-ignored
under `evidence/`, filename `evidence/deploy-<env>-latest.json`, rolling/overwritten:

```json
{
  "schema": "pipeline.deploy-evidence.v0",
  "artifact": "<tag-or-immutable-sha>",
  "environment": "<env-name>",
  "adapter": "<adapter-name>",
  "executor": "ci | local",
  "ciRunUrl": "<url>",
  "healthCheck": { "ref": "<cmd-or-workflow>", "exitCode": 0, "at": "<ISO-8601>" },
  "deployedAt": "<ISO-8601>",
  "recordedBy": "<script-name + dispatch/session id>"
}
```

Fields: `artifact` = the promoted artifact identity (build-once-promote);
`environment` e.g. `test` | `prod`; `ciRunUrl` present only when `executor: ci`,
omitted otherwise; `recordedBy` never free prose, always a script name plus a
dispatch/session id.

**Provenance honesty:** `ci` evidence is CI-attested/agent-booked (the agent pulls the
CI run result read-only via `gh`, verifies it against the artifact identity, and then
writes the local file referencing the CI run URL); `local` evidence is locally
executed. The evidence file is the transient machine-gate input; the DURABLE record is
the deploy-log entry (§7.2), because the evidence file is rolling/git-ignored.

### 7.2 Deploy-log entry format — `docs/deployments.md`

Append-only, one standardized entry per deploy/promotion/rollback. Because
`evidence/deploy-<env>-latest.json` is rolling and git-ignored, the log entry EMBEDS a
copy of the evidence summary — the log is the durable record:

```
## <ISO-date> — <artifact> -> <environment> — <outcome: deployed | promoted | rolled-back>
- Artifact: <tag/sha>            (build-once-promote identity)
- Environment: <env>
- Approval: <deployApproval ref — approvedBy + approvedAt, or "n/a (non-gated env)">
- Evidence (embedded copy): CI run <url> · health exitCode <n> · at <ISO>
- Rollback anchor: <named procedure back to <prev-artifact>, or "none-irreversible + <compensating action>">
- Outcome: <one line>
```

The phase counts as complete only once BOTH exist: the evidence artifact AND the log
entry (a process check). `docs/deployments.md` itself is NOT shipped by this repo — it
is a format a project instantiates itself when it needs it (this repo doesn't deploy
anything of its own).

---

**Cross-references:** `guardrails/deploy.md` (DP rules), ADR-0033 (phase model),
ADR-0034 (precedence), [`templates/deploy-adapter.md`](../../templates/deploy-adapter.md)
(adapter reference form), [`templates/risks.md`](../../templates/risks.md) (deviation
template), [`governance/examples/policies/deploy-policy.yaml`](../../governance/examples/policies/deploy-policy.yaml)
(central policy example).
