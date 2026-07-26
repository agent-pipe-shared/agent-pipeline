# Changelog

- Fix the 0.4.6 Codex onboarding candidate so recognized damaged continuity
  receives a bounded, digest-confirmed repair instead of a diagnostic loop;
  established PO-bound repositories can adopt continuity without fabricating
  kickoff history, and direct edits of the writer-owned machine State are
  blocked.

All notable changes to the Agent Pipeline are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Versioning per [ADR-0002](docs/adr/0002-versioning-sha-then-semver.md): the `0.4.0` release candidate uses stable SemVer surfaces; a version in this file is not a tag, GitHub Release, marketplace publication, or remote readback.

## [Unreleased]

## [0.4.6] — 2026-07-26

### Fixed

- Fresh Codex folders now reach the digest-bound host Git initialization
  before App-Server readiness is required, preventing a sandbox-only
  App-Server denial from deadlocking repository creation.
- Restarted WSL sessions recognize the exact protected projection of an
  existing physical Git control tree and retain a narrowly parsed read-only
  diagnostic lane while lifecycle writes remain closed.
- The Codex preflight now returns the exact initial lifecycle-inspection action
  together with its WSL host-boundary requirement, so agents no longer
  reconstruct or first run that capability probe in the misleading workspace
  sandbox.
- Restart actions now declare `external-terminal` / `user-copy-only` execution
  and prohibit Codex tool calls; the lifecycle guard returns a targeted
  external-action instruction if an agent nevertheless attempts one.
- Codex Advisor routing now has one explicit productive CLI contract instead
  of an undocumented stdin-only interface, preventing empty-output help/source
  discovery loops before the single bounded consult.
- Codex Advisory now has a 60-second Sol/max primary and one 45-second
  Terra/high fresh fallback, with workspace digests checked before, between,
  and after attempts. Unchanged-workspace exhaustion is reported as
  non-blocking `advisory-unavailable`; mutation remains a hard stop.
- Bootstrap Verify availability checks no longer execute arbitrary entrypoints
  with `--help`; Node gates use syntax-only `node --check`, and other commands
  receive existence-only observation without creating evidence.
- A registered local Codex marketplace is reported as
  `local-development` instead of stale or mismatched. It remains subject to
  the ordinary candidate-bound Verify, Security, PO approval, and readback
  gates before push or release.
- Host-init drift and operational filesystem failures retain their distinct
  typed classifications through durability checks and continuity rollback.
- Critic findings are bound to the candidate diff and directly regressed
  dependencies; fix re-reviews check prior findings without opening recursive
  Critic-of-Critic loops.

The multi-step installation ceremony and confirmation-count tuning remain
owned by @skar667 (PO) in Issue #25, with expiry 2026-08-31; this hotfix does
not broaden lifecycle mutations or delivery authority.

## [0.4.5] — 2026-07-26

### Fixed

- Fresh Codex folders now receive a visible, optional Agent Pipeline offer
  before project work and advance through typed, digest-bound portable-seed,
  kickoff, host Git-initialization, restart, and session-readiness states.
- Post-restart lifecycle guards admit only exact V4 session readiness or the
  narrowly bound host-initialization compatibility receipt; ordinary reads no
  longer deadlock behind an intent mismatch.
- A PO-approved canonical calibration change from `host-managed` to
  `local-only` remains valid after the fresh-root transition and is reported as
  a pre-HEAD local repository without a remote or publication claim.
- Pipeline start reports the loaded plugin version and distinguishes a
  loaded/installed Codex generation mismatch from a repository defect. Refresh
  guidance is runner-specific: Claude Code uses `/reload-plugins`; Codex uses
  `/plugins` followed by `/new`, or an attended App-Server daemon restart after
  an external CLI update.
- Lifecycle remediation commands carry complete, copy-safe argv and do not
  fall back to web or repository searches when a typed local action exists.
- Advisor and Critic host-path time budgets are raised to avoid premature
  retries during otherwise progressing bootstrap and review work.

## [0.4.4] — 2026-07-25

### Fixed

- Fresh Codex workspaces whose host owns empty, read-only `.git`/`.codex`
  controls (and `.agents` when present) now use the explicit
  `fresh-host-managed` onboarding path. It creates only portable
  `pipeline.user.yaml` and `.claude/**` bytes, never chmods or writes reserved
  controls, and returns the bounded
  `host-managed-codex` V3 readback instead of rejecting the workspace.
- The onboarding E2E suite now exercises the host-managed success path and
  invokes its CLI entry points in-process when managed Codex sandboxes reject
  nested Node processes.

## [0.4.3] — 2026-07-25

### Fixed

- Consumer onboarding now distinguishes an empty root, a safe existing-project
  adoption, legacy V0/V1/V2 migration, and a host-owned incompatible control
  layout. Adoption writes only absent Pipeline-owned targets and preserves
  application content plus existing valid Git metadata.
- Adoption recognizes a valid linked-worktree `.git` pointer through a
  read-only Git probe and preserves that pointer unchanged.
- Generated Codex implementor and critic roles carry the required developer
  instructions and are checked against the source role files.
