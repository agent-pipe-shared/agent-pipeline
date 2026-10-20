# Full Verify correction plan (2026-10-20)

Source: the measurement run of `c1771bc98`
(`specs/sprint-alfred-epic/evidence/full-verify-c1771bc98/`). 138 of 1057 steps are non-zero. Each
red suite was rerun alone in the clone (`fv-c1771bc98-classified*.json`), and every `test-red`
suite was rerun once more in the working checkout (`fv-causes.md`). All 103 test-red suites are
also red in the working checkout, so they are real reds, not fresh-clone artefacts. The sample
traced so far (the session-cleanup binding refusal) dates from the checkpoint import `d02409a8a`
(2026-10-12): these reds accumulated unmeasured, they are not one recent regression.

Protected among the red test files: only `hooks/guard-gate-strength.test.mjs` (TP-6) and
`hooks/notebook-write-coverage.test.mjs` (TP-10). The case-id registrations are protected
(`verify.mjs` TP-3, `verify-suites.json` TP-13) and go to C15/C16. Everything else is Goldfish work.

Fix rule for every cluster: decide per failing case whether the code or the test is wrong
against the Spec. A test is changed only when the Spec or an ADR changed the contract it pins
(for example ADR-0085), and the report names that source. No assertion is weakened to turn a
real defect green.

## Clusters

| # | Cluster | Suites (failing cases) | Signal | Owning item (D60 Q16) |
|---|---|---|---|---|
| K1 | Session-authority domain and continuity binding | session-cleanup-binding (39), session-cleanup-recovery (6), session-cleanup-power, design-workflow-package-builder (3), codex-critic-host CCH136, codex-critic-session-route, codex-design-advisor-host, afk-transaction-host (2), guard-dispatch-native-worker, native-goldfish-host-state-regression (3), pin-orphan-descriptor-recovery (AC-203), model-family-execution MFE018 | `domain-ancestor-unsafe`, `SDC-AUTHORITY-UNAVAILABLE`, "continuity current invocation required before binding", `SQ-AUTHORITY-UNAVAILABLE` | AC-224 (PF-55 area); AC-203 |
| K1h | Hang group (4.4-5.0 h each in Verify) | onboarding-continuity, design-workflow-package-v2, agy-session-dispatch, native-goldfish-host-state, native-goldfish-host-finalizer, project-reset-git-hooks, model-family-host-store, model-family-invocation (+ signing-disclosure-sweep, codex-pretool-guard, project-onboarding-v3 long) | not rerun alone yet; likely one shared lock or registry wait | measured first (K1 package), then owner |
| K2 | ADR-0085 retirement not followed by tests | project-onboarding-e2e (`DWP-PRESENT-RETIRED`), spec-readiness-host (3, `DESIGN-COURSE-RETIRED`), design-workflow-package-route R4-T0-6, measure-tofu-push-e2e, pin-approval-bound-design-package (4, AC-113), pin-configure-verify (4), interruption-receipts | retired route still exercised | AC-151 / AC-245 / AC-113 |
| K3 | Architecture decisions (AC-19) | architecture-effective-decisions (7), architecture-baseline, architecture-decision-continuity, architecture-entry-required-source (2), rigor-floor (5), guard-push-architecture GPA001 | `decision-adoption-unverified`, inputDigest instability | AC-9 / AC-119 area (epic AC-19) |
| K4 | Human approval and signed integration | guard-human-override (4), human-guard-override-capability-scan (3), commit-msg-hook-signed-integration (7), guard-git-signed-integration (5), model-family-approval-request MFA010, critical-action-approval-request, threat-model-approval-request (fixture not a Git repository), guard-gate-strength-ledger (2) | approval list and fixture drift | AC-123 / AC-207 |
| K5 | Documentation and text contracts | pipeline-start-v3 PSV04, language-canon, push-release-flow-docs-contract (3), doc-contract-tests (3) + doc-contract-check, license-contract-check, phase3-sdlc-coherence, no-autoupdate-key, product-capability-inventory (4), hook-governance-scope (unadmitted `claude-task-output-scope-posttool.mjs`), spec-retention-check | text or inventory drift | D60 doc contracts; AC-12 |
| K6 | Dispatch authorship and Critic coverage | dispatch-authorship-verify (7), check-critic-skip-coverage (5) + its check, verify-evidence-producer (5, `SCF-GENERIC-BATCH-REQUIRED`), session-critic-finalizer, critic-review-lineage, codex-critic-packet-host, codex-isolated-critic-protected-preimage, portable-agy-authorship-export | T0/T5 classification, record shape | AC-142 |
| K7 | Registration checkers | verify-case-completion-registry + check, verify-suite-registration + check, suite-registration-check, verify-suite-append-history-check, and the 10 case-drift suites | protected registrations | C15, C16 |
| K8 | Guard hook suites that crash or time out | guard-apply-patch, guard-devplan, guard-gate-strength (TP-6), notebook-write-coverage (TP-10), antigravity-pretool-guard, lifecycle-denial-loop RC04C001, codex-session-start-hint SSH003 | whole-file failure after 30-95 s | AC-195 / AC-247 area; TP-6/TP-10 to the bundled ceremony if the test must change |
| K9 | Remaining single suites | control-placement, agy-final-return AFR18, slice-queue-cli SC15, pipeline-state-rebind-runner (2), codex-host-output-custody (9), pipeline-state-late-verify, local-worker-supervisor-cli (9), nova-verify-journal (3), afk-claude-host, afk-activation, runner-contracts.schema (mechanic.claude tuple), gitleaks near-miss, security-scan + security-scan-snapshot (2), pipeline-start-preflight-pre-push-observation, wire-dispatch-budget-hook (7), guard-dispatch-budget-checkpoint GDBC10, pipeline-state-push-anchor (3), design-approval-command-admission, design-advisory-admission-cli (2), r7-3-bound-paths, agy-session-authority (2), goldfish-antigravity-live-host, pipeline-start-preflight-enforcement (2), the Windows and WSL pins, pin-no-uninstall, pin-worktrees (AC-274), pin-draft-phase (AC-167), pin-claude-session-start | mixed | per suite, by area |
| K10 | Green alone, red only in Verify | wsl-ipc-compatibility, stop-fanout, runner-profile-migration-v3, project-authority, guard-dispatch, dispatch-policy, governance-action-artifact, dispatch-budget-binding, dispatch-record-strip-for-critic, security-scanner-diagnostics, architecture-prospective-companion, session-authority-repair; scratch-package-staging needs Verify's FD3 | Verify-only cause (load, shared state, case completion) | measured with K1h |
| — | Typed pending by D66 | MFHS002-008, MFHS023, MFHS028, MFI012, MFI013, MFMP003, CADH001, readiness-host case | assertions unchanged, counted pending | AC-212 |

