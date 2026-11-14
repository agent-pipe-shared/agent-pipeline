# 29e scout notes (2026-11-14, read-only Explore agents on clone base c970646cd)

## T9 (pipeline-state split)
- Group G closed-evidence restore/repin: pipeline-state.mjs 11310-11895 (10 fns) + consts 895-898. Shared: SHA256_RE 893, projectDir 928 (function), readState 1003, writeState 1032, stateWriteSucceeded 1213, acquire/releaseContinuityLock 1483/1572, sha256Bytes 1828, readStateRaw 5133, committedGlobalChatHumanApproval 3989, PO_ACK_APPLY_CONFIRMATION_TOKEN 7293, import.meta.url at 11517/11746 (writer path). Imports: sha256CanonicalJson (~513), chatAttributionRecord + requireAttendedChatGateConfirmation (584), spawnSync, fileURLToPath, fs, path.
- Dispatch at 12291/12294; verbs in PIPELINE_STATE_COMMANDS 811. Test: scripts/check-evidence-drift.test.mjs (228,253,356,377). Also lib/guard/sanctioned-args-scripts.mjs, source-bound pin. Prior move pattern: a24071f3d (verify-replacement).

## T5/T1 (Critic template re-pin)
- Copies: templates/prompts/critic-review.md + plugins/pipeline-core/templates/prompts/critic-review.md (hand-synced; byte-equality asserted in hooks/antigravity-pretool-guard.test.mjs:1391). roles/critic.md + vendored copy (vendored-canon generator).
- Pin: scripts/codex-isolated-critic-protected-preimage.v1.json (template root copy lines 41-44, roles/critic.md 37-40); test codex-isolated-critic-protected-preimage.test.mjs. Model re-pin commit: 322a04409 (JSON + both template copies).
- renderEnvelope lib/critic-briefing-build.mjs:159-178; envelope rows template 189-201; unknown placeholder throws CBB-TEMPLATE-PLACEHOLDER (175) -> builder branch needed for SCOPE_MARKER; limitation label 177. Envelope test prepare-dispatch.test.mjs:273-287 (deepEqual placeholders ["MODEL"]).
- AGY filter hooks/antigravity-pretool-guard.mjs CRITIC_DISPATCH_PROSE 624 (you are|please|examine|look at|review); also lib/dispatch-policy.mjs CONTAMINATION 110-136. Test antigravity-pretool-guard.test.mjs:1381-1395.
- Attribution lib/critic-split.mjs 60-61, attributeVerdict 276-281, CSM-CHILD-UNATTRIBUTED 334; Claude/Codex instruction renderBody critic-briefing-build.mjs:111-112.
- Stage-0 in critic text: roles/critic.md:136; critic-review.md:453-476 (line 461).

## Stage-0 (G-T1 round 3)
- Definition: roles/elephant.md:35 (+36 clarification), docs/operating-model.md:154-171 (§3.3). "Tier-0": roles/elephant.md:398, harness/session-bootstrap.md:166,314, templates/prompts/session-bootstrap-check.md:177, generator harness/scripts/generate-elephant-role-prohibitions.mjs:148 CONFIRMATION_TAIL -> SKILL.md:200 (pin generate-elephant-role-prohibitions.test.mjs:66).
- Hardcoded "at most 2 files": templates/prompts/agent-obligations.md:183-185 from generate-agent-obligations.mjs:275-277.
- Enforcement: harness/scripts/check-dispatch-provenance.mjs STAGE0_MAX_FILES=2/STAGE0_MAX_LINES=25 (246-247), messages 500/552; tests check-dispatch-provenance.test.mjs 114-115,151-202,351-357,478-484. dispatch-authorship-verify.mjs ELEPHANT_STAGE0_MAX_PATHS=10 (154). guard-el01-tripwire.mjs (risk high only).
- Other mentions: roles/critic.md:136, roles/goldfish.md:129, harness/definition-of-done.md:96, checklists small-session 34/38, critic-review 23, session-close 35, review-protocol 47, guardrails/git.md 39/41/60/76, templates prd.md:16, elephant-kickoff 87, kickoff-new-project 156/222/237/239, critic-review 461, goldfish-task 73/510; plugin skills close-block 154/155/228, conventional-commit 55-83, kickoff-design 44, agents/critic.md 119.
- Register: docs/state.md inline D-ids, highest D252 -> D253. ADR index docs/adr/README.md, last 0100 -> 0101.

