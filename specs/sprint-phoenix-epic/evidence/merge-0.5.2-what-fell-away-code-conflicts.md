# Merge 0.5.2 — what fell away (code conflicts, origin/main wins)

Scope: the 28 files resolved verbatim to `origin/main` (Phoenix's version fully superseded, not blended) per the PO-approved conflict-resolution policy for the `sprint_phoenix` → `origin/main` merge (merge-base `9d1b3dc`, ours `998a609`, theirs `6e2c9b2`). For each file: what Phoenix added/changed since the merge-base that has no equivalent in `origin/main`'s resolved content.

## harness/lib/plan-spec-state-v2.mjs

**Phoenix-specific content lost:** Phoenix added a ledger-first `bindPlanSpecApprovalWithHumanDecision` transition (schema `pipeline.plan-approval.v3`) that binds a plan/spec approval to an independently-resolved `humanDecision` reference (`pipeline.human-decision-reference.v1`, validated by `validHumanDecisionReference`), requiring a `decisionId`/`decisionDigest`, a candidate commit/tree, and a `checkpoint` whose `streamId` must be `"human"` and whose `repositoryFingerprint` matches `poGateAuthority`. `revokePlanV2` was also extended (`validV3Approval`) to revoke a v3-approved state. Main's canonical file moved to `plugins/pipeline-core/lib/plan-spec-state-v2.mjs` with an entirely different, more advanced `pipeline.plan-approval.v4` lifecycle (submit/approve/seal/reopen/enter-implementation), but has zero occurrences of "human"/"cyborg"/"decisionId"/"decisionDigest" — no equivalent ledger-bound human-decision anchor exists anywhere in the merged tree.
**Assessment:** genuinely absent. FLAG: the PO-gate approval binding in main no longer requires or references an independently-verified human-attestation checkpoint before treating a plan as approved, removing the ledger-anchored guarantee that approval was bound to one specific verified-human decision at the admission boundary (the mechanism CLAUDE.md's own "PHX-2" push policy describes as the intended future authority path).

## harness/scripts/pipeline-state.mjs

**Phoenix-specific content lost:** Phoenix added roughly 1,400 lines of governance machinery on top of the base CLI: a closed "Recovery Bridge" decision lifecycle (`RECOVERY_BRIDGE_DECISION_SCHEMA`, `transitionRecoveryBridgeDecision`, `recoveryBridgePoApprovalDecision`, journal-tracked prepare/consume/commit transactions, an issuance cutoff `RECOVERY_BRIDGE_ISSUANCE_CUTOFF = 2026-10-31`); a feature-package transition validator (`runFeaturePackageCommand`, `validateFeatureRequest`); continuity-authority-revision subcommands (`runContinuityAuthorityRevisionCommand`, journaled authority-revision approval under the writer lock); a result-reconciliation plan builder (`buildResultReconciliationPlan`); and human-decision-reference/consumption matching against an external `governance-authority.mjs` readback (`matchesHumanAuthorityScope`, `matchesHumanConsumption`, `matchesPlanApprovalHumanAuthority`) wiring the `approve-plan --human-decision-file` flag into this CLI. Main's canonical file moved to `plugins/pipeline-core/scripts/pipeline-state.mjs` (5,503 lines) and has zero occurrences of `RECOVERY_BRIDGE`, `FEATURE_PACKAGE`, `HUMAN_DECISION_REFERENCE`, `GOVERNANCE_AUTHORITY_CLI`, `CONTINUITY_AUTHORITY_REVISION`, or `RESULT_RECONCILIATION`.
**Assessment:** genuinely absent. FLAG: the entire ledger-consumption verification path that ties a plan/push approval to an externally-resolved, single-use human governance decision is gone from the canonical state writer, with no equivalent subsystem anywhere in main's tree.

## harness/scripts/pipeline-state.test.mjs

**Phoenix-specific content lost:** The corresponding ~790-line test expansion covering the Recovery Bridge, feature-package, continuity-authority-revision, result-reconciliation and human-decision-consumption mechanisms described above. Main's test file (2,984 lines, imports from the local shim which re-exports the canonical plugin file) has zero matches for `RECOVERY_BRIDGE`, `recoveryBridge`, `FEATURE_PACKAGE`, `featurePackage`, `humanDecision`, `HUMAN_DECISION`, `CONTINUITY_AUTHORITY_REVISION`, or `RESULT_RECONCILIATION` — none of that coverage exists on main.
**Assessment:** genuinely absent (paired 1:1 with the implementation loss in `harness/scripts/pipeline-state.mjs` above — no separate FLAG needed here).

## harness/scripts/publication-state-authority.test.mjs

**Phoenix-specific content lost:** Phoenix's last revision of this fixture changed the push-guard assertion from "Push Guard accepts only the State-Writer's exact projection tuple" (an exact-match allow) to "Push Guard rejects a local State-Writer projection without human-ledger authority" (expects exit 2, `/PHX-2 authority unavailable/`), and switched the fixture's candidate OID/tree from hard-coded fake hex to a real `git commit` in a temp repo. Main's version is materially larger and more mature: it drives the full publication-prepare/approve/authorize/reconcile lifecycle, asserts raw Git pushes are unconditionally rejected in favor of the `publication-executor`, and includes an end-to-end disposable-bare-remote push-and-reconcile case — a stricter, more complete supersession of the same "guard against unauthorized raw pushes" goal, achieved through the mature publication-executor design rather than Phoenix's evolving PHX-2 ledger check.
**Assessment:** superseded.

## harness/scripts/security-adapters/gitleaks.mjs

**Phoenix-specific content lost:** Phoenix passed `--source .` with `cwd` set to the detached candidate root (instead of an absolute `--source <root>`) specifically so gitleaks reports paths relative to the root, preserving `.gitleaksignore`'s relative-path fingerprints without extra normalization.
**Assessment:** superseded — main keeps `--source <rootDir>` (absolute) plus `--no-git`, and independently normalizes gitleaks' absolute finding paths back to repo-relative via `realpathSync`/`relative()` (`normalizeCandidateFindingPath`), and layers a more robust content-based (sha256+path+rule+line+column) `.gitleaksignore` authority model (`loadContentAuthority`/`parseContentAuthorityLine`) on top. Same job, different (more robust) implementation; nothing of substance lost.

## harness/scripts/validate-manifest.test.mjs

**Phoenix-specific content lost:** none — Phoenix's only change was updating one assertion's expected `push.approval` value from `"standing-approved"` to `"required"`; main's test already asserts `"required"` at the same line, so Phoenix's edit and main's content are identical.

## harness/scripts/verify.mjs

**Phoenix-specific content lost:** Phoenix registered roughly 30 additional entries in `TEST_SUITES`, wiring in the whole Phoenix governance-product test surface: `phoenix-governance-threat-model`, `external-command-offer`, `external-reference-adapter`/`-cli`, `agent-decision-journal`, `authority-revision-proof`, `audit-bundle` (+cli), `change-control` (+cli), `evidence-view-model`/`-renderer`/`-viewer`, `governance-event`/`-projection`/`-store` (+cli), `governance-export-outbox`/`-store`/`-cli`, `lifecycle-governance-events`, `organization-policy`/`-activation`, `governance-replay`/`-view`/`-cli`/`-viewer`, `governance-export-adapter`/`-delivery`, `human-governance-ledger`, `governance-authority-resolver`/`-cli`, `ruleset-source`, `phoenix-guard-git-authority` (`guard-git-phoenix.test.mjs`), and `codex-host-plugin-list`. Main's `verify.mjs` has zero matches for any of these names. The underlying `.test.mjs` files for most of these still exist unconflicted elsewhere in the merged tree (e.g. `plugins/pipeline-core/lib/human-governance-ledger.test.mjs` is present on disk) but are no longer registered, so `node harness/scripts/verify.mjs` will silently stop running them.
**Assessment:** genuinely absent. FLAG: this silently disables enforcement of roughly 30 governance-product test suites — the files remain on disk but `verify` will report green without ever executing them, so regressions in that whole subsystem would go undetected by the verify gate.

## plugins/pipeline-core/hooks/guard-devplan.mjs

**Phoenix-specific content lost:** Two distinct additions. (1) `hasLedgerBackedPlanApproval` — before honoring `state.planApproved === true`, this function requires an exact v3 approval whose `humanDecision` reference is independently re-verified by invoking `governance-authority.mjs` (spawned subprocess) and checking a `granted:true`, `singleUse:true` readback scoped exactly to `packageId`/`action:"APPROVE_PLAN"`/the plan+spec sha256 artifacts — a mutable `planApproved` flag is deliberately never sufficient authority by itself. (2) statePath resolution moved to `readProjectAuthority()` to avoid a migrated repo silently falling back to a deleted legacy state file. Main has (2)'s equivalent via `resolveProjectAuthorityPaths` with its own `NEUTRAL_STATE`/`LEGACY_STATE` fallback, but has no equivalent of (1) at all — main's `derivePlanLifecycle`-based gate verifies plan/spec content hashes locally (`fileSha256`) but never calls out to an external governance-authority ledger for a single-use human-decision readback.
**Assessment:** genuinely absent. FLAG: the ledger-backed, single-use-consumption verification of a plan approval (as opposed to trusting a local mutable `planApproved` flag plus a locally-computed authority hash) has no equivalent in main.

## plugins/pipeline-core/hooks/guard-devplan.test.mjs

**Phoenix-specific content lost:** Test coverage for the loss above: cases "DP06 block legacy planApproved true without ledger decision", "DP26 allow v3 plan approval resolves exact ledger decision", "DP27 block v3 decision checkpoint drift cannot authorize", plus "DP25 block unapproved neutral State without legacy State". Main has zero matches for `humanDecision`/`governance-authority`/`ledger`/`hasLedgerBackedPlanApproval`.
**Assessment:** genuinely absent (paired 1:1 with `guard-devplan.mjs` above).

## plugins/pipeline-core/hooks/guard-git.mjs

**Phoenix-specific content lost:** For a "Phoenix-governed project" (detected via `governance/events/registry.json` presence), Phoenix replaced the local one-time override ledger (`.claude/guard-override.log.jsonl`) with a canonical human-governance decision: `splitOverrideValue` grew a 4th `authorityReference` segment, and `consumePhoenixOverrideAuthority` calls `governance-authority.mjs` to verify + consume a decision scoped exactly to `OVERRIDE.<rule>` for the exact current commit/tree, with the guarded file's own sha256 as one of the required scope artifacts (so the override cannot outlive a change to `guard-git.mjs` itself) — no command or reason content is persisted locally, only the ledger consumption. Main only has the legacy local-file ledger (`appendLedger`, `guard-override.log.jsonl`, no `governance-authority`/`PHX-2` matches at all).
**Assessment:** genuinely absent. FLAG: the mechanism preventing a locally-forged override (arm-and-blast the same token/reason repeatedly, or fabricate a plausible-looking local ledger entry) by requiring an externally-verified, single-use, scope-bound human decision is gone; main's git-guard override is authorized purely by local file-ledger bookkeeping.

## plugins/pipeline-core/hooks/guard-push.mjs

**Phoenix-specific content lost:** `checkLedgerPushAuthority` replaced the old "gates.push.approval === standing-approved auto-passes / required checks state.pushApproval.lastApproved.forCommit" logic with a fail-closed "PHX-2 transition" rule: every push is blocked unless an independent call to `governance-authority.mjs` confirms `consumed:true` for a decision whose scope exactly matches the pushed candidate's commit/tree, `packageId`, `action:"APPROVE_PUSH"`, and `environment:"local"` — a mutable State projection (`required` or legacy `standing-approved`) is explicitly documented as "never authority" during this transition. Main still uses the older `standing-approved`/`pushApproval.lastApproved.forCommit` model plus a separate `criticalProofWaiver` mechanism; it has zero matches for `PHX-2`, `governance-authority`, or `checkLedgerPushAuthority`.
**Assessment:** genuinely absent. FLAG: this is precisely the "PHX-2 Human Governance Decision Ledger + Authority Resolver" mechanism that CLAUDE.md's own Hard Rules section names as the sole future remote-action exception path — its enforcement code has no equivalent in main, which still allows a push to be authorized by a locally mutable `pushApproval`/`standing-approved` state.

## plugins/pipeline-core/hooks/guard-push.test.mjs

**Phoenix-specific content lost:** The corresponding test cases asserting pushes are blocked "before PHX-2" even with all-green evidence, standing-approval, or a fresh mutable `forCommit` (PG09–PG13, PG17b/c/q, PG26a, all named "...cannot authorize before PHX-2"). Main has zero matches for `PHX-2`/`checkLedgerPushAuthority`/`governance-authority`.
**Assessment:** genuinely absent (paired 1:1 with `guard-push.mjs` above).

## plugins/pipeline-core/hooks/post-compact-reground.mjs

**Phoenix-specific content lost:** Phoenix switched the hardcoded `.claude/pipeline-state.json` state path to `readProjectAuthority()` resolution (falling back to the legacy path only when authority status is `"missing"`).
**Assessment:** superseded — main uses the equivalent `resolveProjectAuthorityPaths` with its own (slightly more thorough) `NEUTRAL_STATE`-then-`LEGACY_STATE` fallback; same job, same underlying library, no capability lost.

## plugins/pipeline-core/hooks/stop-suggest.mjs

**Phoenix-specific content lost:** Same change as `post-compact-reground.mjs`: hardcoded state path replaced with `readProjectAuthority()` resolution.
**Assessment:** superseded — main's `resolveProjectAuthorityPaths` + `NEUTRAL_STATE`/`LEGACY_STATE` fallback does the identical job.

## plugins/pipeline-core/lib/codex-host-plugin-list.mjs

**Phoenix-specific content lost:** Phoenix added `observeCodexRulesetSource`, a "PHX-0B public-safe Codex source observation" that classifies the selected plugin's marketplace source (`classifyGitMarketplaceSource` distinguishing `marketplace-public` from `marketplace-private`) and, for a local-development source, only grants `sourceClass: "self-application"` if the loaded and installed plugin roots' git HEAD identities match AND `observePublicCoreIdentity` independently confirms a clean checkout at one of a fixed allowlist of origins (`PUBLIC_SELF_APPLICATION_ORIGINS` — the public GitHub HTTPS URL and its SSH alias) with matching commit and content-sha256. Main only has `resolveCodexLocalMarketplacePluginPath` and the pre-existing `observeSelectedCodexPipelinePlugin`; it has no `observeCodexRulesetSource`, no self-application detection, and no origin allowlist.
**Assessment:** genuinely absent. FLAG: this is an integrity control preventing a private or dirty local clone from being credited with "self-application" (public, reviewed) authority merely because its plugin directory layout happens to match — main has no equivalent gate.

## plugins/pipeline-core/lib/po-gate-authority.mjs

**Phoenix-specific content lost:** Two authority-path resolutions moved from hardcoded `.claude/pipeline.yaml`/`.claude/pipeline-state.json` to `readProjectAuthority()`. For the state read specifically, Phoenix added an explicit `{status: "unavailable"}` outcome when authority resolution itself fails/is mixed, which `validatePoGateAuthority` turns into a distinct fail code `PO-GATE-STATE-AUTHORITY-UNAVAILABLE` ("The authoritative State projection is unavailable or mixed"). Main's `activeFeatureState` uses the equivalent `resolveProjectAuthorityPaths` for the manifest read, but for state it always falls back silently to `NEUTRAL_STATE`/`LEGACY_STATE` regardless of authority readiness — it has no distinct "unavailable/mixed" detection or matching fail code.
**Assessment:** narrowed — main covers the core manifest-path-resolution case, but drops Phoenix's specific guarantee of failing closed with a named diagnostic when project authority is itself ambiguous/mixed, instead silently guessing a state path.

## plugins/pipeline-core/lib/po-gate-authority.test.mjs

**Phoenix-specific content lost:** Test cases "the runtime projection binds the neutral project authority manifest, not a stale legacy manifest" and "mixed project State authority fails closed instead of becoming an absent feature". Main has zero matches for `PO-GATE-STATE-AUTHORITY-UNAVAILABLE`.
**Assessment:** narrowed (paired with `po-gate-authority.mjs` above).

## plugins/pipeline-core/lib/project-authority.mjs

**Phoenix-specific content lost:** Phoenix added a full crash-safe (journaled, fsync'd, two-phase-commit-style) dual-state synchronization subsystem — `planProjectAuthorityStateSynchronization`/`applyProjectAuthorityStateSynchronization` align `LEGACY_STATE` and `NEUTRAL_STATE` to one neutral-authority snapshot (retaining the legacy phase) when they diverge, with `planPendingProjectAuthorityStateSynchronizationRecovery`/`applyPendingProjectAuthorityStateSynchronizationRecovery` to recover an interrupted sync — plus a one-off `planProjectAuthorityStateReconciliation`/`applyProjectAuthorityStateReconciliation` correcting a `continuity.authority.result.path` casing bug (`Result.md` → `result.md`). Main's exported surface (`inspectProjectAuthorityProvenance`, `classifyProjectAuthority`, `planProjectAuthorityMigration`/`applyProjectAuthorityMigration`, session-cleanup recovery, pending-recovery) has no `StateSynchronization`/`StateReconciliation` functions or schemas at all.
**Assessment:** genuinely absent. FLAG: without this, main has no tool to repair `LEGACY_STATE`/`NEUTRAL_STATE` divergence during the PHX-0 migration window — since different hooks may resolve authority to either path (see `po-gate-authority.mjs` above), a stuck divergence between the two projections could let one gate observe a different `planApproved`/phase than another.

## plugins/pipeline-core/lib/project-authority.test.mjs

**Phoenix-specific content lost:** Test cases "neutral Result-path correction is previewed, explicit, and preimage-bound", "dual-state sync binds both preimages and preserves neutral authority", and "interrupted dual-state sync recovers the stage-publication crash window before a retry" — covering the subsystem lost in `project-authority.mjs` above.
**Assessment:** genuinely absent (paired 1:1 with `project-authority.mjs` above).

## plugins/pipeline-core/scripts/check-artifact-topology.mjs

**Phoenix-specific content lost:** Phoenix added a `"governance-event"` value to the `TOPOLOGY_CLASSES` allowlist. Main's list has different additions (`"threat-model"`, `"security-readiness"`) but not `"governance-event"`.
**Assessment:** genuinely absent — narrow: artifacts Phoenix's governance-event subsystem would classify under `"governance-event"` are no longer a recognized topology class in this validator.

## plugins/pipeline-core/scripts/pipeline-start-preflight.mjs

**Phoenix-specific content lost:** Phoenix wired `observeCodexRulesetSource` (see `codex-host-plugin-list.mjs` above) into the preflight: `sourceVersionBound` requires the observed ruleset-source's selected-plugin version to match both the loaded and installed versions, and the preflight status becomes `"plugin-refresh-required"` (not `"ready"`) if source observation isn't bound. It also added `freshnessHostActionForPreflight`, producing an opaque `preflightSha256` digest binding the exact ready/host-authorized-wsl preflight projection for a later freshness-host transport call. Main has zero matches for `observeCodexRulesetSource`, `rulesetSource`, `freshnessHostActionForPreflight`, or `sourceVersionBound`.
**Assessment:** genuinely absent. FLAG: this is the actual enforcement point for the self-application/origin-allowlist integrity check described under `codex-host-plugin-list.mjs` — without it, a preflight can report `"ready"` without ever verifying the loaded plugin source against the reviewed public/self-application identity.

## plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs

**Phoenix-specific content lost:** Test cases "a sandbox preflight routes WSL without observing host control identity", "default-boundary preflight exposes no freshness host action", "preflight binds the normalized Codex observation and fails closed on its disagreement", and the version-match/mismatch cases for `sourceVersionBound`. Main has zero matches for `rulesetSource`/`freshnessHostActionForPreflight`.
**Assessment:** genuinely absent (paired 1:1 with `pipeline-start-preflight.mjs` above).

## plugins/pipeline-core/scripts/project-authority-migration.mjs

**Phoenix-specific content lost:** The CLI wiring (new subcommands `reconcile-state`, `sync-state`, `recover-sync`, plus richer `--activate` preview explanations) for the dual-state synchronization/reconciliation subsystem in `project-authority.mjs` above. Main's CLI only supports `inspect`/`plan`/`apply`/`recover`; zero matches for `sync-state`/`reconcile-state`/`recover-sync`.
**Assessment:** genuinely absent (paired with `project-authority.mjs` above; same FLAG applies — no CLI surface for the missing repair subsystem either).

## plugins/pipeline-core/scripts/project-authority-migration.test.mjs

**Phoenix-specific content lost:** The CLI-level integration tests for `reconcile-state` and `sync-state` (writing a mismatched `Result.md`-cased path and a phase-diverged legacy/neutral state pair, then asserting the CLI repairs both).
**Assessment:** genuinely absent (paired 1:1 with `project-authority-migration.mjs` above).

## plugins/pipeline-core/scripts/ruleset-freshness.mjs

**Phoenix-specific content lost:** Phoenix added a large (392-line) WSL host-authorized freshness subsystem: `WSL_FRESHNESS_BOUNDARY_ID`, `createFreshnessHostAction`/`freshnessHostPlanForEnvironment`/`freshnessHostPlanForExecutionBoundary`/`withFreshnessHostRequest` (binding a host-transport plan to an exact boundary/control identity), and `observePublicRemoteIdentity`/`compareSelfApplication` comparing the loaded plugin's identity against `PUBLIC_MARKETPLACE_URL` to detect staleness/divergence from the genuine public Core. Main took the file in a completely different direction (`PIPELINE_UPDATE_AVAILABILITY_SCHEMA`, `resolvePipelineUpdateChannelConfig`, `inspectPipelineUpdateAvailability`, `migrateLegacyRulesetFreshness`, `repositoryWritePermitted`) with zero matches for `WSL_FRESHNESS_BOUNDARY_ID`, `FRESHNESS_HOST_ACTION_SCHEMA`, `compareSelfApplication`, or `observePublicRemoteIdentity`.
**Assessment:** genuinely absent. FLAG: the anti-tampering/freshness-integrity check that compares the loaded ruleset against the genuine public marketplace remote (and the host-authorized transport binding that carries it through a WSL sandbox boundary) has no equivalent in main.

## plugins/pipeline-core/scripts/ruleset-freshness.test.mjs

**Phoenix-specific content lost:** The ~782-line test expansion covering the WSL host-authorized freshness/self-application-comparison subsystem above. Main has zero matches for `WSL_FRESHNESS_BOUNDARY_ID`, `FRESHNESS_HOST_ACTION_SCHEMA`, `compareSelfApplication`, or `observePublicRemoteIdentity`.
**Assessment:** genuinely absent (paired 1:1 with `ruleset-freshness.mjs` above).

## plugins/pipeline-core/skills/pipeline-start/SKILL.md

**Phoenix-specific content lost:** Phoenix documented the "PHX-2 Ledger/Resolver remote-authority transition" contract directly in the bootstrap skill (the same fail-closed rule found missing in `guard-push.mjs`/`guard-git.mjs` above: no remote action may be inferred from `autonomy`/an old approval/generic standing authority; only a proven, unconsumed, unrevoked, integrity-bound PHX-2 decision authorizes one exact action/remote/ref/candidate/work-package); an "Approved-plan continuation" rule letting internal implementation slices proceed without a PO gate per slice; and a `freshnessHostBinding`/`preflightSha256` contract binding Step 0's preflight to a separate `ruleset-freshness-host.mjs` helper for the Codex host boundary. Main has zero matches for `PHX-2`, `freshnessHostBinding`, `ruleset-freshness-host.mjs`, or `Approved-plan continuation`.
**Assessment:** genuinely absent. FLAG: this is the agent-facing documentation counterpart of the PHX-2 enforcement code already flagged missing in `guard-push.mjs`/`guard-git.mjs` — losing it means the bootstrap protocol itself no longer instructs an agent about the fail-closed remote-authority rule.

## plugins/pipeline-core/skills/pipeline-start/pipeline-start-v3.test.mjs

**Phoenix-specific content lost:** Test cases "Approved plans continue internal implementation without slice-level PO pauses", "PHX-2 Ledger/Resolver is the sole fail-closed remote transition", and "PHX-2 remote actions retain binding, expiry, readback and rollback denials" — these assert the exact PHX-2/Approved-plan-continuation wording is present verbatim in `SKILL.md`, `docs/operating-model.md`, and `CLAUDE.md`. Main's `SKILL.md` (resolved above) no longer contains that wording, so these assertions would fail if kept; consistent with main simply not carrying the PHX-2 documentation forward.
**Assessment:** genuinely absent (paired 1:1 with `SKILL.md` above; no separate FLAG — same underlying loss).