## Order

1. K1 with K1h and K10 first: one deep package measures whether one shared cause (the session
   authority registry or its lock) explains the hang group and the Verify-only reds, and fixes it.
2. K2, K5, K6 and K7-prep in parallel-safe sequence (one Goldfish at a time on this checkout).
3. K3, K4, K8, K9 after.
4. Then the bundled ceremony (C15, C16, any TP-6/TP-10 drop-in, the protected content parts),
   then the final Full Verify in a fresh clone.

Each package names its owning item, so the item route admits the dispatch.

## Cluster closure rule (PO, 2026-10-20)

"wir brauchen nach jedem cluster einem Abschluss weil sonst durch neue Sessions und compacts das
wissen verloren geht". After each cluster (and after each measurement that changes a cluster's
direction) the Elephant appends a closure entry below and commits it before starting the next
cluster, and adds one line to `docs/state.md`. A new session or a Compact resumes from these
entries and does not re-measure what they record. Each entry names: status (closed, partly closed
with named rest, or re-scoped), what was measured, the cause, the commits, the counted green runs
(command and counts), the cases still red and where they went (item, ceremony entry, decision),
and the next step.

## Cluster closures

### M0 measurements before K1 (2026-10-20, HEAD `2f267d2a9`)

- **Status:** measurement done; changes the direction of K1, K1h and K6.
- **Pre-existing at the checkpoint import:** in a scratch worktree at `d02409a8a` (2026-10-12),
  `session-cleanup-binding.test.mjs` is red 39/64 with the same cases, and
  `architecture-effective-decisions.test.mjs` is red 7/12. K1's session-cleanup part and K3 were
  imported red; they are not a regression of the D47-D52/PF-55 work.
