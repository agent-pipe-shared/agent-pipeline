# Residue analysis — sections 2 and 4 (persisted by the Elephant from dispatch ALFRED-RESIDUE-ANALYSIS-20261004)

The dispatch exhausted its budget before writing these sections; this is its returned text, condensed.

## Headlines
- H1 [confirmed]: on win32 `ownerRuntime` is always null (lib/worktree-lifecycle.mjs:556-572) → every owner `unavailable` (:686) → never retirable. Bound+active descriptor → bare `cleanup-required` (lib/session-cleanup-recovery.mjs:1180-1188) → partial / cleanup_recovery_required (lib/project-onboarding-v3.mjs:1695-1718). plan-human-recovery offers attended recovery only if EVERY owner is not-live (scripts/session-cleanup.mjs:161,174) → dead end by construction on win32.
- H2 [hypothesis, strongest]: PRODUCTION producer — a Verify run on the real repo (harness/scripts/verify.mjs:75 → verify-journal.mjs:225-247 session-less fallback with a private binding → verify-evidence-producer.mjs:372-388, drained only after a terminal run). A killed or aborted Verify leaves descriptor + binding. The incident descriptor (createdAt 17:28:20Z) coincides with the Elephant's aborted full Verify run (VERIFY-JOURNAL-FAILED at planning).
- H3 [confirmed in code]: `session-cleanup.mjs cleanup --session-descriptor <id> --expected-descriptor-sha256 <sha>` has no readiness requirement and reads the nonce from the descriptor (:395-399, 698-760), but plan-recovery does not offer it for `bound` (recovery.mjs:1180-1188); `start` is gated by readiness (:563) → circular.

## Ranked producers / leaks
- R1 aborted Verify (above). R1b a legitimate concurrent `session-cleanup start` (indistinguishable on win32).
- R2 fixtures inside the repo without git init (guard-lifecycle-ready.test.mjs root() :152-156; architecture-design.test.mjs; trusted-tool-resolution.test.mjs:90) → no descriptor, but real readiness then auto-applies bind-orphan (project-onboarding-v3.mjs:1657-1667, 3150-3160).
- R3 tests using process.cwd() as root (advisory-host-bridge, codex-pretool-guard, browser-evidence-preflight, codex-advisory-app-server, clean-candidate-run, agy-session-authority, check-doc-reconciliation, audit-bundle …).
- R4 worktree-lifecycle gitEnvironment allow-list drops GIT_CEILING_DIRECTORIES/GIT_DIR (:109-125) → env isolation cannot protect lifecycle spawns.
- R5 signed-quality-package apply can only leave a registered worktree (FIXTURE_TMP plugins/pipeline-core/tmp); no descriptor.
- R6 runner-design-readiness-bootstrap test is isolated.

## Root-fix proposal
- (a) Isolation: producer-side refusal in worktree-lifecycle creators unless the start path is the physical toplevel or a registered worktree root; lib/test-fixture-isolation.mjs helper; static check + residue tripwire (registration needs TP-13/PB ceremony).
- (b) Typed `archive-unobservable-descriptor` in session-cleanup-recovery (+ planHumanRecovery candidate, archive writer: move to session-descriptors/archived/<id>.<sha>.json, digest-bound, readback, never delete, release binding under CAS). Eligibility: owner unavailable/unobserved, no manifest/resources, not the requester's own. SPEC TENSION: §20.2 / RV-3 / RV-4 require a signed archive → PO decision.
- (c) Readiness scoping: foreign bound descriptor with unavailable owner and no manifest/resources → ready + warning `cleanup_residue_foreign` carrying the (b) action; conditions: `start` must stop reusing a foreign bound descriptor (session-cleanup.mjs:593-608), descriptors with resources stay blocking, single binding slot solved; also fix the inversion at project-onboarding-v3.mjs:1699.
- (d) One readiness intent: export observeSessionCleanupReadiness from the ready gate, used by preflight, guard and v3 inspect (PF-8 cause: preflight inspects intent bootstrap, guard needs session).
- Verify itself must drain/retire its own descriptor on every exit path (abort, error, signal).
- Order: (b)+(c1) → Verify drain on abort → (a) → (d) → native win32 owner observer.
