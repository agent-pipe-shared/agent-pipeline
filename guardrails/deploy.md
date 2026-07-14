# Deploy Guardrails

> Agent-Pipeline v0.1.0-draft · Release/Deploy phase
> Audience: every agent role touching a project that declares a manifest `release` section (`.claude/pipeline.yaml`), or any hook/lib code enforcing it, in any pipeline-bound project and in this repo (self-application).

**Precedence and enforcement:** as defined in `guardrails/global.md` (header). Server-side controls (GitHub Environments with required reviewers, tag/branch protection rulesets, OIDC trust conditions) are the PRIMARY, tamper-resistant enforcement layer (a repo-file policy is editable by the very agent it constrains); the `guard-push` deploy branch (`plugins/pipeline-core/hooks/guard-push.mjs`) is the SECONDARY, agent-side layer — defense-in-depth, never the load-bearing wall (same SEC-07 framing).

Rule IDs: `DP-xx`.

---

## NOT-BLOCKED — what this layer honestly does NOT catch (GIT-07 pattern)

A ruleset that claims more than the guard technically enforces is worse than no rule at all (gate honesty). The following are DOCUMENTED, ACCEPTED residuals, not silently-claimed coverage:

- **Deliberate YAML corruption.** The deploy branch can only enforce fail-closed behavior once it can parse the manifest well enough to know a `release` section exists and read its trigger patterns. A parse-level-invalid `.claude/pipeline.yaml` (malformed YAML, no `.manifest` at all) is indistinguishable from "no release section" at the point the hook runs — it WARNs (exit 1), for ALL pushes, exactly like a release-less repo. An agent could deliberately corrupt the YAML immediately before a push to smuggle a deploy-triggering tag past the guard. This is an ACCEPTED limitation — blocking every push on any YAML typo would reintroduce the exact accident-blast-radius the guard family's fail-open convention exists to avoid, and would change behavior for a corrupt release-LESS repo.
- **An unbound repository has no managed lock.** Without the fixed `.claude/policy-lock.yaml`, this package has no managed floor; the legacy project-selected `governance.policies_path` remains optional. Once the fixed lock is present, changing or removing `governance.policies_path` cannot mute it. This package does not fetch or authenticate a policy source: verifier status is an external assertion, so server-side controls remain the load-bearing wall.
- **Server-side controls are the load-bearing wall.** Everything in this file is agent-side, repo-file-based enforcement — readable and, in principle, editable by the very agent it constrains (SEC-07 framing). The PRIMARY defense against an unauthorized prod promotion is server-side: GitHub Environments with required reviewers, tag/branch protection rulesets, and OIDC trust conditions scoped to the deploying identity. A project that relies on this guardrail file alone, without configuring the server-side controls, has NOT actually closed the gate — it has only documented one.

---

## DP-01 — Promote consent: a deploy-trigger needs its OWN unconsumed approval

- **MUST NOT** treat the standing push approval (`guardrails/git.md` GIT-05/GIT-08) as satisfying a deploy-triggering push to a `human-gate` environment. `standing-approved` covers ordinary commits to `main`; it never covers a `promote:prod`-class deployment.
- **MUST** hold a matching, unconsumed `deployApproval` — a record bound to `{forArtifact, forEnvironment}` (`harness/scripts/pipeline-state.mjs approve-deploy --env <env> --artifact <tag-or-sha> --by <name>`) — before such a push. "Unconsumed" means no `usedAt` mark; a consumed approval does not carry over to a second promotion of the same artifact.
- Applies ONLY when a matched trigger ref resolves, via its adapter, to an environment declaring `promotion: human-gate` — an automated test-deploy environment never demands a manual approval (approval-fatigue defense).
- **Why:** Without this rule, a plain `git push origin v1.0.0` in a repo with a standing push approval would auto-pass and fire a prod deploy in CI — a composition bypass.
- **Verification:** `plugins/pipeline-core/hooks/guard-push.mjs` (deploy branch) + `guard-push.test.mjs` (block case despite `standing-approved`); `harness/scripts/pipeline-state.mjs` `approve-deploy`/`consume-deploy`/`clear-deploy` + `pipeline-state.test.mjs`.

## DP-02 — Precedence check: a project may not go looser than the central floor

- **MUST NOT** ship a project `release` configuration looser than a declared central deploy policy (`deploy-policy.yaml`, discovered via `governance.policies_path`) when that policy's `mode` is `mandate` or `strict` — this is a `validate-manifest` ERROR (precedence engine), blocking `verify` and, through the evidence-freshness gate, blocking pushes.
- **MUST** cover any deliberate deviation with a valid, non-expired `docs/risks.md` record (`policy-rule` field exact-matching the violated rule category or `<rule>:<subject>`, approved by the PO) — `mandate` mode only; `strict` mode admits no deviation at all.
- This guardrail file and the `guard-push` deploy branch NEVER re-implement the precedence diff itself — the guard only parses the central policy's `mode`/readability, the actual field-by-field diff (`adapters`/`targets` ⊆, gate-type/gate-mode ordinals) is the precedence engine's job, run inside `verify`.
- **Why:** A central deploy policy that a single project can silently loosen is not a floor — DP-02 is what makes the floor actually load-bearing across every project it governs.
- **Verification:** `plugins/pipeline-core/lib/manifest.mjs` (`checkDeployPrecedence` / `loadDeployPolicy`) + its own test suite; `harness/scripts/validate-manifest.mjs` renders precedence-violation messages; `docs/risks.md` deviation records per `templates/risks.md`.

