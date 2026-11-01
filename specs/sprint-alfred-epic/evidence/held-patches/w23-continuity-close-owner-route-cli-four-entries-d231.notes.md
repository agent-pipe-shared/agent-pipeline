# W23 D231 owner route, four entries: budget CHECKPOINT (partial build, one design finding open)

Slice: W23-CONTINUITY-CLOSE-OWNER-ROUTE-FOUR-ENTRIES-D231-20261101 · Candidate a27687cae7fe601dddf09880f4828cb92d099fae
Outcome: `checkpoint` at the 80 % budget mark (call 128 of 160). The `.patch` slice file is NOT in the repository tree: the cumulative patch is at
`scratch/agent-out/w32own/w23-continuity-close-owner-route-cli-four-entries-d231.patch` (52740 bytes, `git apply --check` exit 0 on clone2 at the candidate;
5 files, 562 insertions, 3 deletions). The edited clone is `scratch/agent-out/w32own/clone` (driver unchanged). The host/Elephant copies the patch into this directory.

## Open finding (blocks the walk; a design question, not a typo)

Re-proving measurement (D) with the real spawned CLI shows that "ONE CLI call = bind, ONE entry, release" does NOT compose across calls.
`session-authority-registry.mjs` 1164 (`executeSourceOwnedSessionAuthorityCompanionWrite`) refuses a companion write with
`SDC-AUTHORITY-UNAVAILABLE: companion-historical-owner-witness-missing` whenever ANY RELEASED onboarding-continuity member carries a source fact equal to the
State image the write starts from. A read-only entry (plan) leaves the State bytes unchanged, so the member of the plan call, once released, poisons the next
call: measured, bootstrap-plan (call 1, ok) then bootstrap-apply (call 2) is refused; and after heal released the orphan, the next bootstrap-plan write path is
refused for the same reason (the heal's `lost-binding-recovered` member also carries the unchanged image). The earlier w21 probe did not see it because all four
entries ran under ONE member. The check has no test and no doc; the code comment-free; `git log -S` finds only the transfer checkpoints.
Smallest candidate fixes (each is a registry gate decision for the PO, none was built): (a) exempt a released member whose release record is
terminal `continuity-released`/`lost-binding-recovered` AND whose State image never changed (no write in its lifetime); (b) make the bind itself change the State
image (a revision-neutral bind marker), so a released member's pre-bind image never equals a later preimage; (c) keep one member across calls (a long-lived
owner process), which contradicts PO answer (D). Recommend (a) with a test, in `session-authority-registry.mjs` (inside the write scope).

## What is built in the clone (all in the patch)

- `lib/session-requester-bridge.mjs` (+148): `createSourceOwnedContinuityOwnerRouteRequesterRuntime` (program pin to `scripts/continuity-owner-route.mjs`, argv
  `run --root R --lifecycle L -- <entry> ...`, cwd equals root, replay map, fresh `controller-<random>` descriptor, producer `continuity-owner-route`, assurance
  `physical-readback`, dispose never releases a member); `inspectSourceOwnedContinuityOwnerRouteCourse` (read-only, typed `COR-*` refusals); the new bridge
  predicate `ownerRouteCourse` (real selected State through `observeSessionCleanupState`, coordinator record `readCloseCoordinator` phase >= checkpointed and same
  featureId, `sessionCleanup` null, no orphan, closeTransition null); `isSourceOwnedContinuityOwnerRouteRequester`; `inspectSourceOwnedContinuityOwnerRouteInvocation`
  (read-only invocation record + liveness; `dead` only on proof). Lifecycle id choice: validated argv flag `--lifecycle` (a directory scan cannot tell several
  lifecycles apart, and the flag is authenticated through /proc argv).
