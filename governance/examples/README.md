# Governance examples (generic, agent-facing)

> Agent-facing template content (English per ADR-0011). These are GENERIC EXAMPLES for
> handover to a new project/company — never real company data, never real secrets. A
> project that adopts the pipeline copies this directory, deletes the example fixtures,
> and fills in its own guidelines/policies.

## Two governance categories

The pipeline distinguishes exactly two kinds of governance artifact — do not blur them:

1. **Guidelines (advisory)** — `governance/examples/guidelines/`. Numbered principles a
   company/team sets for style and design (layering, naming, error handling, ...).
   Deviations are ALLOWED but must be named and justified in the plan artifact — a
   guideline never blocks a gate by itself. Consumed by the planner/Elephant during
   design and by the Critic as a review benchmark (named deviations are expected input,
   not automatically findings).
2. **Policies (enforcing)** — `governance/examples/policies/`. Machine-checkable
   (`license-allowlist.json`, `semgrep/*.yml`) AND human-checked-but-binding
   (`checklist.md`) rules. A policy violation blocks: for machine-checkable policies the
   automated security-scan gate fails; for the non-machine-checkable checklist, the
   Critic ticks every item before the push gate and any NOT MET item is a blocking
   finding.

## Worked example

[`worked-example.md`](worked-example.md) walks ONE pattern — dependency direction
(guideline item 2 above) — through both modes end to end: advisory (named in the plan,
Critic benchmark) and enforcing (promoted to the `dependency-direction.yml` semgrep
fixture, security-scan gate blocks). Start there for a concrete "guideline → enforced
rule" trace.

## Deploy policy (the release-phase enforcing side)

[`policies/deploy-policy.yaml`](policies/deploy-policy.yaml) is a THIRD kind of policy
content alongside the machine-checkable and checklist policies above: the enforcing
side of the optional Release/Promotion SDLC phase (ADR-0033). It governs a project's
deploy CONFIGURATION (adapters, promote-gate floors, evidence duty) across three hardness
modes (`advisory` / `mandate` / `strict`) rather than code content — see ADR-0034 for
the full precedence model (central policy vs. project manifest) and
`guardrails/deploy.md` for the provable rules it backs. It ships paired with a FILLED
deviation-record example, [`policies/deploy-risks.example.md`](policies/deploy-risks.example.md),
showing how a legitimate `mandate`-mode exception is carried via `templates/risks.md`'s
format — the same guideline→enforced-rule pairing convention as
[`worked-example.md`](worked-example.md) above, applied to the deploy phase.

### Fixed managed policy lock

[`policies/policy-lock.example.yaml`](policies/policy-lock.example.yaml) documents the
separate managed-policy binding. A consuming repository places that public-safe shape at
the fixed `.claude/policy-lock.yaml` path. It carries only an opaque pack ID, immutable
version/digest, mode, update policy and verifier status code — never a source URL, account,
credential, cache or absolute path. A bound `mandate`/`strict` lock whose status is not
`resolved` fails closed before setup writes, for release validation, and for deploy-triggering
pushes; `advisory` warns. The package neither fetches nor independently verifies a source, so its verifier
status is an externally supplied assertion, not a claim of live trust resolution.

## Wiring (`.claude/pipeline.yaml`)

A project points at its own governance directories via the manifest's `governance`
block (see `templates/pipeline.yaml.example` for the full annotated shape):

```yaml
governance:
  guidelines_path: governance/examples/guidelines
  policies_path: governance/examples/policies
  mode:
    guidelines: advisory   # warn-style: deviations are reported/documented, never block
    policies: enforcing    # blocking-style: a violation blocks the relevant gate
```

`guidelines_path`/`policies_path` name the directories this repo's own
`.claude/pipeline.yaml` already points at (making those paths real is exactly what this
directory delivers). The `mode` pair reuses the manifest's general gate-mode vocabulary
(`blocking | warn | off`, see `gates:` in `pipeline.yaml.example`): `guidelines` runs
warn-style (advisory, never blocks), `policies` runs blocking-style (enforcing).

## Hierarchy (repo overrides user; enterprise sits above both)

Governance resolution follows the same shape as Claude Code's own settings precedence:

1. **REPO** — this project's `governance/examples/` (or wherever `.claude/pipeline.yaml`
   points) is the project-specific layer. It OVERRIDES the user level for anyone working
   in this repo.
2. **USER** — a personal `~/.claude/` level (individual preferences, e.g. a developer's
   own stricter house style) applies only where the repo level is silent.
3. **MANAGED SETTINGS (enterprise)** — for company/enterprise deployments, a
   centrally-administered managed-settings layer sits ABOVE both REPO and USER and is
   non-overridable by either — the organization's non-negotiable floor (data-privacy law,
   license law, security baseline). This repo ships no managed-settings layer; it is a
   deployment-time concern for the adopting organization.

## Boundary to existing pipeline-own layers (dedup, MANDATORY STEP 1 recon)

Two existing directories look adjacent but are a DIFFERENT layer — never merge them with
governance examples:

- **`harness/checklists/*`** — ritual checklists for the Agent-Pipeline's OWN session
  rituals (session-start, session-close, critic-review, goldfish-dispatch). They govern
  HOW the pipeline itself operates, not what a hosted project's code must satisfy.
- **`guardrails/*`** (`global.md`, `git.md`, `security.md`, `quality-gates.md`,
  `token-budget.md`) — the Agent-Pipeline's OWN provable gebot/verbot rules (this repo's
  guard-union hooks enforce them). They are pipeline infrastructure, not per-company
  policy content a hosted project defines for itself.

`governance/examples/` is the THIRD, distinct layer: per-company/per-project governance
that a hosted project defines and the pipeline consumes (guidelines as review benchmark,
policies as blocking gate content) — never pipeline-own rules, never pipeline-own
rituals. REAL company policies for an actual adopting organization live OUTSIDE this
repo entirely; everything under `governance/examples/` is a generic, fictional fixture
set for handover/demonstration only.
