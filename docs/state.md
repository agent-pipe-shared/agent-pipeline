# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

## Current handover — local Nova 0.6.0 candidate preparation (2026-08-20)

The requested candidate version remains **`0.6.0`**. A local build must use
only build metadata, in the form `0.6.0+<runner>.<UTC-datetime>.<functional-oid>`;
this is not a semver patch bump to `0.6.1`.

The backlog is ledger-consistent at **39 open / 3 in progress / 259 closed**.
Closed items are ignored. Of the 39 open items, **34 are explicitly deferred**
to Alfred, Nightwing, Phoenix, Nova B, or a later scope and are not Nova-A
release work. The remaining Nova-relevant work is:

- in progress: `pipeline.afk-assumption-mode` and
  `pipeline.session-keep-awake`, both candidate/release-pending;
- in progress but design-only: `pipeline.execution-model-switchback` — no
  implementation dispatch has started, and its non-rewinding ledger status is
  documented in the item;
- open: `pipeline.handover-file-has-no-rotation-obligation`,
  `pipeline.happy-path-turn-and-wall-clock-cost-is-not-externally-defensible`,
  `pipeline.kickoff-promotion-cleanup-readback-has-no-in-session-recovery`,
  `pipeline.long-dispatches-truncate-before-emitting-their-report`, and
  `pipeline.verify-has-grown-to-269-suites-with-no-recorded-cost`.

The local-selector correction is included in the candidate preparation: the
project settings no longer enable the release marketplace selector. A local
user-scope install must select `pipeline-core@agent-pipeline-local`; the
release selector must not be enabled alongside it. The installed local cache
still needs to be refreshed and the next session restarted/reloaded before the
new hook guard code can be observed.

Candidate preparation is committed through `49f4db4a`. A previous Verify run
covered 383 suites and was otherwise green except for the known
`human-guard-override-tests` host/marketplace exception; its backlog-state
finding was caused by the temporary status-file/ledger mismatch and is not
used as final candidate evidence. Final Verify and the exact build-metadata
stamp remain pending on the next clean candidate commit.

**Last updated:** 2026-08-19 — PO decided the full backlog-triage block, the deniedRoots and Alfred-pull-forward decisions, reported 2 live external greenfield-test bugs (Codex/Windows, Claude/Windows) both now fixed, and instructed an immediate push to the feature branch (token-budget urgency) regardless of the still-open Critic FAIL. New candidate `0.6.0+{claude,codex}.20260819185528.6e30c76` (commit `4203e344`); push-approval ceremony in progress. Earlier same-day history (Wave 5 rounds 1-3, TP-3 ceremony, round-2 Critic orphan through the TP-3 GMW ceremony) is archived below.

**Final Nova A 0.6.0 T1 Critic gate review returned FAIL (round 1 of the QG-13 cap of 2, `claude-opus-5 at max`).** 4 findings, disposed without PO confirmation (unanswered `AskUserQuestion`, proceeded per standing auto-mode guidance): **F1** (state-numeric-claims-tests registers only its own fixture, not the live checker) — corrected, already resolved earlier (commit `1083229b`), entry was stale. **F2** (29/31 commits lack a `Dispatch:` trailer, incl. `0b2386fd` authored directly by this Elephant) — accepted as a disclosed self-application deviation, not laundered. **F3+F4** (Critic dispatched against `exitCode:1`; that exception has no recorded owner/expiry) — same standing `human-guard-override-tests=1` marketplace-mirror exception; owner PO (André), no confirmed expiry, proposed 2026-08-26 checkpoint (placeholder). Round 2 was launched then orphaned (see archive below); round 3 not yet run. **This candidate therefore still carries an unresolved Critic FAIL** — every stamp/push since is per explicit PO instruction, not a passed high-risk gate.

**Round-2 Critic dispatch through the TP-3 GMW ceremony are archived** — see [`docs/state-archive/2026-08-19--critic-round2-orphan-through-tp3-gmw-ceremony.md`](state-archive/2026-08-19--critic-round2-orphan-through-tp3-gmw-ceremony.md) for the full narrative (round-2 Critic orphaned, Wave 5 completed, 8 defects fixed, `NVA-COMPACTSTATE-1` landed, ~43 stale worktrees cleaned, 2 backlog items landed, TP-3 GMW ceremony).

