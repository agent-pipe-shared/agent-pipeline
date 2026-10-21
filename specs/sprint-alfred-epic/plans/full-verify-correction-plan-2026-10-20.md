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
| — | Typed pending by D66 | MFHS002-008, MFHS023, MFHS028, MFI012, MFI013, MFMP003, CADH001, readiness-host case; from K1: CCH136, CCH137, codex-critic-session-route, MFE018; from K1h: agy-session-dispatch AGY-S2S4S5 | assertions unchanged, counted pending | AC-212 |

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

### K1 measurement 4 (2026-10-20, dispatch ALF-K1C3-SESSION-RECOVERY and orchestrator code reading)

Interim entry. Changes the direction of K1c4.

- **K1c3:** `7ad584f18`, session-cleanup-recovery 35/39 (HEAD 33/39; the 4 reds are a subset of the 6
  HEAD reds; orchestrator run `node scratch/run-quiet.mjs`). Binding suite unchanged 46/66.
- **Finding A, a product dead end (AC-203's own defect):** the production recovery routes
  `release-lost-binding` and `retire-orphans-release-lost-binding` (`lib/session-cleanup-recovery.mjs`
  ~793, ~1216, ~1835) call the public `releaseOnboardingSessionCleanup`. That function releases only
  a binding recorded in the in-process map `continuityAuthorityDirectBindings` (onboarding-continuity.mjs
  ~9594-9596, 'continuity owning execution recovery required before release'); the owning terminal
  `continuityAuthorityFinish` (~9508) needs `continuityAuthorityCurrent` (~9310), which accepts only a
  live bound requester or a retired-owner scope built from an owner invocation retained in the same
  process (~11103-11123). After a host crash the process is gone and the descriptor is lost, so neither
  exists: the recovery verb the AC-203 item asks for refuses. Entering the requester context fails
  earlier with `WT-SESSION-MISSING` (the descriptor is gone). Same cause as group (b), 10 binding cases.
- **Finding B, legacy layout:** a bound bind refuses a non-neutral State (`continuityJoinActualBoundCleanupOwner`
  ~9850). ADR-0054 keeps the `.claude/` tier supported "for several releases", so the cases that
  recover a historic legacy binding stay valid; they need the historic binding bytes written by the
  fixture as an artifact, not a bound bind (7 binding cases, 1 recovery case).
- **Finding C, fixture builder gap:** RF2A needs a bound descriptor whose owner is unavailable;
  `createControlledMethodRuntimeFixture` (session-requester-bridge.mjs 686) always starts the descriptor
  with the live test pid and has no owner option.
- **K1c4 is held** until the PO decides A-C (tiles).

### K1 measurement 5 (2026-10-20, dispatch ALF-K1-LOST-BINDING-RELEASE, no edits; orchestrator checks)

Interim entry. PO decided A-C as D70 (all (a)).

- **The first D70 (a) dispatch** spent its budget reading and returned a design, no edits. Corrections it
  found: call site ~1216 (`applyOrphanDescriptorArchive`) is not an activated recovery verb and stays
  as it is; the activated sites are ~793 (composite apply) and ~1835 (`release-lost-binding` apply).
  The two red cases must run the apply in a fresh process, because in one process the bind leaves the
  binding in `continuityAuthorityDirectBindings`. Design: zero-growth `export` of
  `releaseOnboardingSessionCleanupInternal` and `continuityAuthorityRepository`; a new module
  `lib/session-cleanup-lost-binding.mjs` that checks the activated plan itself, the binding tuple, the
  State CAS and that no descriptor or owner is live, then releases inside `withSessionAuthorityBoundary`.
- **Registry gap (orchestrator, code reading):** a crashed process leaves the onboarding-continuity
  member `armed` and bound. `healDrift` (`lib/session-authority-registry.mjs` 310-331) deliberately
  skips a producer with a bound armed or running member, so after the binding is released the
  registry would refuse with `onboarding-continuity:namespace-drift`, and its repair text points at
  slice cancellation, which does not apply to a continuity member. The D70 (a) route therefore also has
  to bring that member to a terminal state (or the heal has to admit a member whose descriptor is
  absent and whose owner is not live). This touches the registry.
- **Line bounds (ratchet):** `node plugins/pipeline-core/scripts/architecture-boundary-check.mjs` reports
  four violations: `scripts/session-cleanup-binding.test.mjs` 3242 lines (accepted 3138) and
  `lib/session-cleanup-recovery.test.mjs` 1502 (accepted 1422), both grown by `9bf8a8619` and
  `7ad584f18`; plus the known `hooks/guard-git.test.mjs` and `lib/git-cmd.test.mjs` (W1 rest, Q15).
  `lib/onboarding-continuity.mjs` (12295), `lib/session-authority-registry.mjs` (1390) and
  `lib/session-cleanup-recovery.mjs` (3161) are exactly at their accepted bounds.
- **Next:** K1s splits the shared bound-requester fixture helpers of both session-cleanup suites into one
  test fixture module, bringing both files back under their bounds with unchanged counts; then the
  D70 (a) route is re-dispatched with the corrected design, the registry member in scope, and the rule
  that new code goes to new modules.

### K1 measurement 6 (2026-10-20, dispatches ALF-K1S, ALF-K1-LOST-BINDING-RELEASE2/3, ALF-K1-LOST-BINDING-WIRE)

Interim entry.

- **K1s:** `d82f24747`, the shared fixture module `lib/test-session-cleanup-requester-fixture.mjs`; both
  session-cleanup suites back under their line bounds, counts unchanged.
- **D70 (a) delivered (implementation complete; Critic batch with the security read and PO acceptance
  pending):** `d2602f5cf` (route, registry step, fresh-process helper) and `5e5c7d8f2` (wiring).
  `lib/session-cleanup-lost-binding.mjs` checks activation, plan digest, binding tuple, State CAS and
  that no descriptor or owner is live; inside one registry boundary it first closes the crashed
  in-flight continuity member (`releaseLostSessionAuthorityMember`, the only new registry export, which
  refuses while the target's active descriptor exists), then releases the binding, then heals and reads
  the registry back. Member-first order keeps a crash between the steps recoverable. The registry step
  first took the descriptor custody lock, which needs the absent active descriptor; removed. Draft
  rejected on review: a registry "kit" exporting raw writers.
- **Environment cause found (D71):** the per-user session-power address root held 4097 slots, past the
  4096 bound, so every session-power address preparation refused (`SP-ADDRESS`); test fixtures leak one
  slot per fixture repository into the real home. 3769 stale slots moved aside (none deleted). The
  binding-suite counts measured before that (32/66, 25/66) are invalid.
- **Counted (orchestrator, `node scratch/run-quiet.mjs`, after the D71 cleanup):** lost-binding 4/4 (new,
  needs C16 registration), session-cleanup-recovery 37/39, session-cleanup-binding 49/66 (the 17 reds are
  a subset of the 20 before), session-authority-repair 10/10, session-cleanup-power 2/2,
  check-consumer-safe-paths 9/9; architecture check: only the known guard-git.test and git-cmd.test.
- **Next:** D71 product fix (test isolation of the address root, repair verb for the bound); D70 (c)
  RF2A owner option; D70 (b) legacy historic bytes (7 binding + 1 recovery case); the remaining binding
  reds; K1f, K1g; then the K1 closure.

### K1 measurement 7 (2026-10-20, dispatches ALF-K1R, ALF-K1-RF2A-ARCHIVE-RELEASE and -RELEASE2)

Interim entry. Changes the direction of RF2A.

- **K1R delivered (implementation complete; D65 security read in the Critic batch and PO acceptance
  pending):** `33fcdf82d`. `session-power-address-repair.mjs plan | apply --plan-sha256 <digest>` moves
  slots of absent repositories aside to `<home>/.apsp-aside/<stamp>/`, deletes nothing, reads back; the
  plan digest binds only the root identity and the candidate set. The `SP-ADDRESS` refusal names the verb.
  Counted: new suite 17/17, power 2/2, consumer-safe paths 9/9, architecture check only the two known
  entries. Live: plan and apply against the real address root moved 139 of 477 slots, readback ok.
  The scratch runners (`scratch/run-quiet.mjs`, `run-detail.mjs`, `run-causes.mjs`) run the repair after
  each suite. The new test file needs C16 registration.
- **Deviation from D72 (Elephant):** Verify runs the repair once before and once after its whole suite
  run, not after every suite: suites run concurrently and `prepareAddressRoot` compares two directory
  listings (`session-power.mjs` 369), so a move during a running suite fails it spuriously. The change
  sits in `harness/scripts/verify.mjs` (TP-3) as a C15 drop-in, `scratch/c15/verify.mjs`
  (sha256 `02258f8174d948ea1ede13edb3bbc4892be58137b7e4858d990fa3c3c2a7c412`, +4 lines).
- **Queue:** `ALF-C-WIN-ANCESTOR2` (AC-270 follow-up for the five other Windows ancestor walkers, never
  started) held `verify-journal.mjs` and `session-requester-bridge.mjs`; cancelled through the guard's
  repair verb, which released ten dependent slices. The walker follow-up is to be re-queued for the
  native Windows session. The first RF2A slice was cancelled `--started` after a budget stop.
- **RF2A finding 1:** a descriptor whose owner process exited reads `not-live`; `archive-orphan` admits
  only `unavailable` and `unobserved` by design (`ORPHAN_ARCHIVE_OWNER_STATUSES`, `worktree-lifecycle.mjs`
  ~1026), because `not-live` has the ordinary retirement route.
- **RF2A finding 2 (invalidates the basis of D70 (c)):** a Source-owned bind refuses a descriptor whose
  owner is not observable: with `ownerPid: -1` the bound start fails at `prepareOperation`
  (`onboarding-continuity.mjs` 9423-9445, 'continuity owner preparation refused'; the catch maps every
  cause to `SDC-AUTHORITY-UNAVAILABLE`), measured in both the recovery RF2A case and the new lost-binding
  cases, whose only difference from the green bound start is `ownerPid: -1`. So an owner option cannot
  produce the RF2A state 'bound + unavailable owner'; under the current contract that state exists only
  as a historic binding, which is D70 (b)'s technique. The RF2A bound case moves onto D70 (b)'s historic
  binding artifact; the bridge `ownerPid` option is dropped (a dead optional key in an authority file at
  its line bound).
- **RF2A2 draft (not committed, not green):** `releaseArchivedOrphanBinding` with typed
  `WT-ORPHAN-RELEASE-*` refusals and the boundary block shared with `releaseLostSessionCleanupBinding`,
  the `applyOrphanDescriptorArchive` wiring (net -4 lines), `sessionCleanupInFreshProcess` in the
  fixture module, two new lost-binding cases (RED 4/6 for the fixture reason above). Saved to
  `scratch/k1rf/rf2a2/` (`node scratch/k1rf/rf2a2-save.mjs restore`); the tree was restored. With the
  draft applied nothing regressed: recovery 37/39, binding 49/66, repair 10/10.
- **Binding-suite causes (clean run, `scratch/run-causes.mjs`, no other dispatch running):** 17 reds.
  7 × 'continuity owning bind failed after reservation' (`SDC-AUTHORITY-CAS`): the legacy-layout group
  (legacy post-close recovery x2, the four apply-recovery event cases, start does not replace a provable
  post-close binding); 3 × 'continuity owning release failed' (start binds once ..., release-binding
  completes an interrupted ..., sanctioned neutral start/reuse/release); 4 × composite recovery
  `ERR_ASSERTION` (lost binding plus orphan set, post-release crash x2, State and orphan-set drift);
  1 × 'continuity owner preparation refused' (neutral coordinator-close release); 1 × plain-context bind
  (a single unbound descriptor requires an activated digest-bound rebind); 1 ×
  `onboarding-continuity:namespace-drift` (ordinary orphan release). An earlier 36-red reading was taken
  while a dispatch edited `session-power.mjs` and is invalid.
- **Next:** K1fg (four fixture suites, packaged); then package A (deep): the D70 (b) historic-binding
  fixture helper plus the 7 legacy binding cases and the recovery `release-closed-feature` case; then
  package B (deep): restore the RF2A2 draft, rewire the RF2A bound case and the lost-binding cases onto
  A's helper, drop the bridge option; then the remaining binding reds; then the K1 closure.

### K1 measurement 8 (2026-10-21, dispatches ALF-K1-LEGACY-BINDING-BYTES, ALF-K1-RF2A-ARCHIVE-RELEASE3/4, ALF-K1FG2, ALF-K1FG3-GDW-QUEUE, ALF-K1FG4-GDW-ADMISSION)

Interim entry.

- **D70 (b) delivered:** `edb60e98c`, `writeHistoricLegacyBinding` (the historic legacy writer as a
  fixture artifact). Binding suite 49/66 → 56/66, recovery 37/39 → 38/39.
- **RF2A delivered (implementation complete; D72 security read in the Critic batch and PO acceptance
  pending):** `4467aa5b0`. `applyOrphanDescriptorArchive` releases through `releaseArchivedOrphanBinding`
  (read-back archive whose bytes hash to the descriptor, its audit entry, no active descriptor, owner not
  live, binding tuple under the State CAS; typed `WT-ORPHAN-RELEASE-*` refusals that write nothing).
  Counted: lost-binding 6/6 (needs C16 registration), recovery 39/39, binding 56/66 unchanged, address
  repair 17/17, architecture check only the two known entries. Scope of the proof: the historic binding
  reserved no registry member, so the D72 crash case proves convergence with the member step at
  `{status: 'none'}`, not a member-released-then-crash window; `WT-ORPHAN-RELEASE-MEMBER` has no
  dedicated case. RED-to-GREEN against the old code not re-measured.
- **K1g native-goldfish-host-state-regression:** `16677e01d`, fixture is a real Git repository, 0/3 → 3/3.
- **K1f GDW01 (`hooks/guard-dispatch-native-worker.test.mjs`, 3/4) parked.** Three dispatches peeled the
  layers of the governed item admission for a Codex `spawn_agent` dispatch, each a later contract:
  `SQ-AUTHORITY-UNAVAILABLE` (no v2 slice queue) → `NGHS-ITEM-NOT-READY` (briefing `Slice`/`Write scope`
  lines) → `NGHS-ITEM-BASE-MISMATCH` (`delivery.baseCommit` must equal the candidate,
  `native-goldfish-host-state.mjs` ~215) → `SDC-AUTHORITY-UNAVAILABLE` (registry not initialised) →
  `NGHS-ADMISSION-UNAVAILABLE` hiding `resolveV3DutyRoute` 'pipeline.user.yaml is unreadable'
  (`critic-route-v3.mjs` 41, via `configuredNativeCodexRoute`) → now `item-delivery-owner-unbound`
  (`native-goldfish-host-state.mjs` 722). `nativeManagedCurrentOwner` is bound only through a
  source-owned requester carrier (`controlled-unit-method`, in-process) or the Claude hook owner, and
  `guard-dispatch.mjs` 660-663 enters the hook owner only for `Task`/`Agent`, never for `spawn_agent`.
  Open question: whether a Codex governed item dispatch through the hook has any owner route at all
  (product gap) or the case needs a full governed-session fixture; this is a design question, not a
  fourth fixture layer. Interim file: `scratch/k1fg4-gdw-interim.test.mjs`. It joins the bound-owner
  theme of the binding reds (package C).
- **Next:** design-workflow-package-builder (0/3), the AFK worker-request package, then package C (deep,
  binding reds plus the GDW01 owner question with a shared fixture module in scope).

### K1 measurement 9 (2026-10-21, dispatch ALF-K1C-BINDING-REDS, classification only, no edits)

- **K1f/K1g delivered:** design-workflow-package-builder 3/3 (`314cd6bb8`); AFK worker requests moved
  beside the ledger root, afk-transaction-host 2/2 (`c8c4fb947`); the pure projection-writer
  precondition runs before the authority lifetime, afk-claude-host 10/10, afk-transaction-host 3/3,
  afk-activation 13/13 (`41ba365df`).
- **Binding suite 56/66, ten reds classified:**
  - **C (1, fixture gap):** 'a single unbound descriptor requires an activated digest-bound rebind'
    creates its orphan with the plain `startSessionDescriptor` (test ~1663); `bind-orphan` then binds in
    a plain context and is refused at `onboarding-continuity.mjs` ~9571. Recipe:
    `startDescriptorWithBoundRequester`.
  - **D (4, stale fixture):** the composite-recovery cases pin the legacy-layout State, but their first
    bound `start` migrates the root to neutral (AC-203 K1c: a Source-owned bound bind is admitted only
    for a neutral project). Recipe: `writeHistoricLegacyBinding` instead of the bound start (~1928,
    ~2057, ~2098, ~2180); assertions unchanged. The drift loop's 'orphan-set' iteration never ran.
  - **A (3, fixture gap, one risk):** 'continuity owning release failed': `releaseOnboardingSessionCleanup`
    → `continuityAuthorityFinish` (~9508) → `continuityAuthorityCurrent` (~9310) needs the bound
    requester context of the owning bind; the fixture supplies it for start and bind only. Recipe: a
    fixture export `releaseInsideRequesterContext`, wired only for the `cleanup`/`release-binding` verbs
    in the binding test's `invoke()` (not in the shared dependency set, which the recovery code branches
    on). Risk: those verbs retire the descriptor before the release; if the requester readback does not
    survive retirement, A is a product question (`runOwnedContinuityRetiredTerminal` ~11103 admits only
    `close-feature` and `release-owned-transition`).
  - **B (1, unresolved):** the second bound start after a `release-closed-feature` recovery is refused
    in `prepareOperation` (~9423-9446, every cause mapped to UNAVAILABLE); likely E's family.
  - **E (1, product question):** after the ordinary orphan release, the next bound start fails with
    `onboarding-continuity:namespace-drift`: the first bind's registry member is still armed, because
    `applyOrphanSessionCleanupBindingRelease` (~3881) releases the binding without the registry member
    step that the owning release and RF2A's `releaseArchivedOrphanBinding` perform.
- **Next:** C and D (implementor, precise recipes), then A with the retirement risk measured first, then B
  and E.

### K1 closure (2026-10-21, partly closed with a named rest)

Status: **partly closed.** Implementation complete for everything below; the D65/D72 security reads
are in the Critic batch, and PO acceptance is pending. The named rest moves to the decision cluster
K1D (ledger), which waits for the PO.

- **Delivered (commits):** K1R address-root repair `33fcdf82d` (D71/D72; C15 drop-in and C16 row
  collected); D70 (b) historic legacy binding `edb60e98c`; RF2A archive release `4467aa5b0` (D72);
  native-goldfish host state `16677e01d`; design-workflow builder `314cd6bb8`; AFK requests beside the
  ledger root `c8c4fb947`; AFK projection-writer precheck `41ba365df`; apply-recovery bind seam and
  composite cases on the historic binding `70957cf27`; lost-binding release without a registry (D44)
  `64bdfd697`; AC-203 own-session pin on the D46 split `177401a89`. Earlier K1 commits are in
  measurements 1-8.
- **Counted green runs (`scratch/run-quiet.mjs`, private TMPDIR, no concurrent dispatch):**
  session-cleanup-recovery 39/39; session-cleanup-lost-binding 7/7 (needs C16); session-power-address-
  repair 17/17 (needs C16); session-cleanup-power 2/2; orphan-descriptor-recovery pin 7/7;
  native-goldfish-host-state-regression 3/3; design-workflow-package-builder 3/3;
  afk-transaction-host 3/3; afk-claude-host 10/10; afk-activation 13/13; consumer-safe paths 9/9;
  architecture check only its two known entries.
- **Still red, and where it went:**
  - session-cleanup-binding 61/66 (was 49/66 at the K1 handover). The five reds are K1D: A (3 cases,
    the `cleanup`/`release-binding` owning release cannot read the requester context after the
    descriptor retires; close-block uses these verbs, so likely a real 0.7.0 defect), B (1, a leftover
    authority journal fails its repository binding at `continuityAuthoritySnapshot` ~9291), E (1, the
    ordinary orphan release leaves the registry member armed). PO decision with Elephant
    recommendations on the PO list.
  - guard-dispatch-native-worker GDW01 (3/4): K1D, a Codex `spawn_agent` governed item dispatch has
    no session-owner route (measurement 8); interim file `scratch/k1fg4-gdw-interim.test.mjs`.
  - Model-family group to the D66 typed-pending package (step 6 of the K1 order): codex-critic-host
    CCH136 and CCH137, codex-critic-session-route (4/5), codex-design-advisor-host CADH001, and
    model-family-execution MFE018 (18/19, re-measured 2026-10-21). CCH136 and CADH001 were already
    bound to E24; the others join the D66 row of the cluster table. Not re-measured except MFE018.
- **Process notes:** no `dispatch-record-write.mjs` records exist for the K1 dispatches (orchestrator
  commits carry the `Dispatch:` and `Commit-Act: orchestrator` trailers); several deep dispatches stopped
  at their budget and were continued from saved interim files under `scratch/`.
- **Next:** K1h with K10 (hang group and Verify-only reds); K1D when the PO decides.

### K1h measurement 1 (2026-10-21, orchestrator, each suite alone, `scratch/run-quiet.mjs`, 15-minute cap)

The hang group splits into three kinds; no single shared lock explains it.

- **Hangs even alone (cap reached, no summary):** `lib/native-goldfish-host-state.test.mjs` (last output a
  governed briefing in the `implementing` phase) and `lib/model-family-host-store.test.mjs` (its
  MFHS002-008, MFHS023, MFHS028 are D66 typed pending; the run ends in a child-process exit trace).
- **Finishes alone, red:** `lib/onboarding-continuity.test.mjs` 267/306, 39 reds, nearly all
  post-privatization promotion and its crash recovery (OBC119-OBC160), plus OBC055, OBC059, OBC060,
  OBC062 (cleanup bind/release CAS and the ephemeral private cleanup); `lib/agy-session-dispatch.test.mjs`
  6/7 ('actual Agy S2 S4 S5 native callers launch each signed successor once ...');
  `lib/model-family-invocation.test.mjs` 12/14 (MFI012, MFI013, both D66 typed pending).
- **Green alone:** `lib/design-workflow-package-v2.test.mjs` 2/2, `lib/native-goldfish-host-finalizer.test.mjs`
  15/15, `scripts/project-reset-git-hooks.test.mjs` 17/17; their Verify hang is a concurrency effect (K10
  class).
- **Next:** find the hanging case of native-goldfish-host-state (per-case run); classify the
  onboarding-continuity reds (they share the bind/release paths of K1D A/B/E, so the classification
  may move them there); then K10 under Verify concurrency.

### K1h measurement 2 (2026-10-21, orchestrator)

- `lib/native-goldfish-host-state.test.mjs`: 38/38 green alone with a 60-second per-case timeout
  (`scratch/run-timeout.mjs`). No case hangs. The earlier cap is a state or environment effect of the
  sequential run (K10 class), not a red case.
- `lib/onboarding-continuity.test.mjs`: 305/306 after `cb47dff84` (ALF-K1H-OBC-CONTROLLED-BIND). 38
  reds were a fixture gap: the cases bound from a plain process with a fabricated tuple, and production
  never does. The promotion apply only rewrites an existing binding, `bindEphemeralPrivateCleanup` has
  no production caller, and the session-cleanup bind seam binds a requester to its own descriptor. The
  cases now run the real bind inside a bound requester. Rest: OBC059 pins a pre-K1c bind on a
  legacy-layout root and expects `SESSION-CLEANUP-BIND-CAS`. The controlled bind refuses a foreign
  tuple with `SDC-AUTHORITY-CAS` and needs a neutral root. Restating the pin is sanctioned by the fix
  rule, since K1c changed what it pins (follow-up slice).
- `lib/agy-session-dispatch.test.mjs` 6/7: the red case gets `MODEL-FAMILY-NATIVE-REQUEST-REFUSED`
  before launch instead of `AGY-SESSION-FAMILY-RETURN-CONTRACT-UNQUALIFIED`. This is a model-family
  refusal: it joins the D66 row (AGY-S2S4S5).
- **Next:** OBC059 restatement; then K10 under Verify concurrency.
- **OBC059 measurement and Elephant decision (2026-10-21).** The slice ALF-K1H-OBC059-RESTATE
  measured the case on a neutral root inside a bound requester. The bind is private
  (`storage: 'private-runtime'`): revision and State sha stay unchanged, and the tracked State is
  byte-identical. A foreign tuple is refused with `SDC-AUTHORITY-CAS`. The release returns
  `released` with the revision unchanged. A second bind with the own tuple does not return `reused`:
  `prepareOperation` requires an unbound preimage (`lib/onboarding-continuity.mjs` ~9431) and the
  refusal surfaces as `SDC-AUTHORITY-UNAVAILABLE` 'continuity owner preparation refused'. Decision
  (Elephant, under the fix rule): K1c moved same-session reuse to the CLI (`scripts/session-cleanup.mjs`
  ~792, `WT-SESSION-REUSED`; pinned by the binding suite). OBC059 therefore pins the refused second
  bind with no State or binding change, not a library replay. Side finding for the PO list: that
  refusal names no repair.