## DP-02a — Fixed lock status is the managed binding boundary

- A tracked `.claude/policy-lock.yaml` uses a fixed repository-relative location and a
  public-safe status code only: `unbound`, `resolved`, `missing`, `stale`,
  `digest-mismatch`, `policy-invalid`, or `source-unverified`. It must carry an opaque
  ID and immutable version/digest; branches and tags are not verification.
- `mandate` and `strict` block setup before any source/runtime write, release validation,
  and deploy-triggering pushes unless the status is `resolved`; `advisory` warns. `pinned` never searches for an update; `notify`
  only reports one; `required` blocks only when its verifier declares the pinned version
  unacceptable. No mode may lower a managed floor, extend an allow-list, or silence a
  bound lock by removing a manifest key.
- This is not a source resolver, installer, credential system, cache, or server-side
  control. It deliberately exposes no pack name, URL, account, path or raw diagnostic.

## DP-03 — Evidence + deploy-log duty (reserved runtime enforcement)

- **MUST NOT** consider a deploy/promotion done without BOTH: a machine-written evidence artifact (`evidence/deploy-<env>-latest.json`, schema `pipeline.deploy-evidence.v0`) AND a standardized, append-only entry in `docs/deployments.md` (date, artifact, environment, approval reference, embedded evidence summary, rollback anchor, outcome).
- The evidence file is the transient machine-gate input (rolling, overwritten by the next deploy); the log entry is the durable record — an entry that merely references a since-overwritten evidence file is incomplete.
- The runbook step that calls `pipeline-state.mjs consume-deploy` after a successful triggering push lives in `docs/deploy/README.md` — this rule states the duty that tooling must satisfy.
- **Why:** A "deploy" that leaves no durable, standardized trace is unauditable the moment the transient CI run scrolls off — the same machine-evidence discipline the rest of the pipeline already holds every other phase to.
- **Verification:** This remains a documented/process AC only. `evidence.required` is
  reserved until its owning runtime adds executable enforcement and tests; no current
  guard, example or status report claims otherwise.

## DP-04 — Rollback duty: no prod promotion without a named rollback

- **MUST NOT** declare a `release.environments.<env>` block without a `rollback` procedure reference — mandatory per environment in the manifest schema, in one of two honest forms: a documented procedure back to the previous artifact, OR the explicit declaration `none-irreversible` plus a REQUIRED compensating action (e.g. the OSS/publish shape's "supersede: publish a patched release + deprecate/yank where the registry supports it"). Silent absence is invalid at the schema level already; this rule restates the duty as a provable, project-facing guardrail.
- **MUST** initiate the documented rollback procedure — and record the outcome (evidence + `docs/deployments.md` entry) — if a prod health/smoke check comes back red.
- **Why:** A promotion with no way back is a one-way door; requiring the rollback anchor to be named BEFORE the promotion happens is cheaper than discovering there is none while a real deploy is failing.
- **Verification:** Manifest schema `release.environments.<env>.rollback` required field (`pipeline.manifest.v0`); `harness/scripts/validate-manifest.mjs` rejects a missing/blank rollback reference; rollback initiation + outcome recording is a process AC checked at close (honestly named — no hook watches a live health check).

## DP-05 — Fail-direction statement (one provable paragraph)

- The `guard-push` deploy branch is fail-CLOSED (blocks unconditionally, exit 2, no mode qualifier) ONLY in two situations, both confined to release-declaring repos: (1) the manifest is semantically invalid (fails precedence/schema checks) AND the push is deploy-triggering — regardless of `gates.push.mode` and regardless of any existing `deployApproval`; (2) a declared central deploy policy (`mandate`/`strict` mode) is present but unreadable/malformed, for any deploy-triggering push (no mode carve-out because a malformed file makes `mode` itself unrecoverable).
- **Everything else fails OPEN**, matching the guard family's default convention: no `release` section at all (inert, unchanged); a semantically-invalid manifest with a NON-deploy-triggering push (falls through to the pre-existing evidence-freshness gate, typically still blocked there because the same errors turn `verify` red — but NOT via this layer's own fail-closed); a parse-level-invalid manifest with NO `.manifest` object at all (WARN, unchanged, for ALL pushes — see the case-D honesty note above); a `deploy-policy.yaml` that is simply ABSENT or reads `status: ok`.
- **MUST NOT** describe this layer as "blocking every risky push" — it is a narrowly-scoped fail-closed confined to the two conditions above, layered on top of a fail-open default everywhere else. Overstating it is exactly the gate-honesty failure GIT-07 already names for the git-guard family.
- **Why:** The point of this closure was replacing a silent fail-open on an invalid manifest with a stated, narrow fail-closed — stating the boundary precisely is what keeps that closure honest rather than becoming a new, differently-shaped false promise.
- **Verification:** `plugins/pipeline-core/hooks/guard-push.mjs` `runDeployBranch` (cases A/B/C/D) and its `guard-push.test.mjs` coverage (one case per matrix cell); `node harness/scripts/verify.mjs` runs the full suite.