- **Regression after the import:** `dispatch-authorship-verify.test.mjs` is green 64/64 at
  `d02409a8a` and red 7/65 now. K6 is a regression after the import; its package bisects
  `d02409a8a..HEAD` first.
- **Hang group is Verify-only:** `native-goldfish-host-finalizer.test.mjs` alone in the working
  checkout runs green 15/15 in 551 s (`node scratch/run-capped.mjs 600 <file>`); in Verify it ran
  16 000 s and failed. The K1h cause is parallel contention or a shared resource under Verify, not
  eight suite defects; the suite is also slow alone (551 s). K1h and K10 become one Verify
  scheduling or shared-state package, measured under Verify's own concurrency.
- **Next:** check the dispatch admission (item row) for each cluster's owning item; cross K1 with
  the E24/E32 case list (D66 parks those cases as typed pending); order K6 after the wave-1
  packages AC-142 and AC-224, whose write scopes overlap it.
- **Admission check (done 2026-10-20):** K3 and K5 have no item row (epic AC-19 and AC-12);
  decided as D68: K3 goes to AC-119, K5's documentation is fixed by the Elephant directly, and its
  checker change runs under the D68 exception.

### W1 wave-1 Goldfish packages (2026-10-20, closed at `c578670d7`)

- **Status:** closed. Implementation complete; batch Critic review and PO acceptance pending.
- **AC-142 (PF-34, PF-57 (1)):** the first dispatch `ALF-D61-AC142` measured that the route
  itself (review unit at registration, `register-feature-package.mjs --add-review-unit`, the v2
  schema in both templates) was already delivered by `cf658960c`, and spent its budget on that;
  no edits; slice cancelled `--started`. The follow-up `ALF-D61-AC142B` (`db930a359`, plus
  whitespace `991da6f54`) adds the `repair` text to the `CCA-REVIEW-UNIT-REQUIRED` refusal and an
  arguments gate as the first step of the `critic-review` skill. Orchestrator run:
  critic-dispatch-preflight 46/46 (case CDPF003 RED before, GREEN after per the Goldfish),
  critic-course-admission 18/18, check-consumer-safe-paths 9/9.
- **AC-224 (PF-57 (2)):** `ALF-D61-AC224` (`65452bd6f`, plus the one-line CLI parse fix
  `ac7ce96d1`) adds `verify-evidence-producer.mjs --commit <sha>`: Verify for that local commit in a
  temporary owner-only worktree under the Git common dir, removed on success and failure; typed
  codes VEP-COMMIT-INVALID, -NOT-LOCAL, -MODE, -WORKTREE, -CLEANUP. Orchestrator run:
  verify-evidence-producer 34/39 with exactly the five pre-existing reds (red with the same names
  at `d02409a8a`, K6), critic-dispatch-preflight 46/46, check-consumer-safe-paths 9/9. The first
  run of the three worktree cases failed with `VERIFY-JOURNAL-DIRECTORY-NOT-PRIVATE` until the
  container was created 0700.
- **AC-155A (D64 receipt provenance):** `ALF-D61-AC155A` (`c578670d7`): the receipt producer no
  longer reads the Critic profile's model; role, requested route and observed identity are
  reported separately, `reviewer.model` carries the observation or `unknown`. Orchestrator run:
  design-review-receipt 32/32 and fourteen neighbouring suites green; the two receipt-using pins
  that stay red (approval-bound-design-package 4/11, configure-verify-names-the-unmet-condition
  4/6) are red with the same counts in the Full Verify measurement (K2).