- Fresh onboarding seeds a declared local-only Git lifecycle, while the
  repository freshness helper separately reports local-only, pre-initial-commit,
  and remote-tracked states without a false remote-freshness claim.
- First-binding instructions now require a new Claude or Codex host process;
  Claude plugin reload is documented only as a later refresh operation.

### Added

- A process-level temporary-repository onboarding test exercises the shipped CLI
  for both empty and existing-project roots, including the typed host-layout
  incompatibility result.

### Changed

- Current repository-owned code, documentation, and metadata use the
  source-available Sustainable Use License 1.0 (SUL-1.0). This change applies
  to the current candidate and does not alter the MIT, Apache-2.0, or
  CC-BY-4.0 grants and notices shipped with earlier versions.
- The PO-selected `0.4.0` release candidate now resolves the public `VERSION`
  and both plugin manifests to the same stable version. The two intended
  marketplace resolutions and the remaining release gates are documented in
  [`docs/release-0.4-readiness.md`](docs/release-0.4-readiness.md). This change
  does not create a tag, GitHub Release, marketplace publication, or remote
  readback.
- The PO disposition for the Sentinel/HAW-E implementation is that its tests
  and functionality are complete. Final candidate-bound Verify, Security, and
  independent Critic evidence, plus the separately authorized HAW-E remote
  release/readback sequence, remain required before any release claim.

## [0.2.0] — 2026-07-12

### Added

- Contribution scaffolding (CONTRIBUTING, SECURITY, CODEOWNERS, Code of Conduct, PR/issue templates) and a GitHub Actions CI workflow running the verify gate.
- **Optional Release/Promotion SDLC phase** ([ADR-0033](docs/adr/0033-release-promotion-phase.md)): an adapter-based tail phase from merge to prod — `deploy:test` → test gate (health/smoke evidence) → `promote:prod` (human gate) → `deploy:prod` (build-once-promote) → operate check → evidence + deploy-log entry. Opt-in via a `release` section in the project manifest; zero cost when absent. Covers full test→prod, release-without-server-deploy (OSS tag/publish), and no-deploy shapes alike.
- **Deploy-precedence engine: central deploy policy vs. project manifest, as a new axis** ([ADR-0034](docs/adr/0034-deploy-precedence-central-vs-project.md)): an optional central `deploy-policy.yaml` (discovered via `governance.policies_path`) with three hardness modes (`advisory`/`mandate`/`strict`), enforced primarily server-side (GitHub Environments, branch/tag protection, OIDC) with the repo guard as defense-in-depth. The deploy-policy governance layer pairs the central policy with a project-side deviation path: in `mandate` mode a project may only diverge via a valid, non-expired exception record in `docs/risks.md`; `strict` mode admits none.
- Guardrail `SEC-08` (`guardrails/security.md`): the agent never handles deploy-target credentials (cloud/registry/hosting keys) — only `{oidc, ci-secret, external}` references, never inline values; ambient git-push credentials stay untouched by this rule.
- Guardrail `GIT-08` (`guardrails/git.md`): the standing push approval does NOT cover a deploy-triggering ref — a `promote:prod`-class push to a `human-gate` environment needs its own fresh, artifact-and-environment-bound `deployApproval`.
- New deploy guide [`docs/deploy/README.md`](docs/deploy/README.md): the human-readable front door to the Release/Promotion phase — how to enable it via the manifest `release` section, its degrade shapes, and worked runs.
- New optional `release:` block in `pipeline.user.yaml`/its schema for the Release/Promotion phase configuration — zero cost when omitted.

### Changed

- License changed from MIT to Apache-2.0 for code and CC-BY-4.0 for documentation and prose.
- **Config restructure: model routing per work method (`worktypes`), dispatch tiers only in `models`.** `pipeline.user.yaml` gains a new `worktypes` block — one entry per session profile (`design`/`feature`/`mini`, i.e. design-first/advisor/speed), each with `design_phase`, `execution_phase`, and `advisor`. `models` is reduced to dispatch tiers only: `implement`, `mechanic`, the new `deep` (MP-27), and `review`. The former `models.design` (Elephant/orchestrator) and `models.advisor` keys are removed — a clean break, no prior adopters. `setup.mjs`, `pipeline.user.schema.json`, and `.claude/pipeline.yaml`'s model-routing projection are updated accordingly.

Honest maturity note: v0.2.0, a week and a half of build time, a solo project, multiple dogfooding rounds so far (this release itself was shipped under its own Release/Promotion phase) — feedback welcome.

## [0.1.0] — Initial public snapshot

First shareable snapshot of the Operating Model: role model (PO/Elephant/Goldfish/Critic), two-tier review system (deterministic gates + Critic trigger matrix), session lifecycle, handover canonicalization, project calibration layer, guardrails (`guardrails/`), model/tooling policies (`policies/`), and the `pipeline-core` plugin (git-guard union hook, skills, agents). Details: [`docs/operating-model.md`](docs/operating-model.md).

Honest maturity note: v0.1.0, about a week of build time, a solo project, one dogfooding round so far — feedback welcome.
