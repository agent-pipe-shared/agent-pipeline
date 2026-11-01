# W23 D231 owner route, four entries: held patch (targeted delivery green; one registry test side by code reading only)

Slice: W23-CONTINUITY-CLOSE-OWNER-ROUTE-FOUR-ENTRIES-D231-20261101 · Candidate a27687cae7fe601dddf09880f4828cb92d099fae
Patch: `w23-continuity-close-owner-route-cli-four-entries-d231.patch` next to these notes (65597 bytes, 7 files, 628 insertions, 6 deletions; `git apply --check` exit 0 on the plain clone at the candidate).
Critic, Verify, native Windows and PO acceptance stay parent-owned and pending. All production files below are protected kernel paths: the PO applies the patch under a Guard Maintenance Window.

## Design as built (PO answers A to E, option a on the registry)

- (A) One new closed script `plugins/pipeline-core/scripts/continuity-owner-route.mjs`: verbs `run --root R --lifecycle L -- <entry> ...` and `release-orphan --root R`. Allowlist of FOUR:
  continuity-result-bootstrap-plan, -bootstrap-apply, -close-plan, -close-apply. `close-feature` gets the typed refusal `COR-CLOSE-FEATURE-UNAVAILABLE` (names the missing piece: retirement of the
  per-invocation owner descriptor, and a retired terminal for a physical-readback requester; names the route that works today: direct route without a catalogue, or the attended close) and never partly runs.
  Other typed codes: COR-ENTRY-OUTSIDE-ALLOWLIST, COR-FOREIGN-FLAG, COR-USAGE, COR-NO-CATALOGUE (names the direct command), COR-LIFECYCLE-NOT-STARTED, COR-BINDING-HELD (names the heal command),
  COR-MEMBER-UNAVAILABLE, COR-ENTRY-HELD, COR-RELEASE-HELD. The script never writes State (the entry does) and never forces the registry or a member.
- (B) Course predicate: new bridge-side `ownerRouteCourse` reads the real selected State through `observeSessionCleanupState` (active feature with Continuity, neutral active State, no binding, no orphan,
  closeTransition null) AND the Close coordinator record (`readCloseCoordinator`, same featureId, phase at least `checkpointed`). Lifecycle id: a validated argv flag `--lifecycle <id>`, not a directory
  scan, because several lifecycle directories may exist and the flag is part of the process argv the bridge authenticates through /proc. "Each entry only in its legal phase" is one shared rule
  (lifecycle started, closeTransition absent); the finer per-entry gates are the entry's own and unchanged.
- (C) Owner identity: a fresh per-invocation `controller-<random>` descriptor, issuer `createSourceOwnedContinuityOwnerRouteRequesterRuntime` (producer `continuity-owner-route`, assurance
  `physical-readback`); neither the host session nor the hook-observed owner. Stated in the close-feature skill paragraph.
- (D) One CLI call = bind, one entry through the unchanged `port.executeCompanionOperation`, release, in one process. New export `executeOnboardingContinuityOwnerRouteEntry` (onboarding-continuity) reaches the
  process-local direct binding; it refuses any requester not issued by the owner-route issuer (`COR-REQUESTER-NOT-OWNER-ROUTE`) and re-checks the four-entry list.
- (E) Heal: `routine-repair.mjs run heal` now FIRST runs `continuity-owner-route.mjs release-orphan` (own process), then the unchanged delegates; the result gains `ownerRoute`.
  `releaseDeadContinuityOwnerRouteBinding` (onboarding-continuity) releases only a binding that has an owner-route invocation record of this repository whose recorded process is PROVEN dead (absent, zombie,
  or start/boot identity changed); live or unprovable (Windows) is reported and left alone; any other binding is `none`. Sequence = the existing lost-binding sequence: descriptor retired, registry member
  released first (`runOrphanSessionAuthorityMemberStep`), binding second, registry healed and read back. Why the existing `planOrphanSessionCleanupBindingRelease` is not reused: it needs a discarded feature.
  Measured on a killed owner: `plan-recovery` says `cleanup-required`, the zero-authority archive tier refuses `WT-ORPHAN-ARCHIVE-OWNER-OBSERVABLE`; no existing route releases it without a signature.
  The next blocked call prints `COR-BINDING-HELD` with the exact `routine-repair.mjs run heal --root <root> --reason "..."` command. A test seam `ownerRouteSpawn` keeps the existing exact-call pins of `routine-repair.test.mjs` unchanged.