- **Rest, with owner:** the CCA019+ admitted-course case for AC-142 was not built (it needs a new
  case-id registration, C15/C16); `CCA-REVIEW-UNIT-BINDING` for a course with a retained review stays
  a PO design point; `--commit` with the Critic-bound options, release, push and `--event-out` is
  refused, not implemented; a SIGKILLed `--commit` run leaves an orphan container (no sweeper);
  Windows private-directory handling of that container is unverified; the receipt library cannot
  persist role and route (`lib/design-review-receipt.mjs` fixes `reviewer` to `{model, runner}`);
  the receipt test header prose is stale; `codex-isolated-critic-protected-preimage` pins are stale
  and now also miss the new `skills/critic-review/SKILL.md` digest (K6);
  `lib/git-cmd.test.mjs` is 1407 lines, past its accepted 1384 (the AC-238 cases, `4838c0efc`),
  a second architecture-check violation beside guard-git.test (Q15).
- **Next:** K1 (session-authority domain and continuity binding) with K1h measured first under
  Verify concurrency; cross K1 with E24/E32 before briefing.

### K1 measurement 1 (2026-10-20, dispatch ALF-K1A-SESSION-CLEANUP, no edits)

Interim entry, not a closure. Owner item: AC-203 (the only session-cleanup item with a Spec row);
the earlier holding slices ALF-C-SDC-AUTHORITY2, -3 and ALF-W3-SESSION-REGISTRY were cancelled as
never started. The dispatch stopped at its budget checkpoint after classifying:

- `scripts/session-cleanup-binding.test.mjs` red 39/65 and `lib/session-cleanup-recovery.test.mjs`
  red 6/39 (the briefing named a wrong `scripts/` path for it; the briefing generator now checks
  every scope and check path) share one cause: `bindOnboardingSessionCleanup`
  (`lib/onboarding-continuity.mjs` 9566-9575) refuses outside a source-owned bound context. The
  context is `bound` only inside `withSourceOwnedAuthorityContext` (`lib/session-requester-bridge.mjs`
  197-205) over a requester bound by `bindSourceOwnedRequesterInvocation` (184); fixture-side
  builders exist (`createControlledMethodRuntimeFixture` 686,
  `createSourceOwnedApprovedControllerRequesterRuntime` 1599, `lib/test-item-approved-course-fixture.mjs`).
  Open design point: the binding also requires `request.sessionCleanup` to equal the requester's own
  `{sessionId, descriptorSha256}` (9574-9575), while the `start` verb creates the descriptor and binds
  in one call; whether a test seam can supply that, or a product change is needed, is unresolved.
- `scripts/session-cleanup-power.test.mjs` (0/2) has another cause: its fixture never initializes the
  session-authority registry (`catalogue.json` ENOENT through `writeSessionPowerRecord` ->
  `reserveSessionAuthorityMember`, `lib/session-authority-registry.mjs` 108/386/409); the existing
  route is `initializeSessionAuthorityRegistry` (395) as used by `lib/test-item-approved-course-fixture.mjs`
  line 59. Under a world-writable TMPDIR the same call fails earlier with `domain-ancestor-unsafe`.
- **Next:** K1b (power fixture: initialize the registry, small) and K1c (binding and recovery:
  settle the descriptor-tuple question first, then the fixtures), one at a time.

### K1 measurement 2 (2026-10-20, dispatches ALF-K1B, ALF-K1C, ALF-K1C2)

Interim entry, not a closure.

- **K1b closed:** `ec0999ade`, session-cleanup-power 2/2.
- **Tuple question settled without a product change:** `start` on the unbound branch refuses when any
  active descriptor exists (`scripts/session-cleanup.mjs` ~796-802) and `startSessionDescriptor`
  throws for an existing id, so a pre-created descriptor is never reused. The fixture therefore
  creates descriptor and requester lazily at the `startSessionDescriptorFn` seam
  (`createControlledMethodRuntimeFixture`) and runs the real bind inside that requester's context at
  the `bindOnboardingSessionCleanupFn` seam. ALF-K1C stopped at its budget with a partial; ALF-K1C2
  continued it (`9bf8a8619`).
- **Second refusal found:** after the context and tuple checks pass, `continuityJoinActualBoundCleanupOwner`
  (`lib/onboarding-continuity.mjs` ~9850) refuses a project whose State is not in the neutral layout
  (`observeSessionCleanupState(...).neutral`). The fixture migrates a legacy root to neutral on the first
  bound start unless the case pins the legacy layout.
