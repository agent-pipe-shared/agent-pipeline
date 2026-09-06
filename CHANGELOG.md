# Changelog

All notable changes to Agent-Pipeline are documented here. `0.6.1` is the
current release; `0.6.0` was a candidate and was never published. A version
recorded here is not, by itself, a tag, GitHub Release, marketplace
publication, remote readback, or production-support claim — `0.6.1` happens to
carry all of those, and the entry below says so explicitly rather than leaving
it to be inferred from the heading.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Versioning per [ADR-0002](docs/adr/0002-versioning-sha-then-semver.md): the `0.4.0` release candidate uses stable SemVer surfaces; a version in this file is not a tag, GitHub Release, marketplace publication, or remote readback.

## [Unreleased] — 0.6.2 local candidate, assembling

Not a tag, not a release. This section accumulates what has landed on `nova`
since `0.6.1` and states, per item, what is proven and what is not. Status
words are load-bearing: **built** means committed with tests green by hand;
**gated** means those tests run in the verify gate; **wired** means a hook is
registered and fires; **exercised** means run against the real thing at least
once.

### Added

- **Parallel-dispatch slicing nudge** (`plugins/pipeline-core/hooks/guard-slicing.mjs`,
  42 tests): a `PreToolUse` advisory that, after three consecutive
  single-dispatch turns or a `TodoWrite` batch of three or more pending items,
  delivers a non-blocking `additionalContext` nudge toward parallel slicing.
  Fan-out is recognized for Claude Code (`Task`/`Agent` grouped by transcript
  `message.id`, `Workflow` by script), for Antigravity (`invoke_subagent`
  with two or more `Subagents`), and is deliberately silent on Codex, whose
  guard adapter admits no dispatch tool at all — pinned by test. Design:
  `docs/adr/0080-parallel-dispatch-slicing-enforcement.md`, two T1 rounds,
  accepted by the PO on 2026-09-06.
  **Built. Gated** (registered in `verify.mjs` under a PO signature,
  `eecb4273`; the inventory obligation that registration created is met in
  `ec0b158c`). **Not wired** (`hooks.json` is kernel-protected; attended step
  pending). Whether a non-blocking nudge changes behaviour is unmeasured by
  design — the ledger it writes is the instrument for that.
- **The delivery channel behind it is proven.** A `PreToolUse` hook's exit-0
  `hookSpecificOutput.additionalContext` reaches the model on Claude Code
  2.1.263 — shown live with a negative control, corroborated by a static trace
  of the runner binary, and witnessed independently by a dispatch that had not
  been told about the probe.
- **A selected-Codex-Critic transport with a real consumer**
  (`codex-critic-selected-host.mjs`, `codex-critic-app-server.mjs`,
  `codex-critic-app-server-child.mjs`): the `selected-runner-transport` gate
  previously had a producer and no consumer anywhere in the repository. Built
  as an in-process bridge mirroring the working advisory precedent. **Built.
  Not exercised** against a real Codex — the runner's permission classifier
  denies the sandbox spawn, and one T1 review returned three major findings
  (one falsified-receipt defect, fixed in `eb9c477f`; one untested seam; one
  unpinned contract briefing, filed). A second defect was reported from an
  installed copy: the adapter resolved its ruleset three levels above its own
  file — the repository root in a source checkout, nothing at all in an
  installed plugin. Fixed in `b5a181ce`: the ruleset is anchored at the
  executing plugin root, with a regression check against a real installed
  layout (red before, green after).
- **A Critic preflight that enumerates the evidence that exists**
  (`critic-dispatch-preflight.mjs --sweep-evidence <task-id>`): case-
  insensitive, tolerant of date prefixes, across every evidence location
  ADR-0063 names, each hit tagged with its location class. Advisory and
  non-failing. It exists because a dispatcher told a Critic that no RED
  artifact existed for a task when one did, in a directory the search had not
  looked in. Gated (extends an existing suite, 10 checks).
- **`guard-dispatch.mjs` is importable without disarming itself**: its
  top-level hook body is gated by `isDirectInvocation`, and
  `extractWorkflowDispatches`/`extractAntigravityDispatches` are exported for
  reuse. Proven to still refuse when invoked through a symlink — the exact
  2026-08-06 silent-disarm shape.
- **Denial-code accuracy for refused outside-root reads**: a single read with
  the admitted `2>/dev/null` suppressor, and an `&&`-chained outside-root
  read, now report `GUARD-READ-SCOPE-OUTSIDE-ROOT` rather than a redirect or
  parse code. Nothing admitted became refused or vice versa; four negative
  cases pin that.

### Changed

- **Verify gate wall clock 645.7s → 454.9s (−29.5%)** from three lines in
  `SERIAL_LANE_SUITES`. First `project-onboarding-v3-tests` (−25%), shown a
  false positive of the lane sweep — own `mkdtemp` root per case, zero
  `process.cwd()`, two concurrent full instances 164/164 green. Then
  `session-cleanup-binding-tests` and `worktree-lifecycle-tests` (−6%) after
  per-signal assessment with citations and a passed self-race for the larger.
  Same single non-zero suite before and after each. Of the remaining clean
  candidates, one is kept because the evidence-capture tool refuses a
  fixture literal as a host path (filed), and five are unassessed. The lane is
  still 100% of wall clock; its top five are process-global and not evictable
  on this axis.