**Full Verify after the backlog-triage batch found 2 real step-6 regressions a prior "383/383 clean" claim had missed — both fixed, independently re-verified.** `runner-profile-migration-v3.test.mjs`'s `freshlyOnboardedRoot()` helper and `project-onboarding-e2e.test.mjs`'s host-managed-onboarding case both still literal-checked `"kickoff-required"` for a genuinely fresh repo instead of the new `"intake-required"` — the earlier ~9-assertion fix only touched `project-onboarding-v3.test.mjs`, missing these two other files. Fixed (commit `ee663efb`), confirmed 44/44 and 4/4 independently before committing.

**Live external Windows/Codex greenfield-test bug found and fixed: `codex-app-server-health.mjs` told a Windows user to run a Unix-only command.** PO pasted a full session transcript (project `Rune_Test1_Codex_060_55`, candidate `0.6.0+codex.20260819163512.ca18e0c`): Codex's app-server daemon is genuinely Unix-only, but the health-check script unconditionally returned `operatorAction: "codex app-server daemon restart && codex doctor"` even when the CLI's own stderr said restart is Unix-only. Root-caused via a dedicated investigation fork before fixing (confirmed: app-server's only real consumer is the optional Advisor capability, yet it's gated onto every Codex bootstrap/session/dispatch intent unconditionally — a separate, deliberately NOT-fixed-here architectural gap; confirmed `guard-lifecycle-ready.mjs`'s repeated `ETIMEDOUT` in the same transcript is NOT coupled to app-server, a distinct still-open issue). Dispatched `NVA-BL-CASWIN-1` (goldfish-implementor, worktree-isolated): win32 now detects the platform before spawning the Unix-only restart and returns a distinct `CAS-PLATFORM-UNSUPPORTED` result pointing at WSL; non-Windows behavior is byte-identical to before. 8/8 + 9/9 independently re-verified before and after cherry-pick (commit `467d708b`). Filed `codex-runner-has-no-real-support-on-native-windows` (deferred, per the PO's own explicit split: quick fix now, real architecture fix "später") for the broader gap.