- **Counted (orchestrator, `node scratch/run-quiet.mjs`):** session-cleanup-binding 46/66 (HEAD 26/65; the
  20 reds are a subset of the 39 HEAD reds, no regression; one new case pins the plain-process refusal);
  session-cleanup-power 2/2; check-consumer-safe-paths 9/9. session-cleanup-recovery unchanged 33/39.
- **Remaining binding reds, by cause:** (a) 7 legacy-layout cases (historic legacy binding recovery):
  a bound bind cannot create a legacy binding; needs historic legacy binding bytes written by the fixture
  as an artifact, or a product decision; (b) 10 cases fail 'continuity owning release failed'
  (SDC-AUTHORITY-UNAVAILABLE) after the bind succeeds; hypothesis: release after descriptor retirement
  no longer satisfies `continuityAuthorityCurrent` (~9515); (c) neutral coordinator-close release:
  'continuity owner preparation refused'; (d) single-unbound-descriptor case still creates its
  descriptor in a plain context; (e) ordinary orphan release: `onboarding-continuity:namespace-drift`.
- **Product observation for an item:** the session-authority domain refuses any group- or
  world-writable ancestor (`lib/session-authority-domain-owner.mjs` chain(), `mode & 0o022`), with no
  exemption for a sticky root-owned `/tmp`; four suites (codex-critic-host, afk-transaction-host,
  codex-critic-session-route, codex-design-advisor-host) fail in Verify with `domain-ancestor-unsafe`
  because their fixtures sit under the ambient TMPDIR (K1d). A repository under `/tmp` or created
  under umask 002 would be refused the same way; its repair text is unchecked.
- **Next:** K1c3 ports the pair to session-cleanup-recovery; K1c4 diagnoses (b)-(e) and builds (a);
  K1d measures the four ancestor suites under a private TMPDIR.

### K1 measurement 3 (2026-10-20, orchestrator, private TMPDIR via `scratch/run-quiet.mjs` / `run-detail.mjs`)

Interim entry. The ambient-TMPDIR hypothesis explains only the Verify spelling of the failure: under a
private TMPDIR the four `domain-ancestor-unsafe` suites are still red, with these causes:

- afk-transaction-host 0/2: `catalogue.json` ENOENT from `reserveSessionAuthorityMember`, the K1b cause
  (fixture never initializes the session-authority registry). Fixture fix.
- codex-critic-host 135/137 (CCH136, CCH137), codex-critic-session-route 4/5, codex-design-advisor-host
  0/1 (CADH001): `MODEL-FAMILY-NATIVE-REQUEST-REFUSED` (CCH137 surfaces as `child-spawn-failed`).
  CCH136 and CADH001 are already bound to E24 and parked by D66 as typed pending; CCH137 and the
  session-route case take the same path and go to the D66 package for confirmation and binding.
- design-workflow-package-builder 0/3: `CTFR-HOST-UNAVAILABLE`, transport `host-process-repository-drift`.
- guard-dispatch-native-worker 3/4 (GDW01): `SQ-AUTHORITY-UNAVAILABLE` (the fixture has no valid v2
  `slice-queue.json` for an approved feature).
- native-goldfish-host-state-regression 0/3: `WT-GIT-FAILED` from `prepareNativeGoldfishHostState`; the
  fixture is a bare `.git` directory with an injected `git`, so a product path now runs a real Git call.
- model-family-execution 18/19 (MFE018): `S4 activation failed: MODEL-FAMILY-AUTHORITY-UNAVAILABLE`.
- Verify-level rest (K1h/K10): Verify passes the ambient TMPDIR to every suite; whether Verify should
  give each suite a private TMPDIR (protected `verify.mjs`, a C15 drop-in) or the fixtures move to
  `mkdtempTestScratch` is decided with K1h.
- **Packages:** K1c3 (recovery port), K1c4 (binding rest), K1f (native-goldfish-host-state-regression and
  guard-dispatch-native-worker), K1g (afk-transaction-host, design-workflow-package-builder, MFE018);
  the model-family group goes to the D66 typed-pending package.
