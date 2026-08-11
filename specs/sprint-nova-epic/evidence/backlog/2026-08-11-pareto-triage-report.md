# Backlog Pareto-triage report — 2026-08-11

PO decision (2026-08-11): general backlog (130+ items since 2026-07-19, mostly
predating the 0.5.4 test cycle) is suspected mostly stale. Requested a
Pareto-style triage — fast per-item spot-check, not exhaustive re-verification —
classifying each `status: open` item into STILL-OPEN-REAL / STALE-SHOULD-CLOSE /
SUPERSEDED-SHOULD-DROP, presenting only the result to the PO. Delegated to six
parallel `general-purpose` background agents, one per date-range slice. This
file is the durable record of all six agents' full findings (verbatim from
their subagent transcripts), persisted before any status changes are applied.

No file edits, ledger reconciliation, or status-field changes have been made
yet. This is the investigation output only — PO ratification per item/bucket
is still required before `reconcile-backlog-ledger.mjs --activate` runs.

## Aggregate totals

| Batch | Range | Total | Still-open | Stale | Superseded |
|---|---|---|---|---|---|
| 1 | 2026-07-25 → 2026-08-06 | 12 | 11 | 1 | 0 |
| 2 | 2026-08-10 → 2026-08-11 | 16 | 11 | 4 | 1 |
| 3 | 2026-08-09 | 23 | 15 | 8 | 0 |
| 4 | 2026-08-07 | 23 (24 matched, 1 excluded false-positive) | 20 | 3 | 0 |
| 5 | 2026-08-08 part A (items 1-24 alphabetical) | 24 | 17 | 7 | 0 |
| 6 | 2026-08-08 part B (items 26-48 alphabetical) | 23 | 14 | 9 | 0 |
| **First-pass total** | | **121** | **88** | **32** | **1** |
| Item 25 (coverage gap, confirmed by second pass) | 2026-08-08 | 1 | 0 | 1 | 0 |
| **Final total (post second-pass)** | | **122** | **88** | **33** | **1** |

**Coverage gap — resolved.** Item 25 of the 2026-08-08 alphabetical sort,
`2026-08-08-po-language-is-set-without-asking-and-cannot-be-changed.md`, fell
between batch 5's range (1-24) and batch 6's range (26-48) — covered by
neither first-pass agent's assigned scope. The second-pass verification agent
(see below) gave it a full independent classification: **STALE-SHOULD-CLOSE,
confirmed**. `--language <de|en>` is now a required, validated CLI flag at
kickoff (`project-onboarding-v3.mjs:114`), and the live `kickoff-apply`
handler threads the PO's real answer through `correctSeededKickoffLanguage()`
(landed via commit `1174512b`, 2026-08-10) — attributed in-code to a
different, more specific item (`language-selection-scope-is-unclear-and-arrives-too-late`),
but this item's own described defect is fully subsumed.

**Selector false-positive risk — checked, not repeated in the re-verified set.**
The second-pass agent ran `rg -n "^status:"` against the frontmatter block of
all 19 items it covered: every one carries a genuine `status: open` inside
the YAML header at line 6. No further false positives found (the one caught
by batch 4 remains the only confirmed instance).

**Selector caveat:** the underlying selector (`rg -l "status: open" backlog/items`)
matches body prose as well as frontmatter. Batch 4 caught one instance
(`2026-08-07-onboarding-restart-flow-is-codex-only-not-runner-aware.md`,
frontmatter `status: closed`, matched only because its own Triage prose
quotes the old status) and excluded it before classifying. Batch 1 explicitly
re-verified its batch against this same risk and found its original 12-item
set already correct. The other batches did not report re-deriving from
frontmatter alone; the risk is not ruled out further than what's recorded
here.

---

## Batch 1 — 2026-07-25 → 2026-08-06 (12 total, 11 open, 1 stale, 0 superseded)

**Method note:** Verified batch completeness against the concern about quoted
`status: "open"` frontmatter — checked all 23 files in the date range
directly; the 11 files outside the original `rg -l "status: open"` batch are
genuinely `status: closed` or `status: in_progress` (not open), so the
original 12-item batch is complete and correct.

### STALE-SHOULD-CLOSE

`backlog/items/2026-07-29-guard-lifecycle-ready-blocks-claude-memory-writes.md`
— Core defect fixed: `guard-lifecycle-ready.mjs:624-675` now implements
`claudeSessionMemoryDirectory()`/`isClaudeSessionMemoryWritePath()`
(MEMPATH-1), deriving the memory directory from `transcript_path` exactly as
the item's 2026-08-08 PO-decision addendum prescribed, with a doc comment
explicitly citing this backlog item. Caveat worth a follow-up look: the
addendum's "runner parity is owed, not optional" (Codex counterpart)
sub-condition has no visible confirmation in the guard file — worth a
narrower fresh item if that inventory was never done, but the item's own
title claim (Claude memory writes blocked) is resolved.

### SUPERSEDED-SHOULD-DROP

None in this batch.

### STILL-OPEN-REAL

- `2026-07-25-managed-onboarding-success-contract.md` — still applies; a
  success-contract test exists (`project-onboarding-e2e.test.mjs:215`,
  host-managed layout, full inspect/plan/apply/readback) but that's the
  single 0.4.4 instance the item's own Description already takes as given —
  no standing rule was added to `guardrails/quality-gates.md` or onboarding
  acceptance guidance requiring this for every future host-layout addition,
  which is the item's actual proposal.
- `2026-07-25-po-gate-authority-receipt-readback.md` — ambiguous, needs a
  closer look: `docs/state.md:5987/6033` itself still calls the underlying
  race "UNCONFIRMED" with the chase deliberately stopped; the absorbing item
  (`windows-private-state-assurance`) closed 2026-07-24, before this item's
  second 2026-07-25 repro, with no evidence the specific receipt-race was
  addressed.
- `2026-07-27-recovery-preview-ack-unstable-getter-poisons-replay-ledger.md`
  — still applies, unaddressed: `acknowledgementId` still read 3x without a
  local snapshot at `recovery-preview-attestation.mjs:100,105,112`.
- `2026-07-27-runtime-projection-v2-eager-manifest-load.md` — still applies,
  unaddressed: `FROZEN_OWNED_KEYS` still loaded eagerly at module scope,
  `runtime-projection-v2.mjs:72-73`.
- `2026-08-02-unified-human-authorization-ux.md` — still applies per its own
  Triage; confirmed no Passkey/WebAuthn adapter, no "adoption-check" gate,
  `approve-plan` still unbound.
