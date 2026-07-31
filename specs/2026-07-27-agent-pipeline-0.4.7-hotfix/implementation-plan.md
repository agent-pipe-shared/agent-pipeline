# Implementation plan — Agent Pipeline 0.4.7 completion

Status: design reopened; prior PO approval revoked; implementation dispatch is
blocked until the current PRD/Spec digests receive fresh PO approval.

Authority is the code-first section of the neighboring PRD and Spec.
`main@83640cec22d494d227eebc82929370277ce926b9` is the implementation
baseline. GitHub Issues define mandatory outcomes, but current code wins over
stale Issue branches, filenames, baselines, or implementation sketches.

## Delivery strategy

Preserve all green implemented slices. Implement only current gaps, in the
following dependency order, with one bounded Goldfish dispatch per slice or
one combined dispatch where production surfaces overlap. Every dispatch binds
the exact baseline commit/tree, PRD/Spec digests, owned paths, DoD commands,
prohibitions, and stop conditions.

### F0 — Lifecycle authority and portable cleanup

Implement AC-047-100–111 first because these rules decide whether later work
can be edited, approved, resumed, and persisted safely.

- Keep machine-local session-cleanup identity in authenticated private runtime
  storage and make every neutral portable State writer/readback fail closed on
  leakage.
- Reuse the canonical hyphenated derived statuses `draft`,
  `awaiting-approval`, `approved`, and `implementing`, while retaining the
  durable phase enum `design|implementation`, exact legacy
  `activeFeature:{id,planPath,phase}`, and adding only top-level
  `planSubmission`/`planInvalidation`.
- Add sanctioned submit/invalidate/reapprove transitions and one shared derived
  status used by onboarding, State, continuity, guards, statusline, bootstrap,
  resume, topology, and close.
- Preserve historical approval/revocation as audit data without treating it as
  current authority.

Focused evidence: neutral cleanup start/reuse/recovery, legacy/neutral parity,
repeated design edits, submit, edit-after-submit, edit-after-approval,
restart/resume, hostile State, and exact reapproval.

Owned production paths: `plugins/pipeline-core/scripts/session-cleanup.mjs`,
`plugins/pipeline-core/lib/session-cleanup-recovery.mjs`,
`plugins/pipeline-core/lib/project-authority.mjs`,
`plugins/pipeline-core/scripts/pipeline-state.mjs`,
`plugins/pipeline-core/lib/plan-spec-state-v2.mjs`,
`plugins/pipeline-core/lib/project-onboarding-v3.mjs`,
`plugins/pipeline-core/lib/onboarding-continuity.mjs`,
`plugins/pipeline-core/lib/feature-package-topology.mjs`,
`plugins/pipeline-core/hooks/guard-devplan.mjs`, and their adjacent tests.

Required focused commands:

- `node plugins/pipeline-core/scripts/session-cleanup-binding.test.mjs`
- `node plugins/pipeline-core/lib/project-authority.test.mjs`
- `node plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`
- `node harness/scripts/pipeline-state.test.mjs`
- `node plugins/pipeline-core/lib/feature-package-topology.test.mjs`
- `node plugins/pipeline-core/hooks/guard-devplan.test.mjs`

### F1 — Freshness separation and canonical backlog

Implement AC-047-99 and AC-047-112–116.

- Separate branch/upstream repository freshness from loaded-Pipeline update
  availability. Ordinary marketplace drift is informational and nonblocking.
- Bind the loaded plugin identity independently of the self-application
  checkout branch.
- Repair ledger events 39/40 through append-only reachable evidence without
  rewriting history or closing the managed-onboarding item.

Focused evidence: Phoenix-shaped branch/upstream equality with a different
marketplace default head, older/equal/ahead/offline loaded-plugin states, no
ref/config/worktree mutation, and a green canonical backlog checker.

Owned production paths:
`plugins/pipeline-core/scripts/ruleset-freshness.mjs`,
`plugins/pipeline-core/scripts/repository-freshness.mjs`,
`plugins/pipeline-core/hooks/staleness-check.mjs`,
`plugins/pipeline-core/skills/pipeline-start/SKILL.md`,
`harness/session-bootstrap.md`, `plugins/pipeline-core/lib/backlog-state.mjs`,
`plugins/pipeline-core/scripts/check-backlog-state.mjs`,
`backlog/transitions.ndjson`, `backlog/index.json`, and `backlog/STATUS.md`.

Required focused commands:

- `node plugins/pipeline-core/scripts/ruleset-freshness.test.mjs`
- `node plugins/pipeline-core/scripts/repository-freshness.test.mjs`
- `node plugins/pipeline-core/lib/backlog-state.test.mjs`
- `node plugins/pipeline-core/scripts/check-backlog-state.mjs`

### F2 — Runner-neutral Verify and deterministic supervision

Implement AC-047-75–80 and AC-047-88–98.

- Give GitHub Actions the required history and add a typed topology preflight.
- Remove productive runner lookup from generic onboarding, Advisor, V4, E2E,
  and review tests; inject deterministic adapters.
- Keep mandatory offline adapter conformance separate from explicitly selected
  live certification.
- Harden finalized Critic trace replacement detection and portable onboarding
  rollback identity.
