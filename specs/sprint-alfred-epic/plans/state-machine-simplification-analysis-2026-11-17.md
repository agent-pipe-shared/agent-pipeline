# State-machine simplification analysis and staged plan (2026-11-17, slice C30G-SM1)

PO request 2026-11-17: "our state machine with its many different statuses regularly causes drifts; search specifically for simplifications to reduce blockings."

This is an analysis and a plan. It changes no code and proposes no change to a gate, a signature, an approval, the push approval, Critic evidence, the security scan or the audit bundle.

## How to read this document

- **Source tree.** The code was read in the integrated candidate 30h plus 30i tree. Paths are repository-relative; `<core>/` stands for `plugins/pipeline-core/`.
- **Evidence labels.** `[code]` means the named file was read at the named constant, function or line. `[notes]` means the claim comes from a held-patch notes file under `specs/sprint-alfred-epic/evidence/held-patches/`. `[queue]` means it comes from `specs/sprint-alfred-epic/plans/candidate-30-queue-2026-11-15.md`.
- **Counts.** A number is a count of the literal values read in the named constant. Where a count comes from a text search over a file, it is called a search count and is a lower bound.
- **Gaps.** Whatever could not be read or proven is in section E2 and is marked "not verified" where it appears. Size and risk are judgments, not measurements.
- **Neutral ids.** `feature-a` stands for any feature; no consumer project is named.

## Summary

1. The Pipeline answers "how far is this feature" from at least five stored places: the package record, the project State, the Continuity block inside the State, the close coordinator file and the session-authority registry. A sixth, the legacy close journal, has writers that no other module imports. Section A lists the 8 spaces and counts each closed value set.
2. Ten of the eleven incidents fit one of seven root-cause classes (section B); the eleventh is an ordering defect, not a drift. Six classes were named in the request; the seventh, a binding that the Pipeline's own sanctioned step invalidates, has five members in the code.
3. The code already contains the pattern that works: a fact derived on every read from the stored evidence, never written as a status (`featureStatusVocabulary`, the `settled` column of the repair inspection, `queueHeadLag`). The recommendations extend that pattern; none of them adds a stored status.
4. Twelve simplifications are ranked in section C. Three slices are safe to start now (section D): one list for the package states, one derived answer to "is this dispatch still in flight" for the warning path, and the test-only reproduction of the blocked signature ceremony.
5. Five decisions need the PO (section E1). One of them, whether a HEAD moved only by evidence commits may stand for the checked candidate, is deliberately left without a recommendation, because it touches what a Verify result covers.

---

## A. Inventory of the state spaces

Column meaning for every table: **Values** is the counted closed set. **Second copy** is another place that stores or restates the same fact. **Drift detection** is the code that notices the copies disagree. **Agent-runnable** says whether an agent may run the repair without a human.

### A1. Package and plan lifecycle

| Fact | Values | Defined in | Writer | Readers | Second copy | Drift detection | Repair | Agent-runnable |
|---|---|---|---|---|---|---|---|---|
| Plan lifecycle status | 4: `draft`, `awaiting-approval`, `approved`, `implementing` | `<core>/lib/plan-spec-state-v2.mjs` `PLAN_LIFECYCLE_STATUSES` [code] | not verified (the module was not read beyond the constant) | `<core>/lib/feature-package-registration.mjs` (`REGISTRABLE`, read as `lifecycle.status`), `<core>/scripts/pipeline-state.mjs` (`CAC-APPROVAL-STALE` check) [code] | the State's `planApproved` and `planApproval` (A2), the Continuity authority seal (A3) | `CAC-APPROVAL-STALE` in `pipeline-state.mjs`: it requires `planApproved === true`, a current approval and a status of `approved` or `implementing` together [code] | not verified | not verified |
| Feature package state | 9: the 4 above plus `verifying`, `completed`, `superseded`, `abandoned`, `retained` | `<core>/lib/feature-package-topology.mjs` `FEATURE_STATES`, stored as `state` in `specs/<feature>/lifecycle.json` [code] | `pipeline-state.mjs feature-package-plan` and `feature-package-apply` (called by the one-shot close) [code] | topology validation, registration, the close, the evidence view | two hand-written literal lists of the same 9 values: `TOPOLOGY_STATES` in `<core>/scripts/check-artifact-topology.mjs` and `PACKAGE_STATES` in `<core>/lib/evidence-view-model.mjs` [code] | `PACKAGE_STATES` is named in no other file, so no test compares it with `FEATURE_STATES`; `TOPOLOGY_STATES` is named in its own test, whose comparison was not read (file search) [code] | edit the copy by hand | yes |
| Admitted transitions | 9 pairs plus 2 conditional exits of `completed` (`requalifies` to `verifying`, `returnsToCorrection` to `implementing`) | `planFeaturePackageTransition` in `feature-package-topology.mjs` [code] | same writer | the one-shot close | none | a transition outside the set is rejected and the refusal lists the admitted next states | none needed | n/a |
| Package candidate | commit and tree, bound at the move into `verifying` only when a registered, passing Verify evidence exists for exactly that commit and tree (`verifiedCandidateOfPackage`) [code] | same function | same writer | the close | HEAD | `candidateMoved` | the `requalifies` exit: back to `verifying` with a Verify for the moved HEAD, then `completed` again | yes |
| Lifecycle event (external view) | 6: `proposed`, `active`, `completed`, `superseded`, `abandoned`, `retained` | `<core>/lib/organization-policy.mjs` `LIFECYCLE_EVENTS` [code] | derived | external reference adapter | a total map from the 9 states in `<core>/lib/external-reference-adapter.mjs` | a test iterates `FEATURE_STATES` and fails on a missing mapping (`external-reference-adapter.test.mjs`, `organization-policy.test.mjs`) [code] | none needed | n/a |
| The four status facts | 4 derived facts: package registered, implementation delivered, technically qualified, accepted; plus `recordLag` | `featureStatusVocabulary` in `<core>/lib/close-acceptance-record.mjs` [code] | none: a pure function of package state, phase, Result binding, closed flag and candidates | `pipeline-state.mjs inspect`, the one-shot close result | it is itself the reconciliation of A1 with A2 and A3 | `recordLag` is set when the package says `completed` while the State says design or a retired Result [code] | the one-shot moves the package back to `implementing` in stage `package-correction-round`; when that side step fails it is "never a stop" and the move is left to a hand step (`finish-feature.mjs`, C28 comment) [code] | yes |

Finding A1-1: the same nine names exist three times as literals. Finding A1-2: "the plan is approved" is stored in four places (package state, `planApproved`, `planApproval`, the Continuity authority seal), and `CAC-APPROVAL-STALE` exists to catch their disagreement.