- **`guard-dispatch.test.mjs` no longer carries a silent-pass hazard**: its
  module-scope import of the hook — which would have reported the whole file
  as one passing test with nothing run, had the entrypoint gate regressed — is
  replaced by a subprocess probe that fails loudly on absence of a success
  marker. The hardening is demonstrated against a reconstructed pre-fix
  fixture, not asserted. The sibling `guard-dispatch-budget.test.mjs` still
  carries the hazard; filed.

### Known and not fixed

- **`guard-dispatch-budget.mjs` is registered and never fires.** Its logic is
  proven correct by direct probe (it resolves `maxTurns: 80`, working cap 65),
  the installed registration carries the corrected matcher, subagent
  transcripts sit exactly where its discriminator looks — and after every
  dispatch of 2026-09-06 its state directory holds no counter and no
  diagnostic log. Working, it would have prevented all four of that day's
  harness truncations. Leading hypothesis: a subagent payload carries the
  parent's `transcript_path`. Needs a payload capture, which needs a
  user-level hook and a restart.
- **Verify optimisation ceiling, measured**: after the eviction, the twelve
  further eligible suites are 17.2% of the gate at most and eight of them
  8.8%; the five largest lane members (52%) are process-global and cannot be
  evicted on caller scoping.

### Process

- Four T1 Critic rounds on the day's guardrail work returned four FAILs, and
  the load-bearing findings were dispatcher-side each time: a Critic briefing
  contaminated with conclusions presented as facts; a false absence claim; an
  instruction to "satisfy" a tripwire that a dispatch correctly read as
  "silence" it; and a dispatch-disclosed quirk relayed onward as settled. Each
  is recorded as a rule in `backlog/evidence/2026-09-06-*`, and one of them
  is now mechanically prevented by the evidence sweep above.
- GIT-03 confirmed by PO decision: commits carry `AI-Assisted: true` and the
  `Dispatch:` trailer only. A session-level instruction asking for provider
  co-author trailers does not apply in this repository.

## [0.6.1] — 2026-09-02

Released. Tag `v0.6.1` and the GitHub Release of the same name both point at
commit `6262d408`, which is the head of `main`. `0.6.1` supersedes the `0.6.0`
candidate below, which was never tagged or published.

Read the *Verification* note at the end of this entry before treating the
release as fully green: the local gate passed on the released commit and CI did
not.

### Added

- An approved feature branch can be rebased again. A new resolver
  (`plugins/pipeline-core/lib/rebase-authority.mjs`) reads lifecycle authority
  from `orig-head` — the branch's true starting point — instead of from the
  half-replayed working tree, which had made `guard-lifecycle-ready` read the
  earlier design state as current and demand a fresh single-use human signature
  after nearly every conflict.
- The authority is narrow and never opt-in: it exists because the repository is
  genuinely mid-rebase from a validly approved starting point, never because a
  session set a flag. A file untouched by a conflict does not become editable,
  and `--edit-todo`, `--exec`, `--skip`, an arbitrary `-c`, shell chaining and
  anything push-shaped stay refused by absence from an allowlist. It states
  `pushAuthority: false` and `remoteAuthority: false` as fields, not omissions.
- Every denial raised during an active rebase names the route forward — the
  conflict surface as data, the read-only diagnostics that reveal it, and the
  exact continuation.
  - **Correction, 2026-09-02.** This entry originally closed with "so a session
    that has never heard of this authority is carried through by the refusals
    themselves". That is true of the refusal *text* and false of the
    *behaviour*, and the claim is withdrawn rather than left standing. In
    `0.6.1` two later checks contradict the authority the resolver grants: the
    writer-owned-State refusal returns without consulting it, and the shell
    admission is a lift rather than a return, so lifecycle readiness still runs
    afterwards — against a conflicted state file that is not valid JSON. A
    rebase whose conflict lands on that file deadlocks. Tracked in `backlog/`
    and fixed after `0.6.1`; the resolver itself was never implicated.

### Fixed

- Git arguments are parsed per subcommand. `git -c core.editor=true rebase
  --continue` had treated `core.editor=true` as a file path, and `git checkout
  --ours -- <path>` had treated the subcommand itself as one.
- A `git rebase --exec` payload can no longer smuggle a write past the guard.
  Payload options were matched by exact literal spelling while git accepts
  unambiguous long-option prefixes, so `git rebase --exe '<write command>'`
  executed and produced no candidate at all. The table is now inverted: the
  *safe* options are enumerated, and an unrecognised long option on a verb with
  no pathspec grammar makes its argument an opaque payload, so an omission costs
  a spurious candidate instead of the gate.