## T10 parallel reminder (hooks)
- setup-check.mjs (SessionStart startup|resume|clear): silent path returns stdout "" at :248 when setup done -> needs new branch; tests setup-check.test.mjs assert stdout==="" at :143,:151,:157,:206,:215 (custom ok() script).
- post-compact-reground.mjs decideOutput :348-381 appends `message += ...` :357-366 before measure :368 -> a reminder line rides there; reaches Codex compact via codex-session-start-hint compactStdout :204-223. Tests post-compact-reground(.fanout).test.mjs :245-249, prefix regex :450.
- guard-dispatch-budget.mjs orchestrator branch :1781-1786 returns verdict(0); marker orchestrator-seen/<stem>.json :1580-1599. allowContextStdout (lib/dispatch-budget-notice.mjs:72) = PreToolUse allow + additionalContext (proven channel, used :1502/:1509). Counter next to orchestrator-seen dir (test :432-443 tolerates that path). Matcher hooks.json:40 lacks Agent/Workflow/MCP/advisor -> undercount; widening = TP-4 file.
- user.yaml: validatePipelineUserV3 root key set closed (runner-profiles-v3.mjs:273); session block precedent validateSession :234-240; schema pipeline-user-v3.schema.json :50-57; owned keys config/runtime-projection-v3-owned-keys.json:20; runtime-projection-v3.mjs :190,:369-395.
- Codex: SessionStart only codex-session-start-hint.mjs (main :242-269); budget guard not wired. AGY: PreInvocation antigravity-start-hint / slicing-hint deliver (injectSteps ephemeralMessage); no SessionStart.

## Trivy (T8/T8b)
- Semgrep baseline is semgrep-native (--baseline-commit); Trivy needs own base-worktree run + diff. blockingFindings in lib/semgrep-baseline.mjs:79 hard-codes tool==="semgrep" (85).
- Registries: security-scan.mjs SCANNER_DEFS 163, DEFAULT_ENABLED 170, buildAdapterConfig 232, describeRuleSet 305, V2_RULE_PACK_REF 732, loop 1068-1148, baseline step 584-633; security-close-status.mjs SECURITY_ELEMENTS 20, deriveReportStatus 42 (osv not-applicable hardcode), SECURITY_CAPABILITY_ELEMENT 234; toolchain-registry.mjs 28-125 (no conditional class; TOOL_CLASSES 22; toolchain-doc.mjs 9-20); toolchain-preflight.mjs 77-102,158,243,247,271,315,479,515; new readiness probe scripts/security-readiness/trivy-readiness.mjs (+ harness copy dir, closedProbeEnv tool-identity.mjs:26); kernel list guard-maintenance-window.mjs 800-803; onboarding-consent-scope.mjs 68-69; catalog cap.iac/cap.container applicability always -> needs applicability input like repo.hasPackageSources; docs generator; verify-suites.json.
- Pinned lists: toolchain-preflight.test.mjs 137,151,320,406,815,827; toolchain-registry.test.mjs 30,134; pins/security-close-chain-is-hard-per-calibration.test.mjs 537,541,648.
- Adapter tests use spawnFn stubs; real binary only in baseline test with skip.
- Size estimate: ~30 files. Cut 29e before Trivy if needed (advisor).

## Export-step TODOs (found 2026-11-14 after T10)
- Provenance: exported .msg of 05 (canon), 09 (critic re-pin), 10 (provenance trailer) have a BODY line starting with
  "Dispatch:" -> malformed-trailer. Re-wrap those lines in the exported .msg files (content unchanged) and rerun
  check-dispatch-provenance over the applied range in rehearse.
- Provenance caps: every Elephant-built candidate commit above 3/60/25 is stage0-claim-caps-exceeded (29d too: fe117d6e9,
  df9e8a2f2). Pre-existing practice of the held-patch exception; report to PO as a labelling question, not fixed here.
- T10 runtime projection checked: .claude/pipeline.yaml session block renders only keep_awake; pinned 56e2cc4bb.
- Add pipeline-start-preflight.test.mjs to the pre-export list (not hit by the importer match).

## Trivy slice 2/3 findings (2026-11-14, for ADR-0103 and the PO report)
- Commits: 74e2eeb61 slice 2 (scan wiring + baseline), 217bb595e triggers tracked + List, 54dff5be2 no telemetry,
  8934c1f52 diagnostics fixture.
- Measured with real trivy 0.76.2 (scratch/trivy-probe/k8s-shapes, shape-probe.mjs): kind List / ConfigMapList -> no
  target -> was ERROR "trigger not scanned" -> now no trigger. Kustomization: no target (already excluded). Backstage
  Component: scanned as kubernetes, not a trigger (lenient). Helm charts ({{) are no trigger: a repo with only a chart
  reads not-applicable (limit, name in ADR).
- Walk over a working copy: 28 s and over 200000 entries (scratch clones). Now tracked files at a Git top level: ~1 s.
- Trivy help names --disable-telemetry and --skip-version-check: added (the scan was not offline by default).
- Default-enabled: a consumer manifest that lists the four scanners explicitly gets trivy ON (not-applicable without
  infra files). Fixtures that disable "all others" needed trivy: enabled: false. -> PO report line.
- Decisions taken (name in ADR-0103, PO may overrule): no start-time readiness finding for trivy (each start would walk
  and parse tracked YAML/JSON, ~1 s here); registry class required-with-infrastructure.
- Consent: CORRECTED. A consent record stores scope step ids, never a text digest (onboarding-consent-mark.mjs:57-69), so the
  consent text names Trivy now (ADR-0092 tile answer); recorded consents stay valid. No PO tile needed.
- Kernel: toolchain-preflight.mjs is kernel; importing trivy-readiness.mjs + security-adapters/trivy.mjs requires both in
  NEVER_LIFTABLE_KERNEL_PATHS and in docs/guard-maintenance-window-threat-model.md Protected assets (GMWKC01/03).