### A2. Project State file (`project/pipeline-state.json`, schema `pipeline.state.v0`)

| Fact | Values | Defined in | Writer | Readers | Second copy | Drift detection | Repair | Agent-runnable |
|---|---|---|---|---|---|---|---|---|
| Top-level fields | 13 documented in the schema header: `schema`, `activeFeature`, `planApproved`, `planApproval`, `planRevocation`, `pushApproval`, `criticalProofConsumption`, `featurePackageReconcileApproval`, `closedFeatures`, `deployApprovals`, `continuity`, `phoenixEpicHistory`, `updatedAt`. Used in code but not in the header block that was read: `planSubmission`, `planCancellation`, `discardedFeatures`. Correction of the starting inventory: the word `residualAcceptance` does not occur in `pipeline-state.mjs` as a field name (word search; only `residualAcceptanceSubject`, an imported function, does) | header of `<core>/scripts/pipeline-state.mjs` [code] | only the subcommands of `pipeline-state.mjs` (ADR-0029 rejects freehand edits; only its title and two option lines were read) | the gate hooks, the close scripts, Critic course admission | see the rows below | per field | per field | mostly yes |
| `activeFeature.phase` | 2: `design`, `implementation` | two inline `new Set(["design", "implementation"])` literals in `pipeline-state.mjs` (search count 2) [code] | `set-feature`, `set-phase` | guards, the four status facts, `queueHeadLag` | the package state (A1), the Continuity queue head (A3) | `recordLag`, `QUEUE-HEAD-LAGGING` | see A1 and A3 | yes |
| Plan approval | `planApproved` (boolean), `planApproval` (record), `planRevocation` (record) | `approve-plan` sets the first two and deletes the third; `revoke-plan` does the reverse [code] | `pipeline-state.mjs` | `guard-devplan` reads `state.planApproved` (per the header) | each other; the package state; the Continuity seal | `CAC-APPROVAL-STALE` | not verified | not verified |
| Approvals (push, reconcile, proof consumption) | 3 legacy tracked fields plus a private store under the Git common directory | header note D206 in `pipeline-state.mjs` [code] | the private store is written; the tracked fields are no longer written | every reader goes through `withPrivateCriticalApprovals` (private wins, the tracked record is the fallback) | the legacy tracked record | none needed: one precedence rule in one reader | none | n/a |
| Closed and discarded features | `closedFeatures[]`, `discardedFeatures[]` (append-only lists) | `pipeline-state.mjs` close and `discard-feature` [code] | same | `finish-feature.mjs` (matches `coordinatorClose.lifecycleId`), `<core>/lib/critic-course-admission.mjs` `discardedFeatureIds` | the manifest field `supersedes` (a registration writer exists since the 30i wave, named in the comment above `discardedFeatureIdsOfState` [code]; the writer itself was not read); the coordinator file (A4) | `CCA-SUCCESSOR-OF`, `CCA-ALIAS-MAPPING-UNAVAILABLE` | the flag `--successor-of <feature id>` [queue C30-12] | yes |

Finding A2-1: `discardedFeatureIds` reads the State bytes of the project root, not the State at a commit [code]. A course round on a checkout whose State lacks the discard record is refused [queue C30-12, open]. Whether the State file is tracked in consumer projects is not verified.

Finding A2-2: the private approval store is the model for a compatible migration: one reader, one precedence rule, the old record stays readable, nothing is rewritten.

### A3. Continuity (`continuity` inside the State, at most 8192 bytes)