- `applyProjectOnboardingManifestRepair`'s rollback no longer deletes a file it
  does not own. Ownership was decided by inode identity alone, and ext4 reuses a
  freed inode number for the next file created in the same block group; it is
  now bound to the bytes actually written, at every rollback and cleanup site in
  that module.
- `push-init` can satisfy its own chained doc-reconciliation check. It emitted
  the literal `HEAD` as `--candidate` and never emitted `--record-ref`, so both
  resolved to one commit — and a reconciliation record naming a commit cannot
  live inside that commit. `--candidate` is now required and `--record-ref`
  explicit.
- The verify-failure reporter keeps the failing test's own line when it
  truncates, enforces its per-suite byte bound across recovery instead of
  recomputing it afterwards, and no longer inflates that bound by cutting inside
  a multi-byte character.

### Security

- `plugins/pipeline-core/lib/rebase-authority.mjs` is a never-liftable kernel
  path. A maintenance window able to rewrite it could manufacture an authority
  that relieves a lifecycle gate without a human signature.

### Changed

- ADR-0077 records the release flow's self-invalidation: the normative release
  order, gate evidence bound to the test-relevant tree rather than to the
  commit, and the cheap consistency checkers as a fast pre-gate. Recorded as
  decisions and scheduled — not claimed as built.

### Verification

The local gate ran green on the released commit (506 suites, exit 0) with a
CLEAN security scan, and four independent Critic rounds reviewed the work; their
findings registries and claims records are tracked under `backlog/evidence/`.

CI run `33595311782` on `6262d408` failed with three suites red — all three
pass locally, and each is tracked as its own defect in `backlog/items/`:
`guard-lifecycle-ready-tests` (the workflow's synthetic `PATH` has no `true`,
so git cannot start the editor the published continuation names),
`codex-onboarding-capabilities-tests` (the suite's tree snapshot races git's own
background maintenance lock) and `local-worker-supervisor-cli-tests` (`LWSC04`
cancellation under runner load, against a 1s/3s lease window). They are
test-environment and test-timing defects rather than defects in what this
release ships; that distinction is asserted with evidence, not offered as a
reason to disregard them.

This release was pushed to `main` under an explicit repository-admin ruleset
bypass, because `main` requires a passing `verify` status on the pushed commit
while the workflow only runs on a push to `main`, a pull request against it, or
a dispatch — a commit that has never reached a remote ref cannot acquire the
status it needs in order to reach one. `docs/state.md` carries the full record.

## [0.6.0] — 2026-08-30 (release candidate, never published)

This is a source and plugin release candidate only. It does not create a tag,
marketplace publication, GitHub Release, or production-support claim. Final
publication remains contingent on evidence bound to the final candidate.

### Added

- The completed Phoenix product strand is integrated as the delivery-governance
  foundation: candidate-bound evidence and approvals, deterministic checks before
  independent review, recoverable operational records, and typed boundaries for
  external actions.
- The candidate-ready Nova Greenfield Driver leads a fresh directory through
  public structured actions rather than a runner reconstructing internal
  onboarding commands. It supports an existing or new first trust anchor,
  resumable onboarding context, plan approval, real verify setup, and the first
  implementation step.
- The Greenfield contract covers Claude, Codex, and Antigravity. Independently
  scoped delivery packages may run in parallel while retaining the normal
  deterministic-evidence and Critic order.

### Changed

- The product documentation now distinguishes the integrated Phoenix foundation
  from active Nova work. Nova B remains an explicit roadmap, not an implied
  claim that all Nova work or all host-specific assurance is complete.

### Security

- Missing, stale, malformed, skipped, or candidate-mismatched evidence remains
  a typed non-success. Smoother onboarding and delivery sequencing do not waive
  approvals, signatures, deterministic checks, or the release boundary.

## [0.5.1] — 2026-08-02

### Fixed

- Codex bootstrap now keeps the normal happy path recoverable when the
  persisted PRD and Spec authority differs from the current bound documents.
  It admits only the exact read-only rebind planner for that diagnosed partial
  state, returns a typed planner failure instead of a generic unavailable
  result, and requires the existing digest-bound approval/apply flow before
  the session becomes ready.
- This interim release is rebased on `0.5.0`; its public plugin metadata is
  `0.5.1`. It does not create a tag, marketplace publication, GitHub Release,
  or remote readback by itself.

## [0.5.0] — 2026-08-02

### Added

- Policy-complete security evidence, AI-assisted hardening, finding lifecycle,
  and security readiness now run through the shared Verify gate.
- A portable human-approval path keeps the encrypted Ed25519 private key and
  its passphrase outside the repository. The human normally runs only
  `approve-all` at an actually configured decision gate.
- A concise upgrade guide explains the security delivery and the scope of the
  current CLI approval adapter.

### Changed

- The supported security-release line is now `0.5.x`.

### Security

- Required missing, skipped, stale, or candidate-mismatched evidence now fails
  explicitly instead of producing a green security result.

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