- Do not import a Sprint-only worker supervisor into Core. If a supervisor is
  actually adopted, require generation/event-based heartbeat conformance and
  deterministic clock fixtures.

Focused evidence: clean runner-free Ubuntu Core Verify, adapter conformance,
trace replacement including inode reuse, foreign rollback preservation, and
repeated platform heartbeat tests where applicable.

Owned production paths: `.github/workflows/verify.yml`,
`harness/scripts/verify.mjs`, the onboarding/Advisor runtime seams selected by
the failing matrices, `plugins/pipeline-core/scripts/codex-critic-isolation.mjs`,
`plugins/pipeline-core/lib/project-onboarding-v3.mjs`, and only the exact
shipped-supervisor paths proven present in the accepted candidate. No Sprint
branch file is an input.

Required focused commands:

- `node plugins/pipeline-core/scripts/codex-critic-isolation.test.mjs`
- `node plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`
- `node plugins/pipeline-core/scripts/project-onboarding-e2e.test.mjs`
- `node plugins/pipeline-core/scripts/codex-advisory-bootstrap.test.mjs`
- `node harness/scripts/verify.mjs`

### F3 — Exact main publication

Implement AC-047-69–74 after candidate/evidence semantics from F2 are stable.

- Extend the existing publication bundle/authority state machine with one
  fixed executor.
- Consume one exact `push-authorized` record, revalidate the remote preimage
  and fast-forward relation, and execute no caller-selected Git surface.
- Resolve ambiguity by readback without automatic retry.
- Keep raw Git, GG-03, and generic Human override closed.

Focused evidence: isolated disposable remotes covering success,
already-published convergence, stale CAS, replay, crash/ambiguity, every
forbidden ref/update shape, and exact alternates-disabled readback.

Owned production paths: `plugins/pipeline-core/lib/publication-bundle.mjs`,
`plugins/pipeline-core/lib/publication-authority.mjs`, a new fixed
`plugins/pipeline-core/scripts/publication-executor.mjs`,
publication-related regions of `plugins/pipeline-core/scripts/pipeline-state.mjs`
after F0 lands, `plugins/pipeline-core/hooks/guard-push.mjs`, #77 close
integration, release preflight, and adjacent tests.

Required focused commands:

- `node plugins/pipeline-core/lib/publication-bundle.test.mjs`
- `node plugins/pipeline-core/lib/publication-authority.test.mjs`
- `node harness/scripts/publication-state-authority.test.mjs`
- `node plugins/pipeline-core/scripts/publication-close-journal.test.mjs`
- `node plugins/pipeline-core/scripts/publication-executor.test.mjs`

### F4 — Provenance-consistent project-authority adoption

Implement AC-047-81–87 by extending the existing neutral migration rather than
copying another checkout.

- Version the `project/` authority classification.
- Bind source, installed-runtime provenance, destination, branch/upstream,
  cleanliness, compatibility, and target preimages.
- Preserve source and destination-owned semantics through the current
  plan/apply/recovery transaction.
- Emit a sanitized downstream adoption/adaptation receipt.

Focused evidence: existing 9-case authority suite plus clean, partial,
conflicting, stale-source, race, rollback/replay, unexpected-untracked, and
fresh-worktree qualification cases.

Owned production paths: `plugins/pipeline-core/lib/project-authority.mjs`,
`plugins/pipeline-core/scripts/project-authority-migration.mjs`, the
provenance observation in `plugins/pipeline-core/lib/project-onboarding-v3.mjs`,
the versioned authority/adoption receipt schemas, and adjacent tests. F4 starts
only after F0 releases these shared files.

Required focused commands:

- `node plugins/pipeline-core/lib/project-authority.test.mjs`
- `node plugins/pipeline-core/scripts/project-authority-migration.test.mjs`
- `node plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`

### F5 — Retained hotfix regression

Re-run focused suites for AC-047-01–68 (#63, #70, #71, #73, #77, and the
retained #80 implementation). Do not redesign passing surfaces merely to match
old Issue prose. Any regression is fixed within its current architecture.

### F6 — Integrated immutable candidate

After all slices are integrated:

1. synchronize PRD/Spec/plan and exact technical-spec digest;
2. freeze one commit/tree;
3. run all focused suites, runner-neutral Full Verify, and blocking Security;
4. obtain independent high-risk Critic review and disposition every finding;
5. update cachebuster/package version and repeat candidate-sensitive gates;
6. install and read back exact source/cache bytes in a fresh Codex process;
7. prove portable State contains no machine-local cleanup binding;
8. if separately approved, publish only through the fixed executor and perform
   exact remote readback; and
9. update/close GitHub Issues only through a separate explicit Issue operation.

## Stop conditions

Stop the affected slice on authority/digest drift, unexpected dirty paths,
unreachable evidence, private-data projection, ambiguous external effect,
non-green deterministic gates, or a required runtime capability reported as
unavailable. Never repair by direct portable-State edit, installed-cache
patching, generic Git override, force push, downstream Sprint copy/rebase, or
weakening a safety invariant.

## Rollback

Before any external publication, rollback is an ordinary reviewed revert of
the exact candidate. After a 0.4.7 writer changes portable/private authority,
downgrade is forbidden; freeze mutation and forward-repair through typed
0.4.7 transactions. Publication uncertainty is resolved only by exact remote
readback, never blind retry or history rewrite.