## Registry change (PO decision 2026-11-01, option a) and how "State image never changed" is verified

Finding of the first run: with one member per call, a released member whose State image equals the next write's preimage made `session-authority-registry.mjs` (`executeSourceOwnedSessionAuthorityCompanionWrite`) refuse with
`companion-historical-owner-witness-missing`; the owner-side twin check is in `continuityObserveCompanionStateWrite`. Both now call the same narrow rule (registry: `releasedMemberNeverChangedState`;
owner: `continuityReleasedMemberNeverChangedState`): a RELEASED onboarding-continuity member no longer blocks only when (1) its release terminal is `continuity-released` or `lost-binding-recovered` AND
(2) the State sha256 it was BOUND at equals every selected-state fact of its release record and of its own member record. Records the registry holds do not keep the bind image (a member that wrote has its
facts refreshed to the postimage, and prior member revisions are replaced), so the bound image is read from the owner's immutable execution journal (`continuity-authority-execution-<id>.json`, written at the bind
with the post-bind State sha, found by the member's `bindingSha256`; new export `readOnboardingContinuityMemberBoundStateSha256`). A member that wrote moved its facts to the postimage, so its journal sha differs and it
stays blocking; every other terminal, a missing or unreadable journal, or a different image blocks exactly as before (fail closed). Measured consequence: after a State-writing entry the next owner is refused until the State moves by another route
(the walk asserts this for bootstrap-apply then close-plan), so the close pair is walked on a second project whose Result is unbound.

## Tests (clone, `driver.mjs run`); baseline = plain clone at the candidate

- `pipeline-state-result-bootstrap.test.mjs`: baseline 23 pass; clone 28 pass (5 new cases, all first RED on the original code: CLI module/export/ownerRoute missing). New: four-entry walk through the spawned CLI
  (bootstrap-plan then bootstrap-apply under a second member = registry "exempt" side; writer-then-close-plan refused with the registry code = "not exempt, member wrote" side; close-plan then close-apply on a second project),
  negatives (close-feature, outside allowlist, rebind, foreign flag, direct call still SDC-AUTHORITY-UNAVAILABLE, State before the lifecycle), no-catalogue project (direct route unchanged, CLI names it),
  fixture-requester refusal, heal case (clean-project heal changes nothing; SIGKILL after bind; next call `COR-BINDING-HELD` naming heal; heal releases; next call succeeds = lost-binding exempt side).
  VCR01: +5 top-level cases in that file (23 to 28); pinned counts not edited; `check-verify-case-completion.test.mjs` 32 pass.
- Revert proof (`driver.mjs revert`): the 5 new cases are RED with the production files reverted; restored byte-equal true.
- Also green in the clone: `lib/routine-repair.test.mjs` 33/33 (unchanged), `scripts/session-authority-repair.test.mjs` 40/40, `scripts/design-approval-route.e2e.test.mjs` 18/18 (baseline 18/18),
  `lib/guard-maintenance-window-kernel-closure.test.mjs` 11/11 (no `NEVER_LIFTABLE_KERNEL_PATHS` violation reported for the new script), `harness/scripts/check-doc-contracts.mjs` valid.
- Downstream sweep: the new script name and codes have no earlier reference in plugins, docs or harness; changed functions' callers: `executeCompanionOperation` path unchanged, `routine-repair` heal callers pinned by `routine-repair.test.mjs` (green), registry/owner historical check shared by all companion entries (design-approval e2e and result-bootstrap controlled-METHOD walk green).

## Seams (named)

S-FIXTURE: fixture repositories live under `scratch/test-tmp` (the registry refuses `/tmp` ancestors). S-ABORT: `PIPELINE_COR_TEST_ABORT_AFTER_BIND=1` makes the CLI SIGKILL itself after the bind (it can only kill the process).
`ownerRouteSpawn`: test-only dependency of `runRoutineRepair`.

## Not verified / open

- The registry side "a released member with ANOTHER terminal still blocks" has no test: it needs a released onboarding-continuity member with a non-listed terminal, which no admitted route produces here. It is code-read only (terminal set check).
- No live-owner heal case (a running owner must be reported `live` and left alone): covered by code and the proven-dead rule, not run. Native Windows: liveness is `unknown`, so heal reports `unverifiable` there; a real shell session as requester;
  a real Full Verify; a real consumer repository; the new script as a new kernel path for the PO's Guard Maintenance Window (kernel-closure test reported no violation).
- Pre-existing reds: none appeared in the compared suites (failing-name sets empty on both sides).