**PO decided every item in the backlog-triage block (7 blocked/5 no-action/10 corrections); a fork re-verified all 24 against code first (commits `f98f05b5`→`0ca42b91`→`f0ea7cf5`).** 11 closed (incl. the 3 onboarding-coordinator siblings subsumed by step 6); 2 scheduled into the final wave (`kickoff-promotion-cleanup-readback-...`, 2 gaps in `long-dispatches-truncate-...`); `afk-assumption-mode` updated not closed (bound to the candidate freeze with `session-keep-awake`). Backlog now **255/41/3**. 2 corrections flagged, not acted on: `claude-has-no-start-time-opt-in-adoption-path` (PO's premise false, item is Nightwing-scoped) and `human-approval-ux-directory-clarity-and-single-command` (already Alfred-deferred). **`codex-sandbox-runtime-deniedroots-proc-collides-with-proc-self`: PO decided Option 1 (`AskUserQuestion`, 2026-08-19) — fixed, landed, closed.** Dispatched `NVA-BL-CSDENIED-1` (goldfish-deep, worktree-isolated): `deniedRoots` narrowed from `["/proc"]` to `["/proc/sys"]` (a sibling of the unconditionally-included `/proc/self` under the same parent — a placeholder-value swap, zero functional-permission effect since `kind === "intermediate"` never emits `deniedRoots` into its compiled profile). Also fixed the test fixture's fake-binary placement and added a genuinely PASSING end-to-end regression test. Landed `ad68796a`, independently re-verified before and after cherry-pick (`codex-sandbox-runtime.test.mjs` 4/4, `codex-sandbox-preflight.test.mjs` 22/23 — 1 pre-existing environment-only skip, `check-consumer-safe-paths.test.mjs` 9/9). Backlog item closed (commit `42322bcc`).

**PO also confirmed (`AskUserQuestion`, 2026-08-19): the Alfred-deferred items stay at Alfred — no pull-forward.**

Verify against the step-6 tree: clean after one self-inflicted `test-tmpdir-budget-tests` fix, **383/383, exit 1 solely from the known `human-guard-override-tests` exception.** Candidate stamped: `0.6.0+{claude,codex}.20260819163512.ca18e0c` (commit `352cc4ed`).

**Live external Windows/Claude greenfield-test bug found, root-caused, fixed and landed: the material-intake bootstrap-bind flow had no sanctioned path to a passing PO plan gate.** PO pasted a full session transcript (project `Rune_Test1_Claude_060_56`, candidate `0.6.0+claude.20260819163512.ca18e0c`): a fresh repo given real material design input (not a one-line kickoff goal) completed the whole intake flow then hit a dead end at `bootstrap-bind-plan` (`KICKOFF-PROMOTION-PRD-LANGUAGE-MARKER-INVALID`), with no override for the guard denial that blocked a manual workaround. Investigated deeper than the PO's own report and found 3 compounding defects: (1) `buildIntakePrdContent()`/`buildIntakeSpecContent()` never emitted the `po-language`/`technical-spec-sha256` markers, unlike the plain-kickoff-goal path's `initialPrdContent()`; (2) the one marker representing genuine review (`po-plan-acknowledged`) had no sanctioned write path — `guard-lifecycle-ready.mjs` deliberately offers no override for this denial (ADR-0059 Decision 5), and the design's own test fixture (`bootstrapBindReadyRoot()`) revealed the intended edit step was never actually implemented, only simulated via a raw `writeFileSync` no real session can perform; (3) `project-onboarding-ready-gate.mjs`'s non-ready-status allowlist was never updated for step 6's 3 new `v4Inspection` statuses. Filed `material-intake-bootstrap-bind-has-no-sanctioned-path-to-a-passing-plan-gate` (`60cddb19`), dispatched `NVA-BL-INTAKEBIND-1` (goldfish-deep, worktree-isolated) — truncated twice mid-run, resumed procedurally both times, no re-launch. All 3 defects fixed: mechanical markers auto-emitted; a new narrow guard admission (`isBootstrapBindingStagingAuthoringWrite()`) lets a real session author/acknowledge the staging PRD/spec exactly at `lifecycleStatus === "bootstrap-binding-required"`, never wider; the 3 missing statuses added to the non-ready allowlist. The real (non-coordinator-sourced) kickoff-promotion path's marker requirements proven unchanged. Landed `3fedc770` (cherry-picked from `9153aa1c`/`68a39bd9`/`30ee2bb8`), independently re-verified before and after cherry-pick: `onboarding-continuity.test.mjs` 230/230, `guard-lifecycle-ready.test.mjs` 126/126, `project-onboarding-ready-gate.test.mjs` 8/8, `check-consumer-safe-paths.test.mjs` 9/9. Backlog item closed (`a83cdfd1`).

**A fresh quiesced-tree Verify (run twice) found and fixed 2 real-but-unrelated pre-existing issues, then went fully clean.** Round 1 (`b4a02b07`): `project-onboarding-v3-argv-closure.test.mjs`'s CLI test (predates this session) hand-injected all 3 PO-gate markers on top of a PRD that now auto-generates 2 of them, duplicating them and tripping the exact original bug's error code — fixed to inject only `po-plan-acknowledged` (`43065f1f`), 6/6. `security-scan` also failed: semgrep's parser has a `PartialParsing` false positive on JS regex literals containing `<!--`/`-->` (both offending lines predate this session, `29380a77`/`091daa90`) — rewrote to `.includes()`/`RegExp()` constructor (`6e30c761`), 230/230, security-scan exit 0. Round 2: **383/383, exit 1 solely from the known `human-guard-override-tests` exception.** New candidate stamped: `0.6.0+{claude,codex}.20260819185528.6e30c76` (commit `4203e344`).

**PO instruction (2026-08-19, explicit, token-budget urgency): push this candidate to the feature branch now, regardless of Verify outcome, via the signature-approval ceremony.** `gates.push_approval: signature` / `gates.push: blocking` — the full 5-layer ceremony in `docs/push-release-flow.md` applies to every push, not just `main`. This handover commit is deliberately the LAST commit before the ceremony starts (nothing may be committed between signing and pushing, or the signature is voided). **The Critic FAIL above is still unresolved at push time — disclosed here, not silently carried.**

**Not yet done:** (1) present the 2 scheduled items (`kickoff-promotion-cleanup-readback-...`, 2 gaps in `long-dispatches-truncate-...`) plus the original 6-item current-sprint list to the PO for a dispatch go-ahead. (2) the push-approval ceremony (in progress) — `push-prepare.mjs` readiness, then the PO's own `authorize-critical` signature, then agent-side `approve-push` + `git push`. (3) the final T1 Critic gate review (diff `83f564df..HEAD`, opus/max) — round 3 is the next real gate step, still open after this push.

**Project status:** ACTIVE
**Release version:** `0.5.4` released
**Release state:** version `0.5.4` · tag `v0.5.4` · commit `dd1eb9eedeb7ac48860c8ec9745750c9a8367b32` · tree `b6857469bbc84de94c0f917ed64dc59b0eccc8de` · status `published`

## Archived history

| Date range | Summary | Archive |
|---|---|---|
| 2026-08-19 (a) | Wave 5 rounds 1-3, TP-3 ceremony. | [wave5-tp3.md](state-archive/2026-08-19--wave5-execution-round1-through-tp3-ceremony.md) |
| 2026-08-19 (b) | Round-2 Critic orphan, TP-3 GMW ceremony. | [critic-r2-gmw.md](state-archive/2026-08-19--critic-round2-orphan-through-tp3-gmw-ceremony.md) |
| 2026-08-19 (c) | Pre-step-6 backlog audit, step-6 dispatch/Weg-1/landing. | [step6.md](state-archive/2026-08-19--step6-dispatch-through-landing.md) |
| 2026-08-18 | 2026-08-18 daytime: six-branch merge/F2f/C2f/HGO OT09 diagnosis, Phoenix reconcile-approval port, worktree-isolation root cause (now in CLAUDE.md), backlog completeness sweep, Toolbox/Phoenix blockers, fresh 0.6.0 candidate history -- all superseded by later same-day and 2026-08-19 work. | [docs/state-archive/2026-08-19--observation-publication-queue.md](state-archive/2026-08-19--observation-publication-queue.md) |
| 2026-07-19 to 2026-07-25 | Cyborg/Sentinel/SNT-A late-July 2026 history: sprint activation, Windows-portability bugfix rounds, backlog-authority handover to Nova, close-ritual authorship-check incident -- all superseded by later Nova-sprint work. | [docs/state-archive/2026-08-19--open-items-and-next-block.md](state-archive/2026-08-19--open-items-and-next-block.md) |
| 2026-08-11 to 2026-08-18 | 2026-08-11 through 2026-08-18 (daytime continuation 2): Nova A/B AFK-block narrative, the entire 0.5.4-candidate/CRITIC-054 saga, Nova REL-053/GMW/HGO-Sig, the 0.5.5-candidate/A7-gate/ADR-0066 sequence, overnight AFK block, and the Sentinel/Cyborg backlog reconciliation. Second ADR-0066 Decision 6/7 extraction pass (4 parallel forks) found six homeless findings, now their own backlog items. | [docs/state-archive/2026-08-18--nova-055-afk-block-through-sentinel-cyborg-reconciliation.md](state-archive/2026-08-18--nova-055-afk-block-through-sentinel-cyborg-reconciliation.md) |
| 2026-07-30 to 2026-08-07 | Earliest Nova/0.4.7 history (2026-07-30 to 2026-08-07): guard-hardening rounds T1-T7, ADR-0051-0056 adoption, authority-tier drift, marketplace-rename saga, 0.4.7 release qualification. Extraction pass complete (ADR-0066 Decision 6/7); two homeless findings filed as their own backlog items. | [docs/state-archive/2026-08-18--oldest-nova-047-history.md](state-archive/2026-08-18--oldest-nova-047-history.md) |

## Operational head

- Project calibration: [`project/pipeline.json`](../project/pipeline.json) — the
  resolved authority tier (ADR-0046/ADR-0054). `.claude/pipeline.json` is the
  legacy compatibility copy and is no longer what the gates read.
- Required gate: `node harness/scripts/verify.mjs`.
- **0.4.4 managed-workspace hotfix (historical):** Codex managed-workspace
  classifier fix; superseded by current Nova A work. See
  [`release-0.4.4-readiness.md`](release-0.4.4-readiness.md) if needed.
- Formal decisions: [`docs/adr/README.md`](adr/README.md); no state-local
  override is active.
- This file is the sole current/open/next handover under
  [ADR-0012](adr/0012-handover-canonicalization.md) and
  [ADR-0015](adr/0015-self-application.md).
- No reusable full-bootstrap receipt is stored publicly. Run the full bootstrap.
- Git availability and version are probed locally; machine-specific installation
  details are never versioned here.
- The candidate reconciles public marketplace/self-application assumptions,
  portable Verify boundaries, public-root documentation links, scanner-safe
  Gitleaks fixtures, neutral plugin identity, and the final transfer-completeness
  backlog. The machine-local PO receipt remains outside portable Verify; its
  fail-closed unit/runtime contract remains covered.
- The normative Sentinel Epic authority has been recovered into
  [specs/2026-07-19-sprint-sentinel-epic/](../specs/2026-07-19-sprint-sentinel-epic/):
  the Public-safe PRD, technical Spec, backlog acceptance matrix,
  Public/Private reconciliation design, and recovery record. SNT-A remains a
  completed prerequisite slice; it is not the Sentinel Epic close.
- A retention defect is recorded in
  [backlog/items/2026-07-20-spec-retention-on-close.md](../backlog/items/2026-07-20-spec-retention-on-close.md).
  Close/transfer must preserve normative PRD/Spec authority or fail closed with
  an explicit durable destination and PO disposition.
- The retention guard is now executable through
  [`governance/spec-retention.json`](../governance/spec-retention.json): the
  active Sentinel authority is byte-bound to
  [`docs/spec-archive/2026-07-20-sentinel-recovery/`](spec-archive/2026-07-20-sentinel-recovery/)
  and checked by `close.pre`. The archive contains only the Public-safe
  authority files, not private runtime evidence.
  The handover links the active
  [`prd_sentinel-epic.md`](../specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md),
  [`spec.md`](../specs/2026-07-19-sprint-sentinel-epic/spec.md),
  [`backlog-acceptance-matrix.md`](../specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md),
  [`public-private-reconciliation-design.md`](../specs/2026-07-19-sprint-sentinel-epic/public-private-reconciliation-design.md),
  [`RECOVERY.md`](../specs/2026-07-19-sprint-sentinel-epic/RECOVERY.md),
  [`platform-support-contract.md`](../specs/2026-07-19-sprint-sentinel-epic/platform-support-contract.md)
  and [`windows-blockers-scope.md`](../specs/2026-07-19-sprint-sentinel-epic/windows-blockers-scope.md)
  directly.
- The executable preparation for the non-Windows Sentinel lines is recorded in
  [`non-windows-close-preparation.md`](../specs/2026-07-19-sprint-sentinel-epic/non-windows-close-preparation.md).
  It separates local AC/evidence work from real host, Human and remote gates;
  it neither changes a backlog status nor authorizes a transition.
- The current Codex host is native WSL2 for `wsl-native` evidence; `wsl-drvfs`
  remains a separate unobserved surface. The PO accepts unavailable native
  macOS evidence for the Sentinel-close disposition only, with review by
  2026-08-31; this does not claim macOS support or waive other platform gates.
- Public remote heads are reduced to unchanged `main` and
  `feat/v3-public-core-foundation`. Anonymous obsolete lines have public
  recovery tags; histories with non-neutral authorship remain offline only and
  were not republished as Public tags.
- Portable implementation from Multi-CLI 0.3, Storm, Batman, and Hawkeye was
  audited without finding a missing Public implementation file. Remaining
  Sentinel go-live work is explicit Public backlog, not an imported private
  authority or a completion claim.
- The preceding session loaded Public plugin version
  `0.2.0+codex.20260720222336`; this block registered
  `0.2.0+codex.20260721050314` from the current feature-branch worktree. The
  local marketplace was replaced with that source and the plugin read back at
  the new version. The exact candidate `d5f7406109c50854de0b43850c1192ba158e5437`
  is pushed and HTTPS-read back on `feat/v3-public-core-foundation`. A fresh
  Codex thread must still run the full bootstrap before runtime evidence may
  trust the refresh.
- Advisor export consent is durably recorded as repository-scoped `approved` in
  `pipeline.user.yaml`. It is standing consent for the configured allowlist,
  not a per-request prompt: setup reports only the bounded approval/disabled
  state. It never prints raw questions, answers, credentials, paths, or
  environment details. The approved export remains one-question and
  allowlist-bound; a different data class, provider, or packet boundary is
  not approved by it.
- **0.4.1 authority-update hotfix:** the `#53` observation identified that a
  Slim Private Overlay with a stale but structurally valid Core lock could not
  obtain a digest-bound update preview. The hotfix adds the host-attested
  `authority-plan` / `authority-activate` path: it derives the replacement
  only from the selected Public Core and installed plugin, binds the old lock
  as the transactional preimage, rejects runtime-projection drift, and
  revalidates normal admission after the explicit digest-bound write. The
  consumer must still commit and push its own updated binding through its
  private workflow; no Public claim includes private coordinates or lock bytes.
- **PO intermediate-push exception, 2026-07-23:** this current `main` push is
  a Windows-enablement snapshot, not final Sentinel evidence. It receives
  `git diff --check` and only minimal focused contract probes; Full Verify,
  Security and aggregate Critic gates are explicitly deferred to the later
  integrated candidate. It closes no issue and claims no release/go-live.
- **Windows parallel handover:** after this push, one branch
  `feat/sentinel-windows-34-37-close` may rebase onto its exact public OID and
  deliver the resolvable `#34`–`#37` chain in one return. It owns the
  Windows-specific cores of `#34`, `#35`, and `#37`, then `#36` in the same
  branch. Shared Verify, state, runtime and capability-inventory integration
  happens only after that rebase; no current unpushed WSL bytes are input.
- The PO confirmed SUL-1.0 as the best-fit standard source-available license and
  accepted that no custom lawyer-reviewed two-user license is being offered.
  The commercial boundary and this disposition are recorded in the Public
  license evidence; release and hosted/commercial rights remain separate gates.
- The current continuation made one native Selected-Sandbox advisory attempt;
  the host returned typed `sandbox_selection_unavailable` without starting a
  child. The PO-authorized ADR-0041 functional-equivalent consult then
  answered exactly one fresh read-only question. This is gate-capable only
  with the residual assurance that no Selected-Sandbox execution, OS isolation,
  or model identity is asserted.
- SNT-A1 through SNT-A4 are implemented. Focused tests and Full Verify passed
  at candidate `f7e76063c9e15b136fbd8344dcd54a12c1bd0d36` (tree
  `375601dcfd4f23aa0669e39d2e652aca10381d46`). The independent SNT-A Critic
  and bounded observation privacy delta review both passed under the documented
  functional-equivalent read-only assurance.
- Public Issue intake privacy is signed off: SCP-style references fail closed
  and structured GitHub references are canonical, same-target and free of
  query, fragment and percent encoding. The 19/19 focused evidence is
  candidate-bound. Issue publication is a next-session action requiring
  GitHub capability readback; observations remain unverified.
- The SNT-A contract observes the selected Git marketplace source and flattened
  installed cache independently, requires byte equality, validates the slim
  overlay lock and closed Markdown namespaces, writes only through a reviewed
  digest-bound activation, publishes a machine-local PO-profile receipt, and
  keeps private values out of machine evidence. No private repository
  coordinate, identity, path, secret, receipt, or runtime value is recorded
  here.
- The PO changed remaining and follow-up work to Luna/medium after the weekly
  high-profile limit was exhausted. No evidence here claims an observed
  effective model identity. Earlier Sol/Terra route decisions are configuration
  decisions, not runtime evidence.
- The generic plugin validator still rejects the manifest `hooks` extension and
  two deliberate non-model-invocable workflow skills. Passing Public parity
  classifier tests is not native validator admission evidence.
- Recovery-preview callback attestation, evidence-bound review retries,
  private-overlay activation, and target-bound cross-repository override
  ledgers are explicit Public backlog designs, not completed runtime claims.
- A focused Public recovery-preview attestation candidate now exists at
  [`plugins/pipeline-core/lib/recovery-preview-attestation.mjs`](../plugins/pipeline-core/lib/recovery-preview-attestation.mjs)
  with fail-closed coverage for absent, empty, throwing, async, malformed,
  replayed, invocation-mismatched, and digest-mismatched acknowledgements.
  The callback now has a bounded synchronous timeout and typed
  `RP-CALLBACK-TIMEOUT` failure coverage. Its focused Spec-retention companion
  checks are additively registered in the central Verify suite under the
  explicit TP-3 exception; no completion or go-live claim is made. The
  independent Critic still failed the broader recovery package for replay
  acknowledgement/API migration and candidate-bound evidence concerns; those
  findings remain open and the item is not closed.
- Repository freshness now reads the source checkout's effective
  `core.sshCommand` through Git and binds the same transport context to the
  disposable bare fetch and the exact-OID fallback. The source checkout remains
  read-only; absent or unsafe transport configuration remains a typed
  fail-closed `unknown` result.
- The project-scoped GitHub Issue capability is now a separate Public skill with
  target/operation/field validation, exact mutation previews, local `gh`
  credential boundaries, and readback verification. It does not widen the
  fixed Public observation target or permit delete, transfer, settings, or
  permission mutations.
- The canonical backlog checker now reports legacy/unshaped backlog input
  fail-closed without crashing. The repository still lacks the canonical
  backlog schemas, transition ledger, and projections; SNT-7 remains open and
  no backlog status transition is inferred from this diagnostic repair.
- TP-3 and TP-5 were temporarily removed only under explicit PO authorization
  for this bounded work, then restored exactly before final verification.
- For the current Sentinel/governance block the PO additionally authorized
  bounded TP-3, GG-13 and TP-5 overrides. Only TP-3 has been exercised so far:
  its protected-path entry was removed solely while a briefed Goldfish added
  the ten SNT-A/governance Verify suites, then restored byte-for-byte. GG-13 and
  TP-5 remain configured and unused unless a later exact approved step needs
  them.
- Authorship correction: the formerly unpublished Goldfish implementation
  commits carry factual `Dispatch:` task lines and anonymous `AI-Assisted: true`
  markers. This does not claim retroactively created dispatch records; the
  preventive provenance backlog remains open.
- Close authorship incident (EL-01): the later privacy/governance correction
  commits were authored by the Elephant outside the stage-0 fast path. They are
  disclosed in this handover and telemetry; no dispatch provenance is invented.
- One PO-confirmed GG-03 override authorized only a normal private-overlay
  `main` fast-forward. Its audit record remains private and local. The residue
  check caught that cross-repository ledger placement initially selected the
  coordinator checkout; no such entry was staged or committed Public.
- Full Verify at candidate `f7e76063c9e15b136fbd8344dcd54a12c1bd0d36`
  completed with exit 0 and exact machine-written Verify/Security evidence
  through the approved host boundary after a sandbox-only `EPERM` attempt.
  Documentation-only close mutations require the exact final Verify tail.
- The pre-close candidate `cb8219464937cfc4cb7ff50e2bf5579bfa78f6b5` passed the
  full Verify and Security gates with exit 0. The close metadata commit
  `cb9de1ca5c2d0a7403cd55743ff47a7c19cf83dd` and its exact remote fetch-back
  are complete; this handover therefore records residual Sentinel work rather
  than an unfinished delivery tail.
- The final recovery-timeout candidate `d5f7406109c50854de0b43850c1192ba158e5437`
  passed the full Host Verify and Security gates with exit 0. The exact
  evidence files bind that commit; the feature branch was pushed and fetched
  back at the same OID. This is delivery evidence for the quickfix, not a
  Sentinel go-live or PO-gate completion claim.
- Session PO authorizations for this Sentinel continuation: the bounded TP-3
  exception may be used for additive Verify registrations and restored after
  each edit; after all required gates and exact remote readback are green, the
  committed Public-Core result may be pushed to the currently checked-out
  feature branch. This does not authorize `main`, tags, private remotes, or a
  push of an unverified/partial candidate.
- **PO-Autorisierung, 2026-07-21 (diese Sentinel-Fortsetzung):** Nach dem
  erfolgreichen initialen Verify sowie den zwei zuvor vorliegenden
  Verify-/Review-/Test-Evidenzpunkten dürfen nachfolgende Kandidateniterationen
  Diff-Prüfungen und die unmittelbar betroffenen Gates verwenden, statt Full
  Verify jeweils erneut auszuführen. Jede Scope-Erweiterung oder Änderung einer
  Security-Oberfläche erfordert weiterhin die vollständigen Gates.
- **PO-Autorisierung, 2026-07-21 (temporäre Schutzaufhebung):** TP-1 bis TP-5
  dürfen in dieser Sitzung nur während der Bearbeitung ihrer jeweils exakt
  geschützten Dateien vorübergehend aufgehoben werden. Jeder aufgehobene Eintrag
  ist vor Staging, Commit oder Push wiederherzustellen. Dies autorisiert weder
  einen `main`-Merge noch einen Statusübergang oder einen weitergehenden
  Guard-Bypass.
