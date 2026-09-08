# Workflow, worktree, hygiene, and bootstrap Governs coverage

The machine-written parser capture is
`scratch/NVA-B-ADR-GOVERNS-SESSION-7/raw-parser-capture.json`. It records the
exact parsed target lists, header-stripped baseline proof, status rows, and the
observed global count. `scratch/NVA-B-ADR-GOVERNS-SESSION-7/check.mjs` writes
that capture and checks it against fixed baseline
`58f0a2e262750b021543adac5a9e9643de030e6b`.

The prior green capture remains preserved at
`scratch/NVA-B-ADR-GOVERNS-SESSION-7/check-capture-before-rework.md`, with its
then-current raw parser output at
`scratch/NVA-B-ADR-GOVERNS-SESSION-7/raw-parser-capture-before-rework.json`.
The terminal capture after the narrow review corrections is
`scratch/NVA-B-ADR-GOVERNS-SESSION-7/check-capture-terminal-rework.md`; it
references the refreshed current raw parser capture above.

## ADR-0007 — workflow write preconditions

- `policies/model-policy.md`, `harness/checklists/session-start.md`, and
  `harness/checklists/goldfish-dispatch.md` retain the current per-task opt-in
  and dispatch publication; they are the policy/checklist owners, not an
  implied provider launcher.
- `workflow-writer-preflight.mjs` is the current deterministic owner of mode,
  tight command/path allowlists, guard and isolation capability requirements;
  its direct test exercises those rejections and admissions.
- `workflow-runner-boundary.mjs` is the sole provider-neutral synthetic adapter
  boundary and invokes the preflight before an adapter; its direct test proves
  the boundary's no-invocation-on-rejection behavior.

No provider-specific workflow launcher or boundary caller is declared: no
tracked caller invokes `runSyntheticWorkflowDispatch`. The ADR itself defers a
real invocation engine, and the current boundary intentionally rejects
provider, network, credential, and transport inputs. The preflight's
capability envelope is therefore the current hard-control owner; it is not
misrepresented as proof that a deferred provider invocation exists.

`workflow-preflight.mjs` is deliberately absent: it gates AFK operations
through `afk-review.mjs`; it neither publishes the per-task `ultracode` opt-in
nor validates the workflow writer envelope. The live `workflow-dispatch.md`
reference publishes Workflow-tool dispatch behavior, but is a bounded
operational reference rather than the ADR's keyword and write-precondition
source; the policy/checklist and writer-boundary owners are therefore the
declared coverage.

## ADR-0008 — committed permissions and calibrated write isolation

- `.claude/settings.json` is this repository's committed permission binding;
  `.claude/pipeline.json` is its live calibration. `guardrails/git.md` and
  `roles/goldfish.md` publish the canonical per-project rule.
- `templates/CLAUDE.project.md` and `templates/pipeline.json.example` are the
  canonical project-facing sources for a fresh repository, rather than a
  generated plugin copy.
- `worktree-lifecycle.mjs` plus its direct test own safe worktree lifecycle
  state; `worktree-create.mjs` and its direct test own the calibrated creation
  path.

No separate `guard-worktree-isolation` file is declared because no such current
runtime source exists. The ADR's historical three-project dossier follow-up
resolved those dossiers to `worktree: off`; this repository's current
`.claude/pipeline.json` instead says `worktree: "optional"`. Lifecycle support
remains a capability, not evidence of a blanket mandate.

## ADR-0009 — historical hygiene and current compact handling

- `roles/elephant.md`, `roles/goldfish.md`, `guardrails/token-budget.md`, and
  `harness/session-bootstrap.md` publish the remaining role and boundary
  discipline; `docs/operating-model.md` and `policies/model-policy.md` retain
  the normative lifecycle and MP-19 context-window duty.
- `pipeline-start/SKILL.md` publishes normal re-entry. `close-block/SKILL.md`
  owns only the separately selected durable-stop/runtime-transfer ritual, so
  it is declared to prevent a planned handover cut being falsely represented
  as a block close.
- `hooks.json` wires the live hook behavior. `post-compact-reground.mjs` and
  its direct test own compact re-grounding. `stop-suggest.mjs` and its direct
  test own the advisory stop signal; `antigravity-stop-hook.mjs` is the native
  adapter for that runner.

The header deliberately does not describe historical wording as a live forced
cut: the current hook registration makes compaction re-grounding advisory and
does not re-bootstrap on compact.

## ADR-0010 — live bootstrap and re-entry

- `harness/session-bootstrap.md`, `templates/prompts/session-bootstrap-check.md`,
  and the canonical `pipeline-start` skill publish the protocol; the skill test
  covers the executable bootstrap contract.
- `pipeline-start-preflight.mjs` and its test own loaded-distribution identity,
  the returned next action, and readiness output. `onboarding-init.mjs` plus
  its test, and `project-onboarding-v3.mjs` plus its direct test, own the
  project onboarding/re-entry continuation.
- `v3-bootstrap-authority.mjs` plus its direct test validates the public V3
  bootstrap authority and its runtime projections. `guard-lifecycle-ready.mjs`
  plus its direct test is the live mandatory-check enforcement owner: it
  returns `GUARD-LIFECYCLE-NOT-READY` until bootstrap authority admits work.
- `onboarding-continuity.mjs`, `runner-profile-migration-v3.mjs`, and
  `runtime-projection-v3.mjs`, each with its direct test, own the current
  cross-runner re-entry continuity and projection contracts.
  `codex-onboarding-app-server.mjs` plus its test is the native Codex receipt
  owner; `antigravity-start-hint.mjs` is the corresponding native hint owner.
- `ruleset-source.mjs`, `bootstrap-payload-budget.mjs` plus its direct test,
  and `session-cleanup-recovery.mjs` plus its direct test own the current
  bootstrap identity/payload and session-lifecycle receipts.
  `ruleset-freshness.mjs` plus its test owns the explicit freshness observation.
  `hooks.json` wires `staleness-check.mjs` plus its direct test for
  startup/resume/clear; `codex-session-start-hint.mjs` plus its direct test and
  `antigravity-start-hint.mjs` are the current native runner adapters.

ADR-0008 and ADR-0010 are universal canon origins. Their generated plugin
copies are intentionally absent from these source headers: the parent performs
serial generation and consumer byte-identity checks after both ADR ownership
packages land.