- `2026-08-05-claude-dir-leftovers-defeat-runner-neutral-project-migration.md`
  — narrowed and still applies: the 5 files its own Triage listed
  (`close-block/SKILL.md`, `goldfish-{mechanic,implementor,deep}.md`,
  `SETUP.md`, `PIPELINE_FLOW.md`) still hardcode `.claude/pipeline.json`,
  confirmed unchanged.
- `2026-08-05-claude-has-no-start-time-opt-in-adoption-path.md` — still
  applies: only `codex-session-start-hint.mjs` exists; no Claude-equivalent
  bare-repo adoption hint.
- `2026-08-05-critical-human-proof-not-wired-to-push-and-prd-gates.md` —
  narrowed and still applies: `approve-plan` (`pipeline-state.mjs:5065-5124`)
  still takes a bare `--by <name>` with no Ed25519 binding (step 3 of its
  Triage).
- `2026-08-06-local-plugin-install-attestation-does-not-bind-external-marketplace-root.md`
  — still applies: `localPluginInstallSourceObservation` still only hashes
  this checkout's own manifest/tree, never the external
  `agent-pipeline-local` marketplace root; the honesty-text disclosure at
  line 720 confirms the gap is still live, not closed.
- `2026-08-06-neutral-authority-tier-is-a-frozen-snapshot-the-compiler-never-updates.md`
  — narrowed and still applies: `runtime-projection-v3-owned-keys.json`
  targets only list `.claude/*`/`.codex/*`, no `project/*` write target (step
  3 of its Triage).
- `2026-08-06-no-gate-is-tested-end-to-end-for-satisfiability.md` — narrowed
  and still applies: `grep -rl "gate-walk"` matches only the item itself (no
  generalized framework), and `guardrails/quality-gates.md` has no "test what
  the change altered" rule.

---

## Batch 2 — 2026-08-10 → 2026-08-11 (16 total, 11 open, 4 stale, 1 superseded)

### STALE-SHOULD-CLOSE