| Fact | Values | Defined in | Writer | Readers | Second copy | Drift detection | Repair | Agent-runnable |
|---|---|---|---|---|---|---|---|---|
| `queueHead.nextAction` | 11: `dispatch`, `poll`, `retrieve-final`, `integrate-final`, `review`, `correct`, `verify`, `push`, `fetch-back`, `advance-package`, `close` | `NEXT_ACTIONS` in `<core>/lib/continuity-state.mjs` [code] | Continuity CAS transitions | reground hook, inspect | `activeFeature.phase`; the package state | `queueHeadLag`: a planning head (`PLANNING_ENTRY_PACKAGES`, 3 values) with a phase past design and no live dispatch is labelled `lagging`; the comment states "No transition advances them on plan approval" [code] | none: the reader labels it (`QUEUE-HEAD-LAGGING` in `<core>/hooks/post-compact-reground.mjs`) | n/a |
| Close transition phase | 5: `state-cas`, `verified`, `delivered`, `readback`, `closed` | `CLOSE_PHASES` [code] | the close transitions of `continuity-state.mjs` | the close | the coordinator phases (A4); the package state `completed` | `CS-CLOSE-*` codes | not verified | not verified |
| Blocker type | 8: `authority`, `security`, `scope`, `course`, `capacity`, `product`, `environment`, `unknown` (3 of them interrupt: `authority`, `security`, `scope`) | `BLOCKER_TYPES`, `INTERRUPT_BLOCKER_TYPES` [code] | decision transitions | reground hook | none found | n/a | PO decision | no |
| Resume | kinds 5 (`po-decision`, `evidence-change`, `capacity-available`, `authority-update`, `manual`), modes 2, reasons 5 | `RESUME_KINDS`, `RESUME_MODES`, `RESUME_REASONS` [code] | Continuity transitions | reground hook | none found | n/a | n/a | n/a |
| Fallback | statuses 4 (`fallback-pending`, `running`, `completed`, `failed`), policies 2, final outcomes 2 | `FALLBACK_STATUSES`, `FALLBACK_POLICIES`, `FINAL_OUTCOMES` [code] | Continuity transitions | not verified | none found | n/a | n/a | n/a |
| `authority.result` | `{path, sha256}`: the digest of the bytes of `result.md` | `AUTHORITY_KEYS` (5: `prd`, `spec`, `result`, `plan`, `sealed`) [code] | the Result bootstrap and the close transitions | the Result close, `commit-pipeline-owned.mjs` (the file is owned exactly when its bytes hash to the bound digest [notes w30g1]) | the manifest entry of class `result` in `lifecycle.json` (rewritten by the reconcile after the bootstrap [notes w30g1]); `closeTransition.resultDigest` [code]; the key set `IDENTITY_AUTHORITY_KEYS` also holds a `resultSha256` key, whose use was not read | `PS-RESULT-CLOSE-RESULT` with four causes [notes w30g1]; `FTP-ARTIFACT-2` for the manifest copy | `git restore` of the bound bytes; no entry re-binds a changed Result [notes w30g1] | not proven (the guard's answer to that `git restore` is open [notes w30g1]) |
| Session cleanup binding | `runtime.sessionCleanup {sessionId, descriptorSha256}` | `SESSION_CLEANUP_KEYS` [code] | bind and release transitions | the State authority | exactly one live registry member per bound session [notes w30i3] | `SDC-AUTHORITY-HELD`, `state-legacy-operation-effects` | release; heal releases a binding left by a killed owner-route call whose process is proven dead (`ROUTINE_REPAIRS` text) [code] | yes |

The refusal codes of this module are the closed list `CONTINUITY_STATE_CODES`; they were not counted.

### A4. Close coordinator and close journal

| Fact | Values | Defined in | Writer | Readers | Second copy | Drift detection | Repair | Agent-runnable |
|---|---|---|---|---|---|---|---|---|
| Coordinator phase | 14: `active`, `checkpointed`, `feature-close-prepared`, `tracked-close-finalized`, `candidate-frozen`, `final-verify-green`, `publication-authorized`, `published`, `readback-confirmed`, `cleanup-complete`, `closed-local`, `delivered`, `release-eligible`, `promoted` | `COORDINATOR_PHASES` and the successor table `COORDINATOR_NEXT` in `<core>/scripts/publication-close-journal.mjs` [code] | `advanceCloseCoordinator`, driven by `<core>/scripts/close-coordinator.mjs` | the one-shot close | `closedFeatures[].coordinatorClose` in the State; the Continuity close transition; the package state | `validateCloseCoordinator`: the phase must equal the last entry of the `effects` chain, one effect per revision, each bound to the prior state digest [code] | rerun the identical close command | yes |
| Where it is stored | `<git common dir>/agent-pipeline/publication-close/<lifecycleId>/coordinator.json` | `close-coordinator.mjs`, `publicationClosePaths` [code] | same | same | it is outside the work tree, so it does not travel with a push or a clone | none | not verified | not verified |
| Cleanup status | 3: `not-started`, `complete`, `uncertain` | `validateCloseCoordinator` [code] | `recordCleanup` | the close | none found | n/a | n/a | n/a |
| Journal phase (legacy) | 7: `pending`, `implementation-result-bound`, `feature-closed`, `backlog-closed`, `close-block-committed`, `final-verify-green`, `delivery-authorized` | `JOURNAL_PHASES` [code]; the comment says they "remain readable for AC-047-27 compatibility; new callers use this single state machine" | `createCloseJournal`, `advanceCloseJournal`, `storeCloseJournal` | `readCloseJournal` | the coordinator phases (one shared name, `final-verify-green`) | none | none | n/a |
| Publication lifecycle | not read | `createPublicationLifecycle`, `validatePublicationLifecycle`, `storePublicationLifecycle` in the same module [code, export names only] | not verified | not verified | not verified | not verified | not verified | not verified |

Finding A4-1: under `plugins/pipeline-core/` and `harness/`, only the module itself and its own test name `createCloseJournal`, `advanceCloseJournal`, `storeCloseJournal` or `readCloseJournal` (file search), and the module reads no `process.argv`, so it has no command line of its own [code]. The journal is a second lifecycle whose write side has no importer. Whether a document or a script outside those two folders uses it is not verified.

Finding A4-2: the coordinator file lives in the Git common directory. After a move-aside of the session-authority directory the reported close ran in direct mode and no longer wrote its close request [queue C30-22, reported, not reproduced]. The owner route confirms the mode switch: with no catalogue it refuses `COR-NO-CATALOGUE` and sends the entry to the direct route [code].

### A5. One-shot close (`<core>/scripts/finish-feature.mjs`)

| Fact | Values | Defined in | Writer | Readers | Second copy | Drift detection | Repair | Agent-runnable |
|---|---|---|---|---|---|---|---|---|
| Stage names in the result | 22 literal names pushed onto `stages` plus 2 computed ones (`feature-package-<state>`, and one name from a variable) (search count) | `stages.push(...)` [code] | none found: the array is part of the returned result | the caller | none | n/a | n/a | n/a |
| Stop stages | 22 distinct first arguments of `stopResult(...)` (search count) | `stopResult` [code] | none | the caller | none | n/a | every stop names a runnable command or a named human step; a contract test reads the source and enforces it [notes w30g2] | per stop |
| Stop codes | 45 distinct `ONESHOT-*` literals (search count, a lower bound: some stops build the code from a variable) | same file [code] | none | the caller | none | n/a | per stop | per stop |
| Result status | `commit-required`, `closed-local` were read; the full set is not verified | schema `pipeline.one-shot-close.v1` [code] | none | the caller | the coordinator phase | n/a | n/a | n/a |

Finding A5-1: no status field of the one-shot's own was found. It writes records, requests and evidence (the acceptance record, the audit request, the close request) and derives its position from the State, the package and the coordinator on each run; the repair of most stops is "rerun the identical command". Whether any run stores the `stages` list is not verified.

### A6. Onboarding

| Fact | Values | Defined in | Writer | Readers | Second copy | Drift detection | Repair | Agent-runnable |
|---|---|---|---|---|---|---|---|---|
| Controlling non-ready status | 33 (the starting inventory said about 30) | `PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES` in `<core>/lib/project-onboarding-ready-gate.mjs` [code] | none: the status is computed by the producer on each observation (per the file comment; the producer `project-onboarding-v3.mjs` was not read) | the ready gate, `guard-lifecycle-ready` | the list is a hand-maintained mirror of "about 40" status literals of the producer (the file's own comment) | a derived-enumeration test at test time; a status missing from the list is answered with the wrong typed error (`PORG-INVALID-OBSERVATION` instead of `PORG-NOT-READY`), which the comment records as having happened for three statuses [code] | add the literal by hand | yes |
| Denial reason and action kind | reasons 3 (`PORG-NOT-READY`, `PORG-INVALID-OBSERVATION`, `PORG-OBSERVATION-UNAVAILABLE`), kinds 4 (`command`, `collect-input`, `restart-process`, `external-operator`) | `<core>/lib/lifecycle-denial-loop.mjs` [code] | none | the guard | none found | n/a | n/a | n/a |

### A7. Session authority, host commits, dispatches, slices, ceremonies

| Fact | Values | Defined in | Writer | Readers | Second copy | Drift detection | Repair | Agent-runnable |
|---|---|---|---|---|---|---|---|---|
| Registry member kind | 5: `continuity`, `override`, `ceremony`, `dispatch`, `armed-capability` | `KINDS` in `<core>/lib/session-authority-registry.mjs` [code] | the registry | the registry | n/a | n/a | n/a | n/a |
| Registry member phase | 5 seen as string literals: `reserved`, `armed`, `running`, `terminal-observed`, `released`; no single constant was found, so the set is not verified as closed | comparisons in `session-authority-registry.mjs` (`HEAL_IN_FLIGHT` holds `armed`, `running`) [code] | reserve, advance, release | every boundary read | the producer's own records (pending files, ceremony records, the State) | producer `reconcile`; `<producer>:namespace-drift` when the live namespace differs from the stored baseline hash | automatic heal when no bound member is armed or running (`healDrift`, once per process at entry and once lazily on the first strict read); otherwise `session-authority-repair.mjs inspect`, cancel the slice, heal [code] | yes, with the assertion flag where a member is left armed |
| Catalogue | bound to the participant sources of the plugin version that wrote it | `catalogue.json` under `<git common dir>/agent-pipeline/session-authority/` [code] | the registry | every boundary entry | the loaded plugin | `SDC-AUTHORITY-UNAVAILABLE` `catalogue-source-closure` | migrated on every entry (`migrateSourceUpdatedCatalogue`); heal [code, notes w30g3] | yes |
| Windows identity witness | in-process map of native facts per path | `session-authority-registry.mjs` near `windows-native-identity-drift` [code] | the registry | the registry | the file system | `SDC-AUTHORITY-CAS` `windows-native-identity-drift` | heal [notes w30g3, not proven on Windows] | yes |
| Owner-route binding | result statuses 3 (`completed`, `refused`, `held`); 14 distinct `COR-*` codes (search count), among them `COR-BINDING-HELD`, `COR-ENTRY-HELD`, `COR-RELEASE-HELD`, `COR-NO-CATALOGUE` | `<core>/scripts/continuity-owner-route.mjs` [code] | the owner route arms a continuity member, runs the entry, releases the binding | the State authority | the session cleanup binding in the State (A3) | `COR-ENTRY-HELD`: "the binding is kept because a write may have happened"; `COR-RELEASE-HELD` | the heal command the refusal prints; `release-orphan --root <root>` | yes |
| Repair verbs | routine repairs 5: `heal`, `slice-cancel`, `stop-failure-aside`, `move-aside`, `settled-pending-aside`; 8 distinct `SAR-*` codes (search count) | `ROUTINE_REPAIRS` in `<core>/lib/routine-repair.mjs`; `<core>/scripts/session-authority-repair.mjs` [code] | n/a | n/a | n/a | n/a | n/a | yes |
| Host-commit pending state | files `pending-<runner>-<64 hex>.json` plus `authority-<kind>-<sha of the pending bytes>[-<revision>].json`; 17 distinct `authority-<kind>-` prefixes appear in `<core>/lib/native-goldfish-host-state.mjs` (search count; file kinds and refusal reasons are not separated) | `<git common dir>/agent-pipeline/run/native-goldfish-host-commit/` [code] | the host-commit route | the registry producer, the repair inspection, the dispatch briefing | the registry baseline holds the namespace as hashes | namespace drift | see the next row | see the next row |
| Settled | 3 plus null: `integrated`, `integrated-by-commit`, `cancelled` | derived in `reservationReport` of `session-authority-repair.mjs`: `integrated` from an integration record on disk, `integrated-by-commit` from the commits of the candidate, `cancelled` from the queue state; `SETTLED_STATES` in `routine-repair.mjs` restates the 3 names [code] | none: derived on read | routine repair, the dispatch briefing (`DBG-SETTLED-PENDING-HEAL`) | the pending file stays on disk after it is settled | the briefing warning | `routine-repair.mjs run heal`; heal defers while a member is armed or running and then names `heal --no-goldfish-running`; its own retirement drifts the namespace, so it may finish with a move-aside (`autoMoveAsideAdmitted`) [code] | yes |
| Stop-failure record | one file per failed finalizer | `<git common dir>/agent-pipeline/run/native-goldfish-host-diagnostics/` (a legacy directory is still read) [code] | the stop hook | the dispatch briefing | none | n/a | `stop-failure-aside`; the next successful completion removes it (comment in `dispatch-briefing.mjs`) | yes |
| Dispatch liveness verdict | 3: `alive`, `gone`, `unjudgeable` | `<core>/lib/dispatch-record-liveness.mjs` [code] | none: judged on read | `readRunningDispatches`, the dispatch briefing | the pending reservation; the registry member; the queue row | `DBG-RUNNING-SCOPE-UNKNOWN` | finalize the dispatch record by the sanctioned writer | yes |
| Slice state | 5: `ready`, `hold-po`, `blocked-external`, `deferred`, `cancelled`; cancel classes 5; handback outcomes 6; handback classifications 2; commit modes 4 | `<core>/lib/slice-queue.mjs` [code] | `slice-queue.mjs` | the queue, the repair inspection | started and integrated are not slice states: they are derived from reservations and commits | n/a | `slice-queue.mjs cancel` | yes |
| Ceremony record phase | 3: `reserved`, `running`, `terminal-observed`; terminal 2: `completed`, `cancelled` | `<core>/lib/chat-gate-ceremony.mjs` [code] | `ceremonyPublish` | `reconcile` of the ceremony producer | a registry member whose phase and `sourceFacts` must equal the records | `chat:member-source-drift` | a move-aside was needed [queue C30-21] | not without the assertion flag |

Finding A7-1: `readRunningDispatches` drops only the verdict `gone`. A record that is `unjudgeable` (unreadable record, a version 1 claim with no owner process, no owner claim, an invalid claim) therefore counts as running for as long as the record exists [code].

Finding A7-2: "is a dispatch in flight" is answered from four places: the dispatch record and its owner claim, the pending reservation with `settled === null`, the registry member phase, and the started mark of a slice.

Finding A7-3: a settled pending file is at once a finished reservation and a member of a namespace whose hash a registry baseline holds. Removing it is, to the registry, a change made outside the registry.

Finding A7-4: the ceremony publishes `reserved` and `running` and then advances the member; later it publishes the terminal record and then advances the member. In both places a record write precedes the member write, with nothing that makes the pair one step [code, `runRegisteredCeremony` and `ceremonyExecuteBody`]. The ceremony runs without a member when no catalogue exists.

### A8. Derived and mirrored copies

| Copy | Source of truth | Where the copy lives | Drift detection | Repair | Agent-runnable |
|---|---|---|---|---|---|
| Calibration twins | not decided by one rule: the twins are seeded byte-identical | `project/pipeline.json` and `.claude/pipeline.json`. 8 modules hold both paths as a literal list of their own (`critic-evidence-carry`, `calibration-verify-commit-transition`, `analysis-run`, `maintenance-delivery`, `push-threat-model-materialize`, `security-close-status`, `close-quality-readback`, `onboarding-continuity`; search count), although `<core>/lib/project-authority-read.mjs` exports both as constants. `project-calibration-identity` holds the legacy path alone, as its probe for the source checkout [code] | `CVCT-TWIN-CAS` in `calibration-verify-commit-transition.mjs`. The two lists that were read (`security-close-status`, `close-quality-readback`) take the neutral file first; the other six were not compared [code] | edit both files; they are gate-strength files | needs the override route |
| Authority tiers | the resolved tier | 5 neutral and legacy path pairs (manifest, State, calibration, guard configuration, guard audit) in `project-authority-read.mjs`; the State itself has a neutral and a legacy path [code] | `resolveProjectAuthorityPaths` | not verified | not verified |
| Git hook runtime snapshot | the loaded plugin tree | the hook's install marker records `<state>/runtime-<sha256>/lib` | `HOOK-SNAPSHOT-STALE` (`assessHookCurrentness` in `<core>/lib/hook-currentness.mjs`): current only when the recorded path is the loaded path or the digests are equal [code] | `refresh-mandatory-hooks.mjs --root <root>`, once, then repeat the refused command | yes (Elephant; role-scoped [notes w30g3]) |
| Host plugin registry and attestation | the runner's own plugin registry | the attestation readback of the preflight | `IPA-HOST-REGISTRY-BINDING-UNAVAILABLE`, `plugin-attestation-required` [notes w30g3; the code was not read] | a person completes or repairs the host registration; `nextAction` stays null by design | no |
| Capability inventory, ledger, Reader inputs | the suites, hooks and skills in the tree | the inventory file and the ledger, refreshed after every chain (`scripts/rebaseline-inventory.mjs`; commit subject "refresh the derived files after candidate 30h") | the inventory gate goes red (`docs/operating-tools.md`) | run the rebaseline; the `sourceBaseline` block is a protected file | partly (protected file) |
| Evidence digests in the manifest | the evidence file bytes | `lifecycle.json` artifacts with a mutability class | `FTP-ARTIFACT-2`, `FTP-ARTIFACT-3`, `CPO-MANIFEST-EVIDENCE`, `FPR-VERIFY-IMMUTABLE` | a `mutable` entry is re-bound automatically (`autoRebindMutableArtifact`); an `immutable` or `append-only` entry needs the PO-signed reconcile, and the comment says this separation "is never made configurable" [code]; registered Verify evidence is never replaced [notes w30g2] | only for `mutable` |
| Critic course | the registered rounds in Git history | the course key, the review lineage record (verdicts 4: `pending`, `no-findings`, `findings`, `failed`; review modes 3; course statuses 2: `admitted`, `po-course-gate`; finding dispositions 4; failures 8; invalidation reasons 6) in `<core>/lib/critic-review-lineage-core.mjs`; 71 distinct `CCA-*` literals in `<core>/lib/critic-course-admission.mjs` (search count; one literal is cut at a digit) [code] | admission refuses | a new round, or the PO's discard and a successor feature | partly |
| Protected preimage inventory | the bytes of four Critic files | `codex-isolated-critic-protected-preimage.v1.json` [queue C30-17; not read] | the preimage test | re-pin through the PO route | no |

---

## B. Drift taxonomy

### B1. The classes

| Class | Root cause | Typical refusal |
|---|---|---|
| C1 | Two stored copies of one fact, written by different steps | a CAS or drift code that exists only to compare the copies |
| C2 | A stored value that could be derived from what is already stored | a missing or stale value, repaired by supplying it by hand |
| C3 | A digest that binds an artifact a human can still edit or delete | a digest mismatch whose only repair is the original bytes |
| C4 | A status that only a rare path ever clears | a warning or refusal that returns after every run |
| C5 | A registry bound to a plugin version or path that goes stale on reload | a refusal right after an update, before any work |
| C6 | A multi-step write with no atomicity | a half-written state that fits no reader |
| C7 | A binding that the Pipeline's own sanctioned next step invalidates | a refusal on the happy path, with no outside change at all |

C7 is added to the six classes of the request. The bound-session incident was described as a drift class of its own; reading the code shows four more members of the same class (B3).

### B2. The incidents

| # | Incident | Source | Classes | Spaces | State of the fix |
|---|---|---|---|---|---|
| I1 | `result.md` changed after the Result bound its digest; the close stopped `PS-RESULT-CLOSE-RESULT` with no cause | [queue C30-15 rows 1 and 3], [notes w30g1] | C3, C1 | A3, A8, A5 | the refusal names its cause and the restore; the one-shot stops early (30g). The copies remain. |
| I2 | A gate-definition change made during a close, a dirty tree from the partial close and a hand-deleted listed evidence file made the PO signature impossible | [queue C30-15 rows 9 and 10], [notes w30g2] | C6, C3 | A5, A4, A8 | every stop names a route; one clean-tree helper (30g). The partial close can still leave owned outputs uncommitted. |
| I3 | After a plugin reload: `SDC-AUTHORITY-CAS` `windows-native-identity-drift`, `SDC-AUTHORITY-HELD`, `HOOK-SNAPSHOT-STALE`, `plugin-attestation-required` with no `nextAction` | [queue C30-15 row 4], [notes w30g3] | C5 | A7, A8 | each refusal names one recovery (30g). Three version-bound copies remain; nothing runs by itself. |
| I4 | Pending host-commit states and stop-failure records need a manual heal before every dispatch (`DBG-SETTLED-PENDING-HEAL`) | [queue C30-9 item 4; queue section "Not built in 30d"] | C4, C1, C7 | A7 | open; the queue names the cause: stale armed members keep the heal deferred until `heal --no-goldfish-running`. |
| I5 | A running-dispatch scope warning although nothing runs (`DBG-RUNNING-SCOPE-UNKNOWN`) | no sprint document names it (the queue and `docs/state.md` were searched); cited from finding A7-1 [code] | C4, C1 | A7 | open |
| I6 | The package record lags behind the State after a declined acceptance (`recordLag`); a planning queue head is never advanced (`QUEUE-HEAD-LAGGING`) | no sprint document names them by these words; cited from the C28 comments in `finish-feature.mjs` and `continuity-state.mjs` [code] | C1, C4 | A1, A2, A3 | the one-shot moves the package back; a failure leaves a hand step; the lagging head is labelled by the reader. |
| I7 | `CCA-MANIFEST-READ` for the successor of a discarded feature; the State is a working-tree file | [queue C30-10, C30-12, C30-15 row C] | C2, C1 | A2, A8 | the successor relation is admitted by a flag (30f) and has a registration writer (30i); the State read on another machine is open. |
| I8 | The acceptance question was asked before Verify | [queue C30-15 row 2] | none of the classes: an ordering defect, not a drift | A5 | fixed (`w30g4`, per the queue). |
| I9 | A mistyped passphrase leaves ceremony records `running` and a registry member that disagree (`chat:member-source-drift`), cleared only by a move-aside | [queue C30-21, read in code, not reproduced] | C6, C1, C4 | A7 | open |
| I10 | A bound session's legacy lifetime key hashes the Continuity revision, so the exact +1 advance of one State entry changed the key | [notes w30i3], [queue C30-13] | C7 | A3, A7 | fixed in the 30i wave: the handle is carried across the advance; the key bytes are unchanged. |
| I11 | After the move-aside of I9 the close ran in direct mode and the registration refused `FTP-ARTIFACT-2/3` with no named repair | [queue C30-22, reported, not reproduced] | C6, C3, C1 | A4, A7, A8 | open |

### B3. The members of class C7

Each is a binding to a value that the Pipeline itself changes on the happy path.

| Binding | What moves it | Evidence | Today's answer |
|---|---|---|---|
| The legacy lifetime key includes `continuity.revision` | the +1 advance of the same write | [notes w30i3] | the handle follows the exact +1 advance |
| The Critic diagnostic needs candidate equal to HEAD | the export commit of the previous round | [queue C30-9 item 2, C30-13 `w30f2`] | a HEAD that is the candidate plus evidence-only follower commits is accepted |
| The package candidate is bound to HEAD | the close's own evidence commits | the C21C comment in `planFeaturePackageTransition` [code] | the exit `completed` to `verifying`, which needs a registered, passing Verify for the moved HEAD, then `completed` again |
| The Critic carry-forward range | committing leftover close outputs by hand | the CFC-2 comment cited in [notes w30g2] | the owned commit route carries evidence with the manifest |
| The registry baseline holds the namespace hash | heal's own retirement of settled pending files | `autoMoveAsideAdmitted` and its comment in `routine-repair.mjs` [code] | heal may finish with a move-aside of the registry |

The first, second and fifth have a fix or an interim. The third costs a second Verify run and a second pass through two package states each time the close commits its own evidence. That cost is a consequence of a real gate (the Verify must cover exactly the commit that is delivered), so it is a question for the PO (E1-1), not a defect.

---

## C. Ranked candidate simplifications

Ranking rule: blockings removed first, then states and copies removed, then risk. Size: S is one small dispatch, M is one full dispatch, L is several dispatches.

### C1. A settled dispatch is not a running dispatch

- **Removes blockings:** I5.
- **Derives instead of stores:** an `unjudgeable` dispatch record whose dispatch has a reservation settled as `integrated` or `integrated-by-commit` is not listed as running. The fact is read from the reservation rows that `reservationReport` already derives; nothing new is stored.
- **Stays:** a record judged `alive` always counts as running, whatever its reservation says; the scope-overlap refusal `DBG-SCOPE-OVERLAP`; an `unjudgeable` record with no such settled reservation is still announced, never a silent pass (the rule stated in `dispatch-record-liveness.mjs`). A `cancelled` reservation is not used as proof, because a cancelled Goldfish may still write.
- **Compatibility:** no record changes; the function only reads.
- **Size and risk:** S, low. The change sits in a warning path.

### C2. A pending state is retired by the step that integrates it

- **Removes blockings:** I4 in part. Only `integrated` has a writer to hook: the step that writes the integration record. `integrated-by-commit` and `cancelled` are derived on read and have no such step, so they still need heal.
- **Removes:** for integrated dispatches, the status "settled but still pending on disk". The integrating step moves the pending file and its siblings aside as a transition the registry knows, so the baseline is updated in the same boundary and no drift arises (finding A7-3).
- **Stays:** an unsettled or unreadable pending file is never moved; files are moved aside and retained, never deleted; a bound member that is armed or running keeps the strict refusal (`HEAL_IN_FLIGHT`); heal, its flag and the warning `DBG-SETTLED-PENDING-HEAL` remain for the other two settled kinds and for files of older versions.
- **Compatibility:** file names and record shapes are unchanged.
- **Size and risk:** M to L, medium to high (it touches the registry producer of the host commit). Not verified: where the integration record is written and whether that step runs inside a registry boundary. The first slice is a read-only proof of that.

### C3. The ceremony's records are the truth, the member is the copy

- **Removes blockings:** I9 and the cascade I11, on one condition: the reproduction that [queue C30-21] asks for must show that the blocked state is one of the two windows of finding A7-4. A wrong passphrase happens between those windows, so this is not proven. If the reproduction shows another cause, it decides the fix and this item is dropped.
- **Removes:** the refusal `chat:member-source-drift` for a member that is behind its records. When the member's facts are an exact prefix of the record facts, the member's phase is the phase at that prefix and no live operation owns the ceremony, the reconcile reads the member at the record's phase and the next boundary step catches the member up. A ceremony left `running` with no live owner is closed as `cancelled` by the next ceremony start.
- **Stays:** a member ahead of its records, a changed association and non-prefix facts refuse as today; the request schema, the intent digest, the proof format and all key handling are untouched (the scope guard of [queue C30-21]); the human signs exactly as before.
- **Compatibility:** no record shape changes; old records are read by the same rule.
- **Size and risk:** M, medium to high.

### C4. A stop of the close never leaves owned outputs uncommitted

- **Removes blockings:** the dirty-tree part of I2 and of I11.
- **Removes:** the state "half-written close": before the one-shot returns a stop after it wrote an owned output, it runs the owned commit (`commit-pipeline-owned.mjs --agent`) that the clean-tree helper already prescribes as step 1 [notes w30g2].
- **Stays:** foreign changes are never committed and are listed; the PO signs on a clean tree at the current HEAD; registered evidence is never replaced; the exact-HEAD Verify rule. The extra commit moves HEAD, so the existing `requalifies` path with its Verify applies as today.
- **Compatibility:** none needed; the commit is the one the helper already tells the agent to run.
- **Size and risk:** M, medium. The tension named in [notes w30g2] (a hand commit ended the Critic carry-forward) must be covered by a case before the change.

### C5. One list for the package states and for the phase

- **Removes blockings:** none today; it removes a known way to produce one (A6 shows what a forgotten literal costs).
- **Removes:** two literal copies of the nine package states and one of the two inline phase sets.
- **Stays:** the values; the total mapping test of the external adapter.
- **Compatibility:** values are identical, so no record is affected.
- **Size and risk:** S, low. Not verified: whether `check-artifact-topology.mjs` avoids the import on purpose; if so, a test that compares the lists replaces the import.

### C6. The package back-move is part of every one-shot run

- **Removes blockings:** the hand step that remains when the side step of the decline fails (I6).
- **Removes:** the persistent `recordLag` state: whenever the State proves a correction round and the package still says `verifying` or `completed`, the one-shot applies the admitted move first.
- **Stays:** the transition rule `returnsToCorrection`; the four status facts.
- **Compatibility:** none needed; the move is idempotent by the existing comment.
- **Size and risk:** S, low. Not verified: whether a rerun already retries the move.

### C7. The producer owns the onboarding status list

- **Removes blockings:** the wrong typed refusal for a status the mirror lacks (A6).
- **Removes:** the hand-maintained mirror of 33 literals. The producer exports its closed list, its shared result builder refuses a status outside it, and the gate imports the list.
- **Stays:** every status and every ready-gate decision.
- **Compatibility:** no stored record; the status is computed per observation.
- **Size and risk:** S to M, medium: the producer is large and was not read; the file comment records that a static extraction was tried and failed, which this proposal avoids by checking at the builder.

### C8. One source for the calibration paths

- **Removes blockings:** a latent one: eight private lists can come to disagree about which file is read first.
- **Removes:** eight private path lists, replaced by the constants and the path resolver that `project-authority-read.mjs` already exports.
- **Stays:** both files, their byte identity and `CVCT-TWIN-CAS`; the source-checkout probe; guard and override files that list the path as a protected path are not touched.
- **Compatibility:** read-only.
- **Size and risk:** M, low to medium. Retiring one twin is a separate PO decision (E1-3) and is not part of this item.

### C9. The discard record is read where the course is read

- **Removes blockings:** the open part of I7 (`CCA-ALIAS-MAPPING-UNAVAILABLE` on another machine).
- **Removes:** the dependence on the work-tree copy of the State: when the work tree lacks the record, admission reads the State at the candidate commit.
- **Stays:** the discard is still the PO's recorded decision; a successor still needs the recorded predecessor.
- **Compatibility:** read-only.
- **Size and risk:** S to M, medium. Precondition: verify that the State file is tracked in consumer projects; if it is not, this item is void and the manifest field `supersedes` is the only carrier.

### C10. Remove the write side of the legacy close journal

- **Removes blockings:** none today; it removes a parallel lifecycle that a later change could start to use again.
- **Removes:** 7 status values and three writers (`createCloseJournal`, `advanceCloseJournal`, `storeCloseJournal`) with no importer (finding A4-1).
- **Stays:** `validateCloseJournal` and `readCloseJournal`, so an old journal file stays readable (the AC-047-27 compatibility the comment names).
- **Compatibility:** read-only compatibility is kept; no existing file is rewritten.
- **Size and risk:** S, low. It restates existing cases of the module's own suite and removes exported functions, so it waits for the PO (E1-4). Precondition inside the slice: read AC-047-27 and search the documents for a use of the writers; stop if one exists.

### C11. After a reload, the agent-runnable hook refresh runs at session start

- **Removes blockings:** the `HOOK-SNAPSHOT-STALE` refusal of the first commit after an update (I3).
- **Removes:** no state; it removes the wait between "stale" and "refreshed" by running `refresh-mandatory-hooks.mjs` once at the session bootstrap when the attestation is good.
- **Stays:** the attestation and its human recovery; `nextAction` stays null there; the hook still refuses when it is stale.
- **Compatibility:** none needed.
- **Size and risk:** S, medium: [notes w30g3] chose "nothing is auto-run" on purpose, so this is a PO decision (E1-2).

### C12. One definition of "evidence-only follower commit"

- **Removes blockings:** none by itself.
- **Removes:** nothing yet. It names the C7 class in one place: the classifier of the 30f wave (`classifyRegisteredEvidenceOnlyCommits` [queue]) becomes the single definition for the checks that already accept such a HEAD (the Critic diagnostic).
- **Stays:** every check that needs the exact HEAD keeps it. In particular the package candidate and the Verify evidence stay bound to exactly the delivered commit and tree.
- **Open question, not a recommendation:** whether the package candidate may use the same definition, which would remove the `requalifies` exit and the stage `requalify-candidate`. That would let a Verify result stand for a later commit, so this document does not propose it (E1-1).
- **Size and risk:** S for the definition alone; the open question would be L and high risk.

### DO-NOT-DO

1. No automatic re-bind of an `immutable` or `append-only` artifact (`result.md`, the acceptance pointer, registered Verify evidence). The code says this separation is never made configurable.
2. No Verify result may stand for a commit it did not run on, unless the PO decides so in an ADR (E1-1).
3. No change to the bytes of an existing key or digest: the legacy lifetime key (kept by the 30i fix), the coordinator's effect chain, the manifest digests, the Critic lineage records.
4. No removal of a value from `FEATURE_STATES`, `COORDINATOR_PHASES` or `CRITIC_INVALIDATION_REASONS`: historic records carry them, and the coordinator validates the order of its effects by phase name.
5. No time-based expiry of a member, a reservation or a dispatch record. "Not in flight" must be proven from an integrated reservation or a dead owner process, never assumed from age.
6. A record judged `alive` is never dropped from the running set.
7. Nothing is deleted by a repair; files are moved aside and retained.
8. No automatic step for anything that needs a signature, and no automatic answer to the attestation.
9. The strict refusal for a bound member that is armed or running stays.
10. The `--no-goldfish-running` assertion is not removed before a proof replaces it.
11. No freehand edit of the State file (ADR-0029).
12. No new stored status. A recommendation that needs one must be redesigned as a derived read.

---

## D. Staged plan

Every slice is at most one Goldfish dispatch, is test-first, and names existing suites. "Unchanged" names what the slice must not touch. Rollback for every slice is the revert of its commits; no slice migrates or rewrites a stored record, so a revert needs no data repair.

### Stage 0: safe to start now (no dependency, no PO decision)

| Slice | Item | Files | Proof (existing suites) | Unchanged |
|---|---|---|---|---|
| SM-1 | C5 | `check-artifact-topology.mjs`, `evidence-view-model.mjs`, one phase set in `pipeline-state.mjs` | `scripts/check-artifact-topology.test.mjs`, `lib/evidence-view-model.test.mjs`, `lib/feature-package-topology.test.mjs`, `lib/external-reference-adapter.test.mjs` | every value; every transition |
| SM-2 | C1 | `dispatch-record-liveness.mjs`, `dispatch-briefing.mjs` | `lib/dispatch-record-liveness.test.mjs`, `scripts/dispatch-briefing.test.mjs`, `scripts/session-authority-repair.test.mjs` | `DBG-SCOPE-OVERLAP`; an `alive` record; the registry |
| SM-3 | C3, part 1: the failing-first reproduction of [queue C30-21], test files only | `chat-gate-ceremony.test.mjs`, `po-human-approval.test.mjs` | `lib/chat-gate-ceremony.test.mjs`, `scripts/po-human-approval.test.mjs` | all production code |

These are the first three slices. SM-3 delivers a finding either way: it proves or refutes the windows of finding A7-4.

### Stage 1: after stage 0

| Slice | Item | Depends on | Proof (existing suites) | Unchanged |
|---|---|---|---|---|
| SM-4 | C6 | none | `scripts/finish-feature.test.mjs`, `scripts/pipeline-state-inspect.test.mjs`, `scripts/close-path-e2e.test.mjs` | the transition table |
| SM-5 | C7 | none | `lib/project-onboarding-ready-gate.test.mjs` | every status and gate decision |
| SM-6 | C8 | none | `lib/project-authority.test.mjs`, `lib/calibration-verify-commit-transition.test.mjs` | both files; `CVCT-TWIN-CAS` |
| SM-7 | C9 | the tracking check of E2 item 10 | `lib/critic-course-admission.test.mjs` | the discard decision |
| SM-8 | C2, part 1: a read-only proof of where the integration record is written, with a failing-first case for "a pending state survives its own integration" | SM-2 | `lib/native-goldfish-host-state.test.mjs`, `lib/routine-repair.test.mjs` | all registry code |
| SM-9 | C2, part 2: retirement at integration | SM-8 | the two suites of SM-8, `scripts/session-authority-repair.test.mjs`, `scripts/dispatch-briefing.test.mjs` | the in-flight strictness; heal as fallback |
| SM-10 | C12, the definition only | none | `lib/critic-course-admission.test.mjs` | every exact-HEAD check |

### Stage 2: registry and close

| Slice | Item | Depends on | Proof (existing suites) | Unchanged |
|---|---|---|---|---|
| SM-11 | C3, part 2: the prefix rule and the retirement of an ownerless ceremony | SM-3 showing one of the two windows | `lib/chat-gate-ceremony.test.mjs`, `scripts/po-human-approval.test.mjs`, `scripts/repair-map.test.mjs` | the request schema, the intent digest, the proof format |
| SM-12 | C4 | none | `scripts/finish-feature.test.mjs`, `scripts/commit-pipeline-owned.test.mjs`, `scripts/close-path-e2e.test.mjs` | the owned set; foreign changes; the exact-HEAD Verify |

### Stage 3: after the PO decisions

| Slice | Item | Depends on | Proof (existing suites) | Unchanged |
|---|---|---|---|---|
| SM-13 | C10 | E1-4 | `scripts/publication-close-journal.test.mjs`, `scripts/close-coordinator.test.mjs`, `scripts/close-path-e2e.test.mjs` | the coordinator; the journal reader |
| SM-14 | C11 | E1-2 | `scripts/repair-map.test.mjs`, `lib/pins/git-hook-runtime-snapshots-go-stale-after-plugin-changes.test.mjs` | the attestation |

After every stage the derived files (inventory, ledger) are refreshed once by the Coordinator. The Full Verify and the Critic remain the Coordinator's and the PO's to schedule; no slice here replaces them.

---

## E. Decisions for the PO, and what was not verified

### E1. Decisions only the PO can take

| # | Decision | Recommendation |
|---|---|---|
| 1 | May a HEAD made of the checked candidate plus evidence-only follower commits count as that candidate for the package record (C12, open question)? It would remove one package exit, one close stage and one Verify run per close, and it would let a Verify result stand for a later commit. | No recommendation. It changes what a Verify result covers, so it is the PO's to weigh; if wanted, it needs an ADR first. Without it, everything else in this plan still works. |
| 2 | May the session bootstrap run the hook refresh by itself after a plugin reload when the attestation is good (C11)? | Yes for the hook refresh (it is idempotent and already agent-runnable). No for anything about the attestation. |
| 3 | Should one of the two calibration files be retired for consumer projects? | Not now. Do C8 first; decide after it has run in one candidate. |
| 4 | May the write side of the legacy close journal be removed while the read side stays (C10)? | Yes. |
| 5 | Where an integrated reservation or a dead owner process proves that nothing is in flight, may heal proceed without the `--no-goldfish-running` assertion (C2)? | Yes; keep the flag as the fallback for the cases with no proof. |

### E2. Not verified

Inventory gaps, by space:

1. (A1) How the plan lifecycle status is stored or derived (`plan-spec-state-v2.mjs` was read only at its constant); the values of `REGISTRABLE`; what the test of `check-artifact-topology.mjs` compares.
2. (A2) `planSubmission` and `planCancellation` were seen in code, not in the schema header that was read; the repair behind `CAC-APPROVAL-STALE`.
3. (A3) Which writers drive the Continuity close phases `verified`, `delivered`, `readback` and `closed`, and whether the one-shot close uses them; the count of `CONTINUITY_STATE_CODES`; the root keys of the Continuity block; the use of `resultSha256` in `IDENTITY_AUTHORITY_KEYS`.
4. (A4) The publication lifecycle of the same module (a third machine, export names only); whether a document or a script outside `plugins/pipeline-core/` and `harness/` uses the journal writers.
5. (A5) The full set of one-shot result statuses; stop codes built from a variable; whether the `stages` list is written anywhere.
6. (A6) The producer of the onboarding statuses (`project-onboarding-v3.mjs`) and its real count.
7. (A7) Whether the five registry member phases are the complete set (no constant defines them); which of the 17 `authority-<kind>-` prefixes are files and which are refusal reasons; where the integration record is written.
8. (A8) The attestation code path, the capability inventory and ledger file names and their generators, and the protected preimage inventory: known from the notes, the queue and `docs/operating-tools.md` only. The order in which six of the eight calibration lists read the two files.
9. (A8) Why `check-artifact-topology.mjs` holds a literal list.
10. (A2) Whether the State file is tracked in consumer projects.

Incident gaps:

11. The mechanism of I9 was read, not reproduced; finding A7-4 names two windows but does not prove that the incident hit either.
12. I11 is a report of a consumer session and was not reproduced.
13. No sprint document was found that names I5 or I6 by their codes; they are cited from code.
14. Whether heal clears the Windows identity drift [notes w30g3, not proven]; nothing here was run on Windows.
15. Whether the guard union admits the `git restore` that the Result repair prints [notes w30g1, open].
16. Whether a rerun of the one-shot already retries the package back-move (C6).

Document gaps:

17. Of the ADRs only the index titles and a few lines of ADR-0029 were read. `docs/state.md` and `docs/operating-model.md` were searched for keywords, not read. `backlog/` was not read; two backlog items are known only because code comments name them.
18. All sizes and risks are estimates. No suite was run for this analysis.

Observation of this dispatch (seen, cause not analysed): two refused shell commands printed that planning the override route failed with `SDC-AUTHORITY-UNAVAILABLE` and with `SDC-LOCK-HELD`. A refusal text that depends on the registry being available is itself exposed to the drift this document describes.