- `lib/onboarding-continuity.mjs` (+67): `executeOnboardingContinuityOwnerRouteEntry` (the one export that runs `executeCompanionOperation` for the process's direct
  binding; closed four-entry list as defence in depth; refuses a non-owner-route requester with `COR-REQUESTER-NOT-OWNER-ROUTE`); `releaseDeadContinuityOwnerRouteBinding`
  (descriptor retired, registry member released FIRST via `runOrphanSessionAuthorityMemberStep`, binding second; only for a binding with an owner-route record whose
  process is proven dead). No gate removed.
- `scripts/continuity-owner-route.mjs` (new, 147 lines, kernel path; closure-list report pending): verbs `run` and `release-orphan`; typed refusals
  `COR-CLOSE-FEATURE-UNAVAILABLE` (names the missing piece: owner-descriptor retirement + retired terminal for physical-readback; names the direct/attended route),
  `COR-ENTRY-OUTSIDE-ALLOWLIST`, `COR-FOREIGN-FLAG`, `COR-USAGE`, `COR-NO-CATALOGUE` (names the direct command), `COR-LIFECYCLE-NOT-STARTED`,
  `COR-BINDING-HELD` (names `routine-repair.mjs run heal --root ... --reason ...`), `COR-MEMBER-UNAVAILABLE`, `COR-ENTRY-HELD`, `COR-RELEASE-HELD`.
- `lib/routine-repair.mjs` (+20): `heal` first runs `release-orphan` (own process), then the unchanged settled-pending and `session-authority-repair heal`; result gains
  `ownerRoute`. Why not `planOrphanSessionCleanupBindingRelease`: it needs a discarded feature. Measured: for a dead `controller-*` owner `plan-recovery` says
  `cleanup-required` and the zero-authority archive tier refuses `WT-ORPHAN-ARCHIVE-OWNER-OBSERVABLE`, so no existing route releases it without a signature.
- `scripts/pipeline-state-result-bootstrap.test.mjs` (+183, 5 cases, all spawn the real CLI except the fixture-requester case).

## Test-first record (clone, `driver.mjs run c1 plugins/pipeline-core/scripts/pipeline-state-result-bootstrap.test.mjs`)

RED on the original code (5 new cases failed: CLI module missing / export missing / `ownerRoute` missing). After the build: 26 pass, 2 fail.
GREEN: negatives (close-feature, outside allowlist, rebind, foreign flag, direct call still `SDC-AUTHORITY-UNAVAILABLE`, State before the Close lifecycle), no-catalogue
project (direct route unchanged, CLI names it), fixture-requester refusal. RED (open finding above): the four-entry walk (fails at bootstrap-apply) and the heal case
(fails at the first call after heal). The first calls of both (bootstrap-plan, bind, kill, typed `COR-BINDING-HELD`, heal clean-project no-op) are not yet asserted to the end.

## Seams

S-FIXTURE: fixture repositories live under `scratch/test-tmp` (the registry refuses `/tmp` ancestors). S-ABORT: `PIPELINE_COR_TEST_ABORT_AFTER_BIND=1` makes the CLI SIGKILL itself
after the bind; it can only kill the process. Probe `scratch/probe-e.mjs` (git-ignored in the clone): a dead fixture owner leaves `sessionCleanup` bound, onboarding-continuity
`inFlight 1`, descriptor active with owner `not-live`.

## Not done / unverified

Baseline run in clone2, revert proof, routine-repair and session-authority-repair suites, `design-approval-route.e2e.test.mjs`, kernel-closure test
(`NEVER_LIFTABLE_KERNEL_PATHS` likely names the new script), `check-verify-case-completion` (VCR01: +5 top-level cases in `pipeline-state-result-bootstrap.test.mjs`, pinned count
untouched), `check-doc-contracts`, the SKILL.md paragraph (step 3), downstream sweep of `routine-repair` heal text/`does` pins, a live-owner heal case, native Windows (liveness is
`unknown` there, so heal reports `unverifiable`), a real shell session as requester, a real Full Verify, a real consumer repository.

## Next step

Decide the registry fix for the finding (recommend (a)), build it with its own test, rerun the bootstrap test file, then do the listed remaining checks and re-run `driver.mjs patch`.