- `2026-08-10-verify-authorship-defaults-to-source-markers-not-behavior.md` —
  the item's own primary named fix target, `templates/prompts/goldfish-task.md`
  field 3, now contains the proposed rule verbatim (lines 124-131:
  "Behavioral acceptance criteria need a behavioral check... A marker check
  remains entirely appropriate for non-behavioral facts").
- `2026-08-10-push-approval-signature-commands-also-line-wrap.md` — fixed by
  commit `28818f16` ("render authorize-critical's push command bounded and
  copy-safe"); `push-approval.md` lines 122-137 now instruct calling
  `authorizeCriticalPushCommand({...})` for a bounded `copyCommand`, and that
  exported function exists at `po-human-approval.mjs:487` in the current
  working tree.
- `2026-08-10-approval-authority-setup-echoes-generic-values-not-supplied-ones.md`
  — `po-human-approval.mjs` lines 632-645 (comment cites "GF-104") now fail
  loudly with an explicit "authority record already exists under a different
  name/key-reference" message instead of silently discarding supplied values
  and returning unqualified success — exactly proposal option (a).
- `2026-08-11-worktree-isolated-dispatch-leaves-an-untracked-dir-that-blocks-verify.md`
  — item's own Triage section records "accepted (direction 1 only)...
  immediate, this block (GF-113)"; confirmed `.gitignore:15` now contains
  `.claude/worktrees/`.

### SUPERSEDED-SHOULD-DROP

- `2026-08-10-git-identity-warn-only-diagnostic-does-not-meet-po-expectation.md`
  — its premise ("identity check is a passive warn-only diagnostic") no
  longer holds: GF-103 replaced `authorIdentityDiagnostics` with a real
  `collect-input` ask-step (`project-onboarding-v3.mjs:3733`, comment cites
  this exact backlog file). The residual defect is a different one (the
  ask-step doesn't reach the live CLI path) and is fully owned by the
  separate, more specific item
  `2026-08-10-git-identity-ask-step-unreachable-through-live-cli-path.md`
  (confirmed still open below, accepted triage, due 2026-08-17) — drop this
  one, keep that one.

### STILL-OPEN-REAL

- `2026-08-10-preimage-repin-disclosure-incomplete-for-roles-critic.md` —
  `roles/critic.md` pin still stale (`7bdcc71d…` pinned vs. actual
  `8d7919f9…`), and the test's assert loop still fails fast, with
  `harness/review-protocol.md` ordered before `roles/critic.md` in
  `EXPECTED_PATHS` — still masks the second stale pin.
- `2026-08-10-plugin-package-should-vendor-canon-references-via-build-step.md`
  — no generator/build-step script found; item's own Triage says "deferred
  in execution," due 2026-08-24 not yet reached.
- `2026-08-10-no-rename-path-for-a-feature-id-continuity-already-fixed.md` —
  item's own Triage: "deferred" — no rename mechanism built, by design.
- `2026-08-10-docs-state-md-sync-ignores-calibration-configured-handover-path.md`
  — `syncStateMdNextAction` (`onboarding-continuity.mjs:3257`) still
  hardcodes `docs/state.md`; its own doc comment still states "a project
  whose calibration configures a different handover path is out of scope for
  this mechanism."
- `2026-08-10-compare-three-parallel-happy-path-tests-in-detail.md` — no
  comparison artifact found; deferred idea item, not yet done.
- `2026-08-10-prd-spec-depth-collapses-relative-to-design-input.md` — no
  PRD-completeness gate or follow-up-dialogue mechanism found in
  `kickoff-design.md`; still applies, unaddressed.
- `2026-08-10-git-identity-ask-step-unreachable-through-live-cli-path.md` —
  confirmed via direct code read: `applyLifecycle`'s
  `operation === "portable"` branch (`project-onboarding-v3.mjs:4236`) still
  calls `applyProjectOnboardingV3` and discards its return value, then
  returns a fresh `v4Inspection`; still applies exactly as described.
- `2026-08-10-happy-path-turn-and-wall-clock-cost-is-not-externally-defensible.md`
  — broad systemic cost item, no fix designed; still applies.
- `2026-08-10-agent-never-asks-po-for-key-directory-invents-one-instead.md` —
  `po-human-approval.mjs` already fails cleanly on a missing `--directory`
  (line 345), but `push-approval.md`/`SKILL.md` still lack any explicit "ask
  the PO" stop-and-ask instruction for this case — the agent-facing half of
  the fix is still missing.
- `2026-08-11-backlog-ledger-baseline-migration-commit-unreachable.md` —
  item's own Triage: "accept-open," explicitly left for PO/maintainer
  review, not fixed.
- `2026-08-11-benchmark-fixture-digest-binding-does-not-cover-executed-workload-code.md`
  — Triage section empty; freshly filed 2026-08-11 (this session's own F4
  Critic finding), not yet actioned.

---

## Batch 3 — 2026-08-09 (23 total, 15 open, 8 stale, 0 superseded)

### STALE-SHOULD-CLOSE

- `2026-08-09-onboarding-sends-every-agent-to-a-directory-the-project-does-not-ignore.md`
  — `project-onboarding-v3.mjs`'s `PROJECT_IGNORE_SEED` now writes
  `.gitignore` with `/scratch/`, `/evidence/`, `/project/pipeline-state.json`
  when absent, and `SKILL.md:57` now says "Onboarding writes a `.gitignore`
  ignoring `/scratch/`..." — exact opposite of the claimed gap.
- `2026-08-09-decouple-hosted-project-document-language-from-operator-facing-language.md`
  — `documentLanguage` is now implemented end-to-end in
  `continuity-state.mjs`, `po-gate-authority.mjs`, `pipeline-state.mjs`, and
  `onboarding-continuity.mjs`, matching the item's own proposed design
  almost line-for-line.
- `2026-08-09-a-verify-gate-suite-fails-on-where-a-second-boundary-falls.md`
  — item's own "## Fixed" section is confirmed: `guard-push.test.mjs:432-433`
  has the exact `withoutCommit` normalization it describes.
- `2026-08-09-a-warn-security-gate-hard-blocks-every-push.md` — item's own
  "## Fixed" section confirmed: `guard-push.mjs:1808-1809` now computes
  `pushBlocking`/`securityBlocking` independently per gate mode.
- `2026-08-09-goldfish-critic-dispatch-truncation-costs-recurring-recovery-time.md`
  — Triage section already records "consolidate" into
  `2026-08-08-long-dispatches-truncate-before-emitting-their-report.md`,
  dated 2026-08-11, never applied to the frontmatter.
- `2026-08-09-guard-lifecycle-ready-runner-allowlist-incomplete.md` —
  `guard-lifecycle-ready.mjs:1314-1332` now admits the `--runner` tail for
  `confirm-privatization`, `apply-recovery`, `apply-privatization`, and
  `cleanup`, exactly as directed.
- `2026-08-09-setup-promises-a-human-name-repair-it-cannot-perform.md` —
  `po-human-approval.mjs:620-630` now upgrades `trust-policy.json` with
  `humanName` when `--human-name` is supplied against a pre-SETUP-1 record.
- `2026-08-09-the-promotion-supersedes-the-handover-and-leaves-it-saying-otherwise.md`
  — instance 2 was already fixed per the item's own record; instance 1
  (handover promotion target) is also now implemented
  (`onboarding-continuity.mjs` `PROMOTION_TARGET_KEYS.handover`,
  `promotionHandoverContent()`, `promotion-handover-published` crash point).

### SUPERSEDED-SHOULD-DROP

None.

### STILL-OPEN-REAL

- `2026-08-09-the-security-scan-looks-for-its-license-allowlist-in-the-pipelines-own-repository.md`
  — still applies: `DEFAULT_GOVERNANCE_POLICIES_PATH = "governance/examples/policies"`
  and SKIPPED license-check still defaults `classification` to
  `"scanner_error"` (`security-scan.mjs:443`).
- `2026-08-09-elephant-writes-production-code-directly-without-a-goldfish-dispatch.md`
  — still applies, unaddressed.
- `2026-08-09-agents-read-the-pipelines-source-because-nothing-describes-its-interface.md`
  — still applies; `submit-plan`/`approve-plan`/`set-phase` still absent from
  `SKILL.md`.
- `2026-08-09-project-reset-does-not-classify-the-proof-policy-artifact.md` —
  still applies: no mention of `critical-human-proof.json`/
  `push-threat-model.md` anywhere in `project-reset.mjs`.
- `2026-08-09-two-minor-happy-path-retries-in-the-final-codex-run.md` — still
  applies, unaddressed.
- `2026-08-09-what-the-claude-greenfield-run-adds-to-the-happy-path-findings.md`
  — ambiguous compound report: its point 3 (`--help` missing) is already
  fixed (`pipeline-state.mjs:5884-5896`, comment explicitly cites this exact
  incident), but points 1/4/5 (late language-gate firing, authority-staleness
  ordering, missing git-identity onboarding) show no evidence of a fix —
  kept open, needs a closer look at whether the fixed sub-point warrants a
  partial-close note.
- `2026-08-09-guard-denial-escalates-benign-commands-to-human-in-terminal.md`
  — still applies, and directly reproduced live in this very investigation
  session (benign `rg`/pipe commands triggered
  `GUARD-OPERATOR-UNAPPROVED`/`GUARD-PARSE-UNSUPPORTED` escalating straight
  to `external-operator-required`).
- `2026-08-09-bootstrap-and-kickoff-teach-their-own-constraints-only-by-live-rejection.md`
  — still applies; none of the six named constraints appear in `SKILL.md`.
- `2026-08-09-codex-read-only-steps-escalate-individually-instead-of-once.md`
  — still applies; no Codex sandbox-mode recommendation found in docs.
- `2026-08-09-codex-restart-cannot-recover-operational-context-from-its-own-prior-transcript.md`
  — correctly still open: Triage explicitly says "Deferred, not declined,"
  pending the PO's next live Codex test.
- `2026-08-09-restart-resume-hint-write-misses-the-project-prefix.md` — still
  applies: the refusal path still falls through to the generic `blocked()`
  with no path-specific hint.
- `2026-08-09-kickoff-promotion-cleanup-readback-has-no-in-session-recovery.md`
  — still applies; item's own text states "Direction 1–3 stay open
  regardless" of the related rework.
- `2026-08-09-the-dispatch-record-does-not-bind-to-the-commit-it-vouches-for.md`
  — still applies; no mechanical trailer-to-record binding check found
  anywhere in the plugin.
- `2026-08-09-critical-push-signing-ceremony-gives-no-path-feedback.md` —
  still applies: no write-path console output and no "did you mean"
  suggestion in `po-human-approval.mjs`.
- `2026-08-09-critical-human-proof-policy-seeded-without-trust-anchor.md` —
  still applies; `pipeline-state.mjs:2754-2756` still silently skips the
  check when `trustAnchor` is null, no TOFU pinning or disclosure added.

---

## Batch 4 — 2026-08-07 (24 matched, 1 excluded, 23 classified: 20 open, 3 stale, 0 superseded)

**Out of scope (not counted):**
`2026-08-07-onboarding-restart-flow-is-codex-only-not-runner-aware.md` —
frontmatter `status: closed` (line 6); the `rg` hit was a body-text false
positive (Triage prose: "Left `status: open`, untriaged"). Same
false-positive pattern likely affects other date batches using this
selector.

### STALE-SHOULD-CLOSE

- `2026-08-07-guard-lifecycle-ready-rejects-plan-runtime-intent-argv.md` —
  fixed: `withoutRunnerFlag` (guard-lifecycle-ready.mjs:1218) now
  scans/removes `--runner` anywhere in the arg array, and the `plan*` branch
  (:1245-1249) accepts the 5-token `--intent` form exactly as the item's own
  corrected proposal specified.
- `2026-08-07-onboarding-ready-path-unconditional-restart-barrier-read.md` —
  the unconditional `readRestartBarrier` call is now gated behind
  `if (!requiresNativeRuntimeReadback(runner)) return afterRuntimeLifecycleResult(...)`
  (project-onboarding-v3.mjs:3544-3556), landed in commit `864c7f1f`
  (verified via `git log -S`), after this item's last Triage note
  ("accept-open", 2026-08-07).
- `2026-08-07-absent-runner-flag-silently-defaults-to-codex.md` — fail-closed
  (candidate 1) fully implemented: no `runner = "codex"` defaults remain, a
  typed `ONBOARDING-RUNNER-REQUIRED` error exists
  (project-onboarding-v3.mjs:200), and the regression test itself was
  inverted per the Triage's mandate —
  `test("omitting --runner is a caller error, not a silent Codex default", ...)`
  now exists at line 1632 (was previously named the opposite).

### SUPERSEDED-SHOULD-DROP

None.

### STILL-OPEN-REAL

*Confirmed by explicit recorded Triage decision still standing open:*

- `2026-08-07-agent-tool-isolation-worktree-snapshots-stale-upstream-ref.md`
  — Triage "accept-open," reconfirmed 2026-08-11 by an independent
  recurrence (harness-level, not fixable in this repo).
- `2026-08-07-adr-0047-numbering-collision.md` — Triage "deferred to Phoenix
  sprint" (2026-08-11); both `docs/adr/0047-*.md` files still exist,
  collision still live.
- `2026-08-07-greenfield-onboarding-writes-mixed-authority-tiers.md` —
  Triage explicitly "Stays OPEN" (2026-08-08).
- `2026-08-07-native-windows-verify-red-suite-class.md` — Triage
  "accept-deferred" (2026-08-07); no native-Windows remeasurement has
  happened since.
- `2026-08-07-push-release-flow-unusable-for-third-party-adopters.md` —
  Triage "accept-open, partially addressed" (docs written; candidates #2-#4
  still open PO calls).
- `2026-08-07-gs6-blocks-inert-plugin-metadata-in-self-hosted-sessions.md` —
  Triage "accept-open" (2026-08-07); `insideLivePlugin`/`LIVE_PLUGIN_RULE`
  still treat `plugin.json` and guard code identically.
- `2026-08-07-mp22-orchestrator-self-implementation-has-no-enforcement.md` —
  actively growing: a 4th instance was recorded 2026-08-10, PO explicitly
  deferred fixing it ("akzeptieren wir erst mal ... backlog").

*Confirmed by direct code check, no fix present:*

- `2026-08-07-human-authorization-prompts-ignore-the-configured-language-profile.md`
  — `requireExplicitConfirmation`/`CONFIRMATION_TOKEN` in po-human-approval.mjs
  still hardcoded English, no `humanFacingLanguage` wiring.
- `2026-08-07-technical-lock-for-pipeline-consent-before-onboarding-complete.md`
  — no consent-lock `PreToolUse` hook exists anywhere in
  `plugins/pipeline-core/hooks`.
- `2026-08-07-lifecycle-guard-does-not-know-the-human-signing-commands.md` —
  `isHumanPoSigningCommand` list unchanged: still exactly
  `["setup", "approve", "approve-all"]`, missing
  `approve-critical`/`sign-intent`/`authorize-critical`.
- `2026-08-07-handover-file-has-no-rotation-obligation.md` — `docs/state.md`
  has grown from ~4,500 to 6,517 lines; no rotation mechanism exists.
- `2026-08-07-session-scratchpad-is-unwritable-under-the-cross-repo-guard.md`
  — no scratchpad/scratch exception in `isProjectWritePath`/
  `GUARD-CROSS-REPO-MUTATION`.
- `2026-08-07-unregistered-suite-is-red-and-invisible-to-verify.md` —
  `codex-isolated-critic-protected-preimage.test.mjs` still absent from
  `verify.mjs`'s registration.
- `2026-08-07-codex-critic-isolation-fixture-rejects-merge-commit-head.md` —
  `buildExactFixture`'s single-parent check unchanged; test file still
  derives `candidateCommit` from this real repo's live `HEAD` (resolved 3
  dirs up), same defect shape as filed.

*Partially fixed — still STILL-OPEN-REAL, noted by half:*

- `2026-08-07-a-promoted-feature-can-never-pass-the-plan-gate.md` — half
  fixed: `promotionInput` now explicitly rejects `planPath === specPath` and
  requires `planPath === prdPath` (onboarding-continuity.mjs:3849-3853),
  resolving the kickoff/plan-gate contradiction. Unfixed: `gateConfig`
  (manifest.mjs:793-799) still returns `null` when a manifest has no `gates`
  section, so a fresh project's plan gate is still inert by default — the
  PO-facing symptom ("never asked for approval") depends on this half.
- `2026-08-07-agent-definitions-pin-the-review-tier-model.md` — both
  `critic.md` and `goldfish-deep.md` still carry `model: sonnet` in
  frontmatter (design intent documented as "Elephant passes model as
  invocation parameter," matching candidate 1, but that was already true
  before the incident). The effort-channel gap is confirmed still open: the
  `Agent` tool schema itself exposes only `model`, no `effort` parameter.
  `goldfish-deep.md` still has no route-mismatch self-report requirement
  (unlike `critic.md`, which already had one at filing time).
- `2026-08-07-parallel-goldfish-dispatches-race-on-shared-checkout.md` —
  partially mitigated: `templates/prompts/goldfish-task.md` now allows
  per-task `dispatch-record-{{TASK_ID}}.json` naming (candidate 1). Not
  addressed: no prohibition on unverified `git reset` self-correction by a
  Goldfish (candidate 4), no revision to the `Worktree: no` heuristic
  (candidate 3).
- `2026-08-07-human-approval-ux-directory-clarity-and-single-command.md` —
  partially fixed: key-directory auto-remembering landed as "PO-KEYDIR-01(A)"
  (2026-08-11, `po-human-approval.mjs:88-100`), addressing proposal #1's
  spirit. Not addressed: `sign-intent`'s USAGE line still has no `--request`
  flag (proposal #2, opaque digest-only confirmation), and no human/agent
  command-boundary documentation exists yet (proposal #3).
- `2026-08-07-maintenance-window-selectivity-is-untested-at-both-levels.md` —
  library-level selectivity gap is closed: `guard-maintenance-window.test.mjs`
  GMW03 (line 193) now asserts a window scoped to `["GS-6","TP-1"]` reports
  `covered: false` for `TP-2`, exactly the case the item asked for.
  Hook-level gap remains: `guard-testpath.test.mjs` still only has TP07
  (happy path, no file) and TP09 (pure happy path), no negative case (window
  scoped to one TP rule, edit matches a different TP rule, must stay
  refused).

---

## Batch 5 — 2026-08-08 part A, items 1-24 alphabetical (24 total, 17 open, 7 stale, 0 superseded)

### STALE-SHOULD-CLOSE

- `2026-08-08-a-guard-string-match-makes-a-file-uncommittable-by-any-agent.md`
  — `guard-lifecycle-ready.mjs`'s `GATE_STRENGTH_SHELL_SAFE_GIT_VERBS`
  allowlist (added citing "the PO's 2026-08-09 greenfield runs") now admits
  `git add/commit/diff/status/log/show/ls-files/check-ignore/check-attr`
  before the substring-match refusal fires — exactly Direction 2 from the
  item.
- `2026-08-08-a-promotion-freezes-a-prd-the-po-gate-will-reject.md` —
  `promotionArtifacts()` (`onboarding-continuity.mjs`) now checks both the
  language and spec markers *before* freezing, with a code comment
  explicitly saying this turns the old dead end into "a one-line refusal
  now, while the PRD is still freely editable"
  (`KICKOFF-PROMOTION-PRD-SPEC-MARKER-MISSING` /
  `-LANGUAGE-MARKER-INVALID`) — Direction 1+2 implemented.
- `2026-08-08-a-session-is-told-it-is-ready-but-never-how-to-repair.md` —
  `scripts/repair-map.mjs` + schema now exist, derived live from the real
  guard predicates ("is it liftable, by whom, exact command"), wired into
  `guard-lifecycle-ready.mjs`'s denial guidance and
  `templates/prompts/agent-obligations.md` — Direction 1 implemented.
- `2026-08-08-a-single-trust-anchor-makes-key-loss-and-teams-impossible.md` —
  `critical-human-proof-policy.mjs` now has a v3 `trustAnchors` (plural, SET)
  with absent/empty meaning "any well-formed key may sign" as the default
  posture — exactly Direction 1 ("optional anchor set").
- `2026-08-08-agents-are-judged-by-rules-no-artifact-ever-tells-them.md` —
  `templates/prompts/agent-obligations.md` now exists, explicitly
  "GENERATED from the guards themselves," covering the closed shell grammar
  and protected test paths, and is referenced from
  `goldfish-task.md`/`critic-review.md` — Direction 1+2 implemented.
- `2026-08-08-concurrent-dispatches-share-one-git-index-and-mis-attribute-each-others-work.md`
  — `goldfish-task.md` now mandates "Staging+commit is ONE bundled act" with
  explicit path lists, forbids `git add -A`/bare `git commit`, and its own
  prose names the exact "shared-index race" this item describes — Direction
  1 implemented.
- `2026-08-08-plan-path-guidance-is-attached-to-causes-that-are-not-plan-path-defects.md`
  — `po-gate-authority.mjs` now gives every cause group its own remedy
  string (`SPEC_REPAIR` for `PO-GATE-PRD-SPEC-MISMATCH`, `ENCODING_REPAIR`
  for the UTF-8 failure, `SNAPSHOT_REPAIR` for `PO-GATE-PLAN-DIGEST-STALE`,
  `PRD_REPAIR` only for genuine path defects) — full fix, beyond what the
  item's own snapshot (commit `b094cb5`) had done.

### SUPERSEDED-SHOULD-DROP

None found in this batch — every item still describes a live, relevant part
of the architecture.

### STILL-OPEN-REAL

- `2026-08-08-a-bounded-diagnostic-outside-the-repo-is-refused-under-the-wrong-reason.md`
  — still applies; `isBoundedReadOnlyPipeline`/`approvedReadPath` still
  require the read target inside root, so an outside-repo read still falls
  through to the misnamed `GUARD-OPERATOR-UNAPPROVED`.
- `2026-08-08-a-briefings-model-field-can-contradict-the-agent-it-dispatches.md`
  — still applies; `guard-dispatch.mjs`/`dispatch-policy.mjs` only check
  that *a* model is named (`DISPATCH-NO-MODEL`), never that it matches the
  dispatched agent's actual definition.
- `2026-08-08-a-dispatch-reported-creating-a-record-it-never-created.md` —
  still applies; `roles/goldfish.md` GF-09-D requires writing the dispatch
  record but no readback-confirmation step exists.
- `2026-08-08-a-git-repository-appears-although-the-plan-said-it-would-not.md`
  — ambiguous, needs a closer look; code gates `git init` behind
  `state.initializesGit` consistently, but the claim concerns fresh-directory
  behavior not reproducible here.
- `2026-08-08-a-guard-reclassification-changed-what-a-signature-can-lift.md`
  — still applies; `isNullDeviceStderrRedirect`/`hasExternalOutputRedirect`
  still skip the descriptor-2 null-device case exactly as described, and no
  reachability-axis decision has been recorded.
- `2026-08-08-a-hardening-round-cannot-register-the-suites-it-writes.md` —
  still applies; TP-3 still guards `verify.mjs` under signature mode with no
  batchable ceremony, and no "unregistered suite is loud" check exists (only
  a hand-written code comment).
- `2026-08-08-a-maintenance-window-signature-is-voided-by-an-unrelated-file-write.md`
  — still applies, confirmed by `docs/state.md` itself: "the working
  practice until it is fixed: let the tree fall quiet..." — explicitly not
  yet fixed.
- `2026-08-08-a-permitted-edit-drops-the-session-into-an-unrecoverable-readiness-class.md`
  — still applies as a general guard gap (no code refuses a write to an
  already-bound authority document); note its originally-observed *trigger*
  is gone since the companion item (PRD-marker promotion) is now fixed.
- `2026-08-08-an-agent-talks-itself-out-of-the-pipeline-and-starts-before-the-answer.md`
  — ambiguous, needs a closer look; no "unadopted-session contract" text
  found in `SKILL.md`, but the underlying scenario is behavioral and not
  reproducible in this (already-adopted) repo.
- `2026-08-08-an-authority-gate-is-bypassable-by-choosing-a-different-write-tool.md`
  — still applies; `hooks.json`'s own header comment confirms
  `guard-testpath.mjs` is wired only to `Edit|Write`, never to the
  `Bash|PowerShell` matcher, so a shell write still bypasses it.
- `2026-08-08-an-installing-consumer-is-never-asked-any-setup-decision.md` —
  still applies; a PO direction was recorded 2026-08-08 (machine/repo plane
  split) but `SKILL.md`'s bootstrap does not yet ask about push-approval
  mode, PO key setup, or routing for a fresh consumer — direction decided,
  not implemented.
- `2026-08-08-approved-but-not-implementing-refuses-every-write-and-asks-for-nothing.md`
  — still applies; `approve-plan`'s success path only prints "Plan
  approved... lifecycle=approved," never prompting for the required
  `set-phase --phase implementation` step.
- `2026-08-08-kickoff-apply-action-drops-the-runner-the-plan-was-made-for.md`
  — still applies, but mostly fixed: the file's own body records mechanisms
  A/B/C closed in `94b8a72` (runner now required via
  `planBoundApplyAction`, `APPLY-ACTION-RUNNER-REQUIRED`); item explicitly
  says it "stays open until the manifest-repair instance is triaged"
  (tracked in a sibling item outside this batch).
- `2026-08-08-long-dispatches-truncate-before-emitting-their-report.md` —
  still applies; this is the actively-worked canonical tracking item per
  `docs/state.md` (fresh 2026-08-11 Triage entry: "Decision: accepted —
  investigation resumes now"); fix (`NOVA-CLOSING-ALLOWANCE-01`) has since
  landed this session (see main `docs/state.md` record) — this item's
  frontmatter should be revisited once that landing is reflected.
- `2026-08-08-no-design-to-implementation-handover-exists.md` — still
  applies; no code path found that proposes `set-phase --phase implementation`
  as a `nextAction` when phase is `design` and status is `ready`.
- `2026-08-08-no-governed-directory-contract-so-every-session-invents-one.md`
  — still applies; no directory-layout ADR exists (checked
  `docs/adr/README.md`, `docs/state.md`); closest is ADR-0054 which is about
  authority precedence, not general layout.
- `2026-08-08-orchestrator-authored-production-commits-have-no-deterministic-control.md`
  — still applies; `commit-message-policy.mjs` only enforces the
  `AI-Assisted`/correlation-data half of GIT-03, no commit-type (GIT-01)
  check exists anywhere, and no upstream "dispatch ends with uncommitted
  diff" control was found.

**Files touched (read-only):** all 24 item files under
`backlog/items/2026-08-08-*.md` (first half alphabetically), plus reference
reads in `guard-lifecycle-ready.mjs`, `guard-command-grammar.mjs`,
`guard-gate-strength.mjs`, `guard-dispatch.mjs`, `dispatch-policy.mjs`,
`onboarding-continuity.mjs`, `project-onboarding-v3.mjs`,
`critical-human-proof-policy.mjs`, `po-gate-authority.mjs`,
`commit-message-policy.mjs`, `guard-maintenance-window.mjs`,
`scripts/repair-map.mjs`, `scripts/pipeline-state.mjs`,
`templates/prompts/goldfish-task.md`, `templates/prompts/agent-obligations.md`,
`hooks/hooks.json`, and `docs/state.md`.

---

## Batch 6 — 2026-08-08 part B, items 26-48 alphabetical (23 total, 14 open, 9 stale, 0 superseded)

### STALE-SHOULD-CLOSE

- `2026-08-08-seeded-verify-contract-is-always-green.md` —
  `project-onboarding-v3.mjs:1017-1028` now seeds `UNCONFIGURED_VERIFY`, a
  command that fails until configured, with an explanatory comment citing
  this exact defect history.
- `2026-08-08-shipped-artifacts-assume-the-pipelines-own-repository.md` — all
  four directions landed: `PUSH_THREAT_MODEL_DEFAULT_PATH =
  "project/push-threat-model.md"` replaced the hardcoded sprint path with a
  `materialize-push-threat-model` subcommand; `usage-ledger.mjs`/
  `model-prices.json`/`security-scan.mjs` moved under
  `plugins/pipeline-core/scripts/`; `close-feature/SKILL.md` now names
  plugin-relative paths; and `harness/scripts/check-consumer-safe-paths.mjs`
  is the Direction-4 build check the item called "the piece that matters
  most," with `SOURCE_ONLY_PREFIXES` and a reasoned allowlist exactly as
  described. The remaining `harness/scripts/...` mentions in
  `close-block`/`pipeline-start` are explicitly marked "Agent-Pipeline
  checkout only," which is the item's own accepted pattern, not a residual
  defect.
- `2026-08-08-the-authority-decision-apply-path-still-defaults-to-codex.md`
  — `pipeline-state.mjs:4574-4590` now resolves the runner explicitly via
  `resolvePoRebindRunner`; the comment names this backlog item by filename
  and states it closes the residue.
- `2026-08-08-the-blocking-push-gate-has-no-terminal-exception-boundary.md`
  — `guard-push.mjs` now has a terminal `try/catch(faultError)` around the
  blocking evaluation (~line 1639-1778); tests PG28/PG29/PG30 in
  `guard-push.test.mjs` are the exact fault-injection tests the item asked
  for.
- `2026-08-08-the-guard-refuses-the-bounded-diagnostic-its-own-skill-permits.md`
  — verified against checkout source (not the live/installed guard, which
  lags): `isBoundedReadOnlyPipeline(...)` at `guard-lifecycle-ready.mjs:840`
  admits the documented `rg | head` shape, and
  `GATE_STRENGTH_SHELL_SAFE_GIT_VERBS` (`:447`) now includes
  `"check-ignore"`/`"check-attr"`, closing the C3 contradiction. The
  empty-repo route-planning sub-finding is untested — worth a closer look
  before final close, but the headline contradiction is resolved.
- `2026-08-08-the-guard-refuses-the-recovery-the-inspection-prescribes.md` —
  C1, C2, C3 all fixed with code comments citing this item by name:
  rebind-planner admission now derives from the producer table
  (`:1386-1410`); `sha256sum`/`shasum` admit multi-path args (`:852-863`);
  `critic-dispatch-preflight.mjs` is in the gate-strength shell read-only
  exemption list (`:527-535`).
- `2026-08-08-there-is-no-sanctioned-way-to-start-over.md` — Triage already
  says "accepted, R1→R2→R3"; `discard-feature` (R1) is implemented in
  `pipeline-state.mjs` exactly per spec, and `scripts/project-reset.mjs`
  (R2/R3) exists and explicitly cites this backlog item, including the
  "derive the path set, don't hardcode it" requirement.
- `2026-08-08-three-smaller-greenfield-defects.md` — Triage section already
  records "Sections 2 and 3 are done... Section 1 residual accepted as
  declared," and `ADMITTED_RESIDUAL` exists in `resume-hint.test.mjs`
  matching that decision — a clean case of a filled-in Triage never applied
  to frontmatter.
- `2026-08-08-verify-evidence-has-a-schema-consumers-and-no-producer.md` —
  `scripts/verify-evidence-producer.mjs` now exists (A2), and
  `critic-dispatch-preflight.mjs:102-103` handles the root-commit case via
  `gitOrNull` + tree fallback (A3). Direction 5 (decide the verify contract)
  is satisfied by the same `UNCONFIGURED_VERIFY` change that closes
  `seeded-verify-contract-is-always-green.md` — the two were flagged to be
  resolved together and were.

### SUPERSEDED-SHOULD-DROP

None found in this batch.

### STILL-OPEN-REAL

- `2026-08-08-pre-existing-failure-is-a-claim-that-needs-evidence.md` —
  still applies; no evidence-for-"pre-existing"-claims rule found in
  `roles/goldfish.md`.
- `2026-08-08-runner-neutrality-must-hold-before-a-third-runner-lands.md` —
  still applies; AGY remains scattered prose in `docs/state.md`, no
  dedicated tracking item.
- `2026-08-08-temp-directories-leak-until-the-filesystem-refuses-every-write.md`
  — still applies; no prefix enumeration, cleanup guard, or shared
  fixture-cleanup helper found.
- `2026-08-08-the-authority-decision-offers-two-candidates-and-one-of-them-is-a-literal.md`
  — still applies; `selection: { status: "unavailable", ... }` literal
  unchanged at `pipeline-state.mjs:4203`, no code reference to this item.
- `2026-08-08-the-authority-gate-reads-the-worktree-so-its-verdict-need-not-survive-a-checkout.md`
  — still applies; `provenance: "current-physical-worktree"` unchanged, no
  divergence check added.
- `2026-08-08-the-bootstrap-skill-grows-by-budget-raise-instead-of-by-module.md`
  — still applies as deliberately deferred by PO; budget still 18,000, no
  modularization done yet.
- `2026-08-08-the-grammar-refusal-does-not-say-which-part-of-the-command-failed.md`
  — partially fixed at `53aa19a` (element-naming + retryActions for the
  `-m`-newline case); the item's own remaining gap — `retryActions: []`
  literal for `GUARD-OPERATOR-UNAPPROVED`/`GUARD-REDIRECT-UNAPPROVED` —
  confirmed still present at `guard-lifecycle-ready.mjs:1911`.
- `2026-08-08-the-harness-classifier-blocks-the-onboarding-action-the-pipeline-just-authorized.md`
  — still applies; no allowlist-entry decision found (this is a
  runner-classifier design question, not a code defect).
- `2026-08-08-the-scratch-cleanup-mechanism-exists-but-no-event-calls-it.md`
  — the second gap (dev-plan gate exemption) is addressed — SKILL.md now
  states `scratch/` is exempt "in every phase — including draft." The core
  finding stands: `retireOrphanScratchDescriptors` is only called from its
  own test file, nothing in bootstrap wires it.
- `2026-08-08-the-signed-guard-override-has-no-command-that-emits-the-digest-to-sign.md`
  — still applies; `guard-human-override.mjs` still exposes the same five
  commands, none emits the signable digest; `describeIntentRecord` still
  only resolves GMW requests, not HGO selections.
- `2026-08-08-the-signing-ceremony-is-designed-for-the-verifier-not-the-signer.md`
  — still applies; spot-checked findings 2 (`PO-APPROVAL-TRUST-MISMATCH`
  still bare) and the PO's requested single-entry-point wrapper script (none
  exists).
- `2026-08-08-the-test-path-guard-blocks-the-briefed-edit-and-offers-no-route.md`
  — still applies; `authorCandidate: true` still routes to
  `"author-repair-required"` rather than `"planned"` in
  `human-guard-override.mjs`, no briefed-test-change-authorization mechanism
  found.
- `2026-08-08-two-cheap-costs-a-skill-invoked-without-arguments-and-a-thirteen-step-bootstrap.md`
  — still applies; `critic-review/SKILL.md` has no early refusal on empty
  `$ARGUMENTS`.
- `2026-08-08-two-manifest-literals-still-bypass-the-single-seed-owner.md` —
  still applies; `LEGACY_CLASSIFIER_BASELINES`/`LEGACY_V3_RUNTIME_SEEDS`
  literals unchanged in `runner-profile-migration-v3.mjs`, no invariant
  check added.

**Batch-boundary note (self-reported):** assigned range was items 26-48 of
the 48 total 2026-08-08 open items (sorted alphabetically); batch 5's range
was 1-24. Item 25 fell in the gap between the two — see the coverage-gap
note in the aggregate section above.

---

## Second-pass verification (2026-08-11)

Per the PO's explicit follow-up ("danach die offenen gegen den Code
prüfen"), a targeted `general-purpose` agent re-checked the 19 items NOT
already resolved by a direct fresh code citation in the first pass: the 4
flagged "ambiguous, needs a closer look," 7 batch-4 items confirmed only by
their own recorded Triage note, 7 "partially fixed" items where the unfixed
half wasn't pinned down precisely, and the item-25 coverage gap. Investigation
only, no file edits or status changes.

### STALE-SHOULD-CLOSE (1)

`2026-08-08-po-language-is-set-without-asking-and-cannot-be-changed.md` —
defect fully resolved. `--language <de|en>` is now a required, validated CLI
flag at kickoff (`project-onboarding-v3.mjs:114`). The live `kickoff-apply`
handler (`applyProjectOnboardingKickoffV4`, `project-onboarding-v3.mjs:4403-4439`)
calls `correctSeededKickoffLanguage()` (lines 320-337) and
`initializeKickoffPoProfile()` (line 345). Landed via commit `1174512b`
(2026-08-10), 4 days after this item's filing. Attributed in-code to a
different, more specific item (`language-selection-scope-is-unclear-and-arrives-too-late`,
GF-079) — but this item's own described defect is fully subsumed. Corrects
the first pass's unconfirmed bonus spot-check to a confident close.

### STILL-OPEN-REAL (18) — all reconfirmed, corrections noted where found

1. `2026-07-25-po-gate-authority-receipt-readback.md` — `docs/state.md:5987-5988`
   still literally reads "UNCONFIRMED," root cause "not isolated." Explicitly
   NOT code-verifiable: a live Windows DACL/directory-durability timing race;
   this session runs on Linux/WSL and cannot reproduce or refute it.
2. `2026-08-08-a-git-repository-appears-although-the-plan-said-it-would-not.md`
   — narrowed via exhaustive check: `project-onboarding-v3.mjs` is the
   *only* production file anywhere that calls `git init`, both call sites
   strictly gated behind `initializesGit`. Rules out an undisclosed
   Pipeline-code initialization; a misleading field or out-of-band cause
   remains unrefuted — a live-session claim not resolvable by static reading.
3. `2026-08-08-an-agent-talks-itself-out-of-the-pipeline-and-starts-before-the-answer.md`
   — confirmed: no "unadopted-session"/"not yet adopted" text anywhere in
   `SKILL.md`, `roles/elephant.md`, or `docs/operating-model.md`. The
   proposed fix target (an explicit unadopted-session contract) is a
   documentation gap, confirmed absent.
4. `2026-08-09-what-the-claude-greenfield-run-adds-to-the-happy-path-findings.md`
   — compound item, resolved point-by-point: point 1 (late language-gate
   firing) now fixed (same `1174512b` mechanism as the item above); point 3
   (`--help`) already confirmed fixed by the first pass; points 4
   (authority-staleness ordering) and 5 (missing git-identity onboarding)
   remain unaddressed. Stays open (2 of 4 points unresolved), note point 1 fixed.
5. `2026-08-07-agent-tool-isolation-worktree-snapshots-stale-upstream-ref.md`
   — harness-level, not a repo-code defect; item's own "Update 2026-08-11"
   section records independent reconfirmation today.
6. `2026-08-07-adr-0047-numbering-collision.md` — both `docs/adr/0047-*.md`
   files confirmed still present; PO decision 2026-08-11 defers to Phoenix sprint.
7. `2026-08-07-greenfield-onboarding-writes-mixed-authority-tiers.md` —
   independently confirmed: `planProjectOnboardingV3`'s write-target list
   (`project-onboarding-v3.mjs:3694-3702`) includes only `project/pipeline.json`
   for calibration, not `.claude/pipeline.json`.
8. `2026-08-07-native-windows-verify-red-suite-class.md` — accept-deferred;
   this session cannot execute native-Windows Verify (Linux/WSL).
9. `2026-08-07-push-release-flow-unusable-for-third-party-adopters.md` —
   `docs/push-release-flow.md` confirmed to exist (candidate #1 done);
   candidates #2-#4 remain explicit PO-territory open calls.
10. `2026-08-07-gs6-blocks-inert-plugin-metadata-in-self-hosted-sessions.md`
    — sharper than first pass: `guard-gate-strength.mjs:246` explicitly
    excludes GS-6 from `recordHumanGuardDenial` (code comment: "Never GS-6...
    untouched"); its only lift route is an all-or-nothing Guard Maintenance
    Window, not the narrower per-file route the item's Proposal #2 asks for.
11. `2026-08-07-mp22-orchestrator-self-implementation-has-no-enforcement.md`
    — confirmed no enforcement mechanism exists anywhere (zero hits for
    dispatch-trailer verification in production code).
12. `2026-08-07-a-promoted-feature-can-never-pass-the-plan-gate.md` —
    confirmed exactly: `gateConfig` (`manifest.mjs:793-799`) returns `null`
    when `manifest.gates` is absent, line-for-line match with first pass.
13. `2026-08-07-agent-definitions-pin-the-review-tier-model.md` — confirmed
    `critic.md`/`goldfish-deep.md` both still `model: sonnet`; directly
    confirmed against the live `Agent` tool schema — no `effort` parameter exists.
14. `2026-08-07-parallel-goldfish-dispatches-race-on-shared-checkout.md` —
    `goldfish-task.md` has zero occurrences of "reset" (candidate 4
    unimplemented); the Worktree field still doesn't address shared-file
    exposure (candidate 3 unimplemented).
15. `2026-08-07-human-approval-ux-directory-clarity-and-single-command.md` —
    narrower than first pass found: proposal #1 landed; **correction:**
    proposal #3 (command-boundary docs) is actually done
    (`docs/po-human-approval.md:56-64`, commit `71f330db`) — only proposal #2
    (`sign-intent --request` flag) remains genuinely open, narrowing this
    from "2 of 3 missing" to "1 of 3."
16. `2026-08-07-maintenance-window-selectivity-is-untested-at-both-levels.md`
    — `guard-testpath.test.mjs` grew to TP01-TP13 but still no selectivity
    negative case (window scoped to one TP rule, edit matches a different one).
17. `2026-08-08-the-grammar-refusal-does-not-say-which-part-of-the-command-failed.md`
    — confirmed exactly: `guard-lifecycle-ready.mjs:1911` still passes
    literal `[]` for `retryActions` on `GUARD-OPERATOR-UNAPPROVED`/
    `GUARD-REDIRECT-UNAPPROVED`.
18. `2026-08-08-the-scratch-cleanup-mechanism-exists-but-no-event-calls-it.md`
    — confirmed `retireOrphanScratchDescriptors` has zero production
    callers; neither `pipeline.yaml` variant mentions "scratch" anywhere.

### Selector sanity check

`rg -n "^status:"` against the frontmatter block of all 19 files: every one
carries a genuine `status: open` inside the YAML header. No false positives
in this set.

### Second-pass summary

19 items re-verified: 18 STILL-OPEN-REAL (all reconfirmed; two evidence
refinements — item 15 narrowed from 2-of-3 to 1-of-3 missing proposals, item
4 noted one of its four points now fixed), 1 STALE-SHOULD-CLOSE (the item-25
coverage gap, now confirmed). Two items (1 and 2 above) have a residual
root-cause ambiguity that is explicitly a live-session/native-Windows claim
outside what static code reading can settle — their open status itself is
not in doubt (no fix has landed for either).
