# Technical specification — Agent Pipeline 0.4.7 hotfix

Status: `approved by the PO on 2026-07-31; implementation authority requires
the matching digest-bound lifecycle write for these stabilized PRD/Spec bytes`.

This specification implements the neighboring
[PRD](prd_agent-pipeline-0.4.7-hotfix.md) against exact base
`9d1b3dc108eb77629ace5b82002120f5539abd8d`. It is intentionally independent
of Sprint Nova and Pull Request #64.

## -1. Current code-first release authority — 2026-07-31

This section is the highest normative authority in this document. It
supersedes every conflicting historical branch, baseline, implementation
status, or deferral below. Current `main` code is newer than the PRD, this
Spec, and the GitHub Issue implementation sketches. The nine open Issues with
label `hotfix:0.4.7` remain mandatory outcome scope: #63, #70, #71, #73, #77,
#81, #82, #83, and #84.

The design baseline is commit
`83640cec22d494d227eebc82929370277ce926b9`. Existing AC-047-01–68 retain
their identifiers and implemented behavior. The following AC-047-69–135 bind
only the current missing or newly reproduced release remainder.

### AC-047-69–74 — Fixed exact-candidate main publication (#81)

- **AC-047-69 — Existing authority consumption:** WHEN an existing publication
  record is exactly `push-authorized`, THE SYSTEM SHALL expose one plugin-owned
  executor that consumes that record rather than creating a parallel approval
  or accepting caller-selected Git arguments.
- **AC-047-70 — Exact fast-forward tuple:** BEFORE an external effect, THE
  executor SHALL revalidate repository and sanitized remote fingerprints,
  destination `refs/heads/main`, candidate commit/tree, remote preimage,
  fast-forward proof, required candidate evidence, approval digest, and expiry.
- **AC-047-71 — One-use boundary:** THE executor SHALL consume authorization
  before the effect and SHALL reject replay, altered arguments, force, delete,
  tag, merge, additional refspec, implicit source, another destination, and
  non-fast-forward updates.
- **AC-047-72 — Uncertain result:** WHEN transport/authentication outcome is
  ambiguous, THE executor SHALL perform fresh alternates-disabled remote
  readback, SHALL NOT automatically retry the push, and SHALL close only on an
  exact candidate/tree match. A changed preimage requires a fresh plan and
  approval.
- **AC-047-73 — Generic guard remains closed:** Raw Bash/Git push and Human
  Guard Override SHALL remain unable to authorize Git or publication. #77 and
  release preflight SHALL reference only the fixed publication capability.
- **AC-047-74 — Disposable-remote evidence:** Tests SHALL cover success,
  already-published convergence, stale CAS, wrong identity/evidence, replay,
  crash boundaries, ambiguous results, and every prohibited Git shape using an
  isolated disposable remote with sanitized candidate-bound evidence.

### AC-047-75–80 — Deterministic shipped-supervisor heartbeat (#82)

- **AC-047-75 — Code-first scope:** WHEN the accepted Core candidate does not
  ship or register a Sprint-local worker supervisor, Core Verify SHALL NOT
  import or require that unshipped implementation. IF a supervisor is actually
  adopted into the candidate, the remaining criteria in this block apply.
- **AC-047-76 — Advancement invariant:** A shipped supervisor SHALL prove
  heartbeat progress with an explicit monotonic generation/event transition,
  not by requiring two legitimate events to receive distinct wall-clock
  timestamps.
- **AC-047-77 — Deterministic fixtures:** Conformance tests SHALL inject a
  deterministic clock/event boundary and cover equal clock resolution, delayed
  scheduling, normal advancement, stale/missing heartbeat, worker exit,
  timeout, cancellation, lease loss, and orphan recovery.
- **AC-047-78 — Fail-closed supervision:** A relaxed timestamp assertion SHALL
  NOT become success. Missing, stale, non-advancing, orphaned, or lease-lost
  workers remain typed failures inside the configured supervision contract.
- **AC-047-79 — Runtime integration:** At least one process-level test SHALL
  observe a real runtime transition without depending on sub-millisecond
  ordering or uncontrolled sleeps.
- **AC-047-80 — Evidence:** Repeated focused tests and Full Verify SHALL bind
  commit/tree, adapter/supervisor contract, platform class, clock mode, command,
  and result without private host data. Broader worker-pool scope remains #21.

### AC-047-81–87 — Provenance-consistent neutral authority adoption (#83)

- **AC-047-81 — Versioned classification:** THE SYSTEM SHALL classify every
  expected `project/` authority file as canonical, generated, migrated, or
  prohibited. Bootstrap SHALL NOT silently create untracked canonical
  authority in a governed checkout.
- **AC-047-82 — Frozen endpoints:** BEFORE adoption, THE planner SHALL bind the
  accepted source commit/tree and authority-contract digest plus destination
  commit/tree, configured branch/upstream, cleanliness, and relevant target
  preimages.
- **AC-047-83 — Runtime provenance:** Normal qualification SHALL load the
  governed candidate or an explicitly declared installed artifact whose
  commit/tree, compatibility, and operation are bound to the run. An
  undeclared source mix fails early with a typed sanitized diagnostic before
  checkout mutation.
- **AC-047-84 — Existing migration transaction:** Adoption SHALL extend the
  current neutral project-authority plan/apply/recovery contract, preserve
  legacy/source bytes and destination-owned semantics, require exact
  confirmation, and cover clean, existing, partial, conflicting, stale, race,
  rollback, and replay states.
- **AC-047-85 — Clean qualification:** A fresh destination worktree SHALL
  bootstrap without unexpected untracked authority files and SHALL pass
  focused authority tests, Full Verify, and Security on the exact candidate.
- **AC-047-86 — Semantic topology:** Topology/freshness evidence SHALL
  distinguish canonical product changes from local technical PRD bindings and
  SHALL NOT treat private paths or unpublished local-only commits as accepted
  authority.
- **AC-047-87 — Downstream receipt:** The accepted hotfix SHALL emit a
  sanitized, digest-bound adoption/adaptation receipt that #67 and Phoenix may
  consume later. This hotfix SHALL NOT copy in-flight source, rebase Phoenix,
  or mutate a downstream checkout.

### AC-047-88–98 — Runner-neutral exact-candidate Verify (#84)

- **AC-047-88 — Required history:** GitHub Actions SHALL fetch sufficient
  history, normally `fetch-depth: 0`, while retaining
  `persist-credentials:false` and `contents:read`.
- **AC-047-89 — Typed topology preflight:** BEFORE candidate/ancestor-bound
  suites, Verify SHALL prove the exact parent and every declared evidence
  baseline are resolvable; insufficient history SHALL produce a typed topology
  failure rather than misleading product-test failures.
- **AC-047-90 — Runner-free Core:** `node harness/scripts/verify.mjs` SHALL run
  hermetically and offline-capably on a clean supported CI host without Codex,
  Claude, Antigravity, authentication, or productive runner configuration.
- **AC-047-91 — Injectable neutral boundary:** Generic lifecycle tests SHALL
  inject executable identity/version, launch construction, runtime readback,
  re-entry evidence, capability discovery, process events, cancellation,
  timeout, normalized result, and typed-unavailable behavior. They SHALL NOT
  resolve productive runners from host `PATH`.
- **AC-047-92 — Offline adapter conformance:** Every shipped adapter SHALL have
  mandatory deterministic fixtures for its native invocation, parsing,
  capability, cancellation, timeout, malformed output, and unavailable
  behavior while retaining runner-native distinctions.
- **AC-047-93 — Live certification separation:** Live runner qualification
  SHALL be a separately selected, pinned-version, authority-declared evidence
  lane. Missing prerequisites report `unavailable`; release policy, not
  accidental host contents, decides whether that blocks publication.
- **AC-047-94 — Lifecycle matrices:** Current onboarding runtime, Advisor
  bootstrap, V4, E2E, and review matrices SHALL pass through deterministic
  fixtures without weakening their production adapters.
- **AC-047-95 — Finalized trace identity:** Critic trace verification SHALL
  reject unlink/replacement deterministically even under immediate inode reuse,
  and retain truncation, content mutation, mode, symlink/reparse, and path
  replacement protection through sufficient finalized identity/content
  binding.
- **AC-047-96 — Rollback identity:** WHEN a newly created onboarding target is
  replaced by foreign or identity-changed bytes during rollback, THE SYSTEM
  SHALL preserve the foreign object and report typed `rollback-failed`; exact
  retry and zero-unrelated-mutation behavior remain.
- **AC-047-97 — Evidence privacy:** Core, adapter, and selected live evidence
  SHALL bind candidate, runner/adapter version, platform class, command/result,
  and typed unavailable reason without credentials, account identity,
  hostname, private path, or raw runner configuration.
- **AC-047-98 — Integrated gate:** Full Verify, blocking Security, high-risk
  Critic, package/install readback, and later downstream adoption records SHALL
  bind one immutable candidate. Issue closure evidence may be published only
  through a separately authorized GitHub operation.

### AC-047-99 — Reachable canonical backlog evidence (#70)

- **AC-047-99 — Ledger reachability:** The current canonical checker SHALL pass
  with the managed-onboarding item still open. Events 39/40 and every retained
  evidence reference SHALL bind reachable local commits and exact projections
  through an append-only, rollback/replay-safe correction; no history rewrite,
  fabricated commit, or status/Issue closure is permitted.

### AC-047-100–105 — Portable neutral cleanup state

- **AC-047-100 — No private portable binding:** A sanctioned cleanup start
  SHALL NOT serialize session ID, descriptor digest, nonce, host path, owner,
  PID, or equivalent machine-local cleanup identity into
  `project/pipeline-state.json` or another portable repository authority.
- **AC-047-101 — Private binding authority:** Descriptor identity and binding
  SHALL live solely in owner-private Git-common-dir/runtime storage with
  authenticated integrity, CAS, restrictive permissions, and sanitized public
  status.
- **AC-047-102 — Neutral fail-closed parity:** Every active neutral State read,
  write, migration, close, publication, and recovery boundary SHALL apply the
  same portability rejection currently applied to bound legacy migration
  input.
- **AC-047-103 — No manual dual-path repair:** Legacy `.claude/` and neutral
  `project/` consumers SHALL converge through sanctioned transactions; no
  manual copy, direct State edit, or installed-cache patch is required.
- **AC-047-104 — Restart and crash safety:** Start/reuse/cleanup/release and
  interrupted recovery SHALL rebind only exact private descriptors, converge
  idempotently, and leave portable State null/sanitized before and after every
  repository write.
- **AC-047-105 — Process evidence:** Tests SHALL reproduce the sanctioned
  neutral start, inspect structurally with identifiers redacted, prove no
  private portable binding, cover legacy/neutral parity and hostile drift, and
  retain normal cleanup/close/publication behavior.

### AC-047-106–111 — Editable design, submission, and approval lifecycle

- **AC-047-106 — Closed schema and compatibility:** Portable
  `pipeline.state.v0` SHALL keep the existing exact
  `activeFeature:{id,planPath,phase}` shape and phase enum
  `design|implementation`. A new optional top-level
  `planSubmission` SHALL carry the exact current PRD/Spec/profile digests and
  submission audit; a new optional top-level `planInvalidation` SHALL record
  the last sanctioned invalidation. The canonical derived status enum is
  `draft|awaiting-approval|approved|implementing`: `draft` =
  design/no current submission/no current approval; `awaiting-approval` =
  design/current submission/no approval; `approved` = design/current matching
  submission and approval; `implementing` = implementation/current matching
  submission and approval. Legacy valid states derive `draft`, `approved`, or
  `implementing` from current fields until their next sanctioned write.
- **AC-047-107 — Explicit submission:** Only a sanctioned digest-bound submit
  transition SHALL change `draft` to the canonical hyphenated status
  `awaiting-approval`; submission is not approval and does not enter
  implementation.
- **AC-047-108 — Reopen before edit and drift safety:** A sanctioned
  `reopen-design` transaction SHALL clear current submission/approval
  authority, preserve historical audit, record invalidation, and set phase
  `design` before an authoritative PRD/Spec edit is admitted. Independently,
  any observed digest drift SHALL immediately derive no implementation
  authority and a typed reopen action; it can never remain approved because a
  post-tool update was missed. After reopen, repeated design edits remain
  writable without another PO action.
- **AC-047-109 — Exact approval:** Only a sanctioned PO approval bound to the
  exact current PRD, Spec, profile, and submission SHALL transition
  `awaiting-approval` to `approved`. A separate sanctioned phase transition may
  enter `implementation` only from that exact `approved` state and then derives
  `implementing`. Stale, partial, contradictory, or replayed approval fails
  closed.
- **AC-047-110 — One derived model:** State writer, onboarding classifier,
  continuity, Dev-Plan guard, statusline, bootstrap/resume, feature-package
  topology, close, and approval readers SHALL derive the same lifecycle status
  and phase. Historical approval may remain audit data but is never current
  authority after invalidation.
- **AC-047-111 — Lifecycle fixtures:** Unit and process tests SHALL cover
  repeated draft edits, submit, edit-after-submit, approve, edit-after-approve,
  restart/resume, reapprove, malformed/hostile states, exact revocation
  postimages, and guard admission in design versus implementation.

### AC-047-112–116 — Repository freshness vs Pipeline update availability

- **AC-047-112 — Separate observations:** Bootstrap SHALL expose distinct
  `pipeline.repository-freshness.v0` and
  `pipeline.pipeline-update-availability.v1` results. The latter is a closed
  result with `status:current|update-available|local-ahead|unknown`, loaded
  version/commit evidence, marketplace commit evidence,
  `updateRecommended:boolean`, and a digest-bound policy disposition. Neither
  result may reuse the other's branch, upstream, candidate, or write decision.
- **AC-047-113 — Configured upstream only:** Repository freshness SHALL compare
  checked-out `HEAD` only with its configured upstream. Thus
  `sprint_phoenix == origin/sprint_phoenix` is `equal` even when `main`
  differs, and repository writes remain permitted.
- **AC-047-114 — Loaded distribution comparison:** Pipeline update
  availability SHALL compare the actually loaded plugin build/commit with the
  marketplace default head. Older/equal/ahead/unknown results SHALL be
  reported as update metadata, not reinterpreted as repository divergence.
  The old `pipeline.ruleset-freshness.v1.writePermitted` field is deprecated:
  compatibility readers SHALL treat it as update metadata only and SHALL use
  repository freshness for ordinary write admission.
- **AC-047-115 — Nonblocking default:** An ordinary newer marketplace build
  SHALL yield `updateAvailable`/`updateRecommended` while preserving current
  branch tracking and write/review permission. Only a separately explicit,
  plugin-shipped `pipeline.ruleset-update-policy.v1` entry may elevate a named
  update to blocking. Such an entry SHALL bind policy id/version/digest, an
  exact blocked loaded version/commit set or minimum safe version, a public
  security reason, and an explicit `blocking` disposition. Absence, mismatch,
  ordinary feature drift, or generic behind/diverged status is advisory.
- **AC-047-116 — Explicit operator boundary:** Update remains an operator
  action (`/plugins update`, then `/new` for Codex). The checker SHALL never
  auto-update, restart, retarget upstream, checkout, rebase, merge, copy
  hotfix source, or mutate refs/config/worktree. Tests SHALL cover Phoenix
  branch equality with differing main, older loaded Pipeline, default-head
  movement, offline/unknown results, policy match/mismatch, migration of old
  `writePermitted` consumers, and visibly separated output. Bootstrap skill,
  harness copy, staleness hook, and tests SHALL remove generic F2 write
  blocking while retaining only the exact versioned security-policy block.

### AC-047-117–123 — Update channels and host-wide source topology

- **AC-047-117 — Closed channel contract:** Pipeline update availability SHALL
  support exactly `alpha|beta|stable`. `alpha` resolves only the configured
  official development head (`refs/heads/main` for this distribution);
  `beta` resolves the highest valid SemVer `vX.Y.Z-beta.N` or a later final
  promotion of that line; and `stable` resolves only the highest valid final
  `vX.Y.Z`. Annotated and lightweight tags SHALL resolve to their peeled
  commit. Malformed, ambiguous, missing, or unreachable channel authority
  yields typed `unknown/channel-unavailable` with no fallback to another
  channel.
- **AC-047-118 — Automatic project defaults:** Initial onboarding SHALL NOT
  ask the user to select or confirm an update channel. A Pipeline
  self-application repository defaults to `alpha`; every ordinary managed
  consumer repository defaults to `stable`; `beta` is opt-in. Self-application
  SHALL be established by explicit trusted project/lifecycle authority, never
  inferred merely because the host currently loads a local-development
  plugin. Therefore a host-wide local-development source switch does not
  silently change a consumer repository's channel default.
- **AC-047-119 — Portable per-repository override:** A repository MAY later
  select another closed channel through one documented, sanctioned,
  digest-bound configuration writer and readback for the existing portable
  calibration field `pipelineUpdateChannel`. The writer SHALL preserve all
  unrelated calibration bytes/semantics, accept no URL/ref/remote input, and
  cover exact replay, drift, malformed configuration, and invalid enum values.
  Onboarding documentation SHALL explain the switch; normal onboarding SHALL
  not prompt for it.
- **AC-047-120 — Resolution evidence:** Update output SHALL visibly name the
  effective channel, selection source (`project-config` or
  `distribution-default`), resolved ref/tag/version/commit, loaded build
  evidence, comparison result, and advisory/blocking policy disposition.
  Repository branch/upstream and write permission remain absent from this
  result. Invalid explicit configuration is fail-closed `unknown`, never a
  silent default.
- **AC-047-121 — Source topology is separate and host-wide:** The actually
  loaded Pipeline source is a machine-local Codex/App-Server selection, not a
  portable repository setting. The official selector
  `pipeline-core@agent-pipeline` and isolated local-development selector
  `pipeline-core@agent-pipeline-local` apply to every repository session using
  that shared App Server. Any UI, CLI plan, or documentation that offers this
  source switch SHALL state before mutation that it affects all repositories
  on the host. No repository config may silently install, remove, enable,
  disable, or switch either selector.
- **AC-047-122 — Attended source switch:** Entering or leaving local
  development SHALL remain an explicit machine-local operator workflow:
  close affected sessions, maintain exactly one enabled Pipeline selector,
  use a fresh cachebuster for each local candidate, restart/read back the
  shared App Server where required, and start a fresh session. The workflow
  SHALL never auto-switch based on a repository channel, auto-delete another
  cache, or claim simultaneous per-repository loaded Pipeline versions on one
  shared App Server.
- **AC-047-123 — Release promotion decision:** A publication/release plan SHALL
  bind the exact candidate commit/tree, version and tag, and SHALL explicitly
  distinguish prerelease (`beta`) from final (`stable`) promotion before any
  external effect. It MAY propose the normal final-release default, but it
  SHALL never publish, tag, change host source topology, or rewrite repository
  channel configuration without the existing explicit release gate. `alpha`
  remains the development-head observation and is not itself a release tag.

### AC-047-124–130 — Parallel Sprint baseline and promotion policy

- **AC-047-124 — Immutable Sprint baseline:** Every Pipeline-managed Sprint
  SHALL record an exact selected integration baseline commit and tree (or an
  exact released tag peeled to both), its declared bounded write-set, and one
  closed baseline disposition. Missing/broad baseline or write-set authority
  fails closed with a typed repair plan; it never becomes implicit `main`.
- **AC-047-125 — Four dispositions:** The closed disposition enum SHALL be
  `baseline-current|baseline-stale-deferred|baseline-impact-review-required|
  rebase-required-for-promotion`, with status/readiness output that does not
  claim freshness or merge-readiness for a deferred branch.
- **AC-047-126 — Rebase is not a steady-state gate:** A disjoint ordinary
  integration-baseline advance MAY become `baseline-stale-deferred`; ongoing
  Sprint work remains permitted without a generic rebase nag. Repository
  freshness still compares the checked-out branch with its configured
  upstream and remains independent of baseline disposition.
- **AC-047-127 — Mandatory bounded impact review:** A baseline advance touching
  security/release controls, guards/configuration/permissions, bootstrap,
  installation, runtime/native-readback boundaries, accepted compatibility
  contracts, or the Sprint write-set SHALL enter
  `baseline-impact-review-required`. A digest-bound receipt SHALL record the
  observed baseline commit/tree, changed surface classes, write-set
  comparison, decision, and any PO exception.
- **AC-047-128 — First merge-ready candidate:** The next integration candidate
  is the first Sprint whose own approved scope, candidate evidence, and gates
  are actually ready, not the oldest or largest branch. Candidate selection is
  explicit PO/release authority and does not mutate other Sprint baselines.
- **AC-047-129 — Promotion rebase:** Only the selected merge/release candidate,
  a Sprint with confirmed material incompatibility, or a Sprint requiring a
  protected shared surface enters `rebase-required-for-promotion`. The
  promotion plan binds the exact target `main` commit/tree, freezes the Sprint
  candidate, performs no automatic Git action, and requires an explicit
  operator rebase followed by regenerated bindings and complete final gates.
- **AC-047-130 — Repairable fail-closed policy:** Every blocking state SHALL
  expose a typed, bounded recovery contract:
  `baseline-repair`, `write-set-repair`, `impact-review-receipt`,
  `promotion-rebase`, or `resume-interrupted`. Planner operations are
  read-only; apply actions are digest/CAS-bound and separately confirmed.
  Crash, replay, drift, conflicting receipts, unknown changed surfaces, and
  unavailable Git evidence SHALL converge or return a usable next action,
  never a writer deadlock or an instruction to edit portable State manually.

### AC-047-131–135 — Upgrade, kickoff and lifecycle recovery completeness

- **AC-047-131 — Legacy approval reopen:** A valid pre-submission V2
  implementation state MAY use the sanctioned `reopen-design` writer. The
  atomic postimage sets phase `design`, clears current approval, derives
  `draft`, invents no submission/approval/invalidation event, and preserves
  unrelated history. Inconsistent V2 authority, document drift, replay with a
  different postimage, or a current submission fails closed.
- **AC-047-132 — Portable-cleanup upgrade recovery:** When a neutral portable
  State contains exactly one legacy machine-local cleanup tuple, the migration
  recovery classifier SHALL use this exact priority rather than support only
  the completed-closure case: (a) first, an exact completed closure receipt
  uses the existing `project-authority-migration recover` CAS
  sanitization/release path; (b) otherwise an exact still-valid private
  descriptor exposes the read-only `session-cleanup.mjs plan-privatization
  --repo <physical-root>` lifecycle action and is bound or adopted into
  authenticated private runtime authority before removal from portable State,
  without ending the live session; and (c) an exact non-live/reused or
  admissible legacy descriptor with no cleanup manifest is retired through the
  existing bounded orphan proof before the portable tuple is sanitized.
  `plan-privatization` SHALL return schema
  `pipeline.session-cleanup-privatization-plan.v1`, status `ready|noop`, one
  valid 64-hex plan digest, and for `ready` a complete command `applyAction`
  for the loaded plugin's `session-cleanup.mjs apply-privatization --repo
  <physical-root> --plan-sha256 <exact-digest> --activate`. The action SHALL
  declare `mutation:true`, `requiresConfirmation:true`,
  `executionBoundary:host-authorized-wsl`, and expected schema
  `pipeline.session-cleanup-privatization-apply.v1` with
  `applied|noop`. Neither public plan, diagnostics, log nor action may contain
  the session ID or descriptor digest; the exact State preimage remains bound
  by the plan digest. Apply SHALL write and fully read back the private binding
  before atomically committing the portable State postimage. The confirmed
  writer changes only the exact private binding/descriptor lifecycle and
  `continuity.runtime.sessionCleanup:null`, preserves all unrelated State, and
  requires a complete subsequent V4 inspection that reaches `ready` before
  bootstrap may continue. Missing/malformed/multiple or substituted
  identities, active cleanup uncertainty, unavailable liveness, receipt
  drift, replay drift, a stale plan or a foreign lock remain typed failures;
  every safely recoverable class returns its exact next planner/writer instead
  of `null`.
- **AC-047-133 — Kickoff-to-work promotion:** An exact unapproved revision-zero
  kickoff seed MAY be atomically promoted into a real
  `epic|feature|mini` work feature through a digest-bound plan/apply that binds
  existing PRD/spec authority and the single private kickoff history. It
  replaces feature and continuity together, appends promotion history, and
  creates neither submission nor approval. A real active feature, dispatched
  work, document/history drift, replay-mix, or non-kickoff source fails closed.
- **AC-047-134 — Profile-correct lifecycle:** Epic and Feature promotion SHALL
  enter editable design and their normal PRD/Spec approval path. Mini SHALL
  retain the Mini process contract (no newly manufactured PRD/approval
  ceremony); any technical authority paths supplied for exact kickoff
  migration are migration evidence, not a new Mini PRD gate. Reopen,
  submission, approval and guard behavior SHALL be covered across Epic,
  Feature and Mini wherever the profile contract permits the transition.
- **AC-047-135 — No recovery deadlocks:** V4 lifecycle classification and the
  central guard SHALL expose and admit only the exact typed read-only planner
  and returned confirmation-bound writer for every supported non-ready state.
  No valid upgrade state may simultaneously require a recovery command and
  block that command because the session is not ready. The Pipeline-start
  contract SHALL execute only an exactly returned privatization planner,
  accept only its closed digest/action shape, present the apply action
  unchanged for explicit PO confirmation, execute it exactly once at the
  declared host write boundary, and restart Step 0 from the V4 inspector after
  `applied|noop`; it SHALL never report bootstrap success before the fresh
  result is actually `ready`. Process tests SHALL reproduce the prior
  Phoenix/Nova/Rune portable-cleanup locks and the kickoff feature-transition
  lock, prove the reachable recovery chain through V4 `ready`, and reject
  lookalike commands, direct State edits, identity disclosure, missing
  activation, stale digests, State drift, and foreign-lock deletion.

### Current ownership and focused-gate map

| Slice | Criteria | Exclusive production ownership | Required focused gate |
| --- | --- | --- | --- |
| F0 lifecycle/cleanup | AC-047-100–111, 131–135 | cleanup/recovery, portable State writer, approval/submission model, kickoff promotion, onboarding/continuity/topology/Dev-Plan readers | session-cleanup binding, project-authority/migration, onboarding V3, legacy reopen, kickoff promotion, pipeline-state, feature-package topology, Dev-Plan and lifecycle-guard suites |
| F1 freshness/baseline/backlog | AC-047-99, 112–130 | ruleset/update channels and repository freshness, per-project channel writer, host-source documentation, parallel-Sprint baseline policy, staleness/bootstrap policy, backlog ledger/projections | ruleset/repository freshness, channel writer, parallel-Sprint policy, backlog state suite and canonical checker |
| F2 Verify/supervision | AC-047-75–80, 88–98 | Verify workflow/harness, injected runner seams, Critic trace identity, onboarding rollback identity, only shipped supervisor paths | Critic isolation, onboarding V3/E2E, Advisor bootstrap, and runner-free Full Verify |
| F3 publication | AC-047-69–74 | existing publication bundle/authority, fixed executor, publication-only State/guard/close/release integration | bundle, authority, State-authority, close-journal, and new executor disposable-remote suites |
| F4 authority adoption | AC-047-81–87 | neutral authority resolver/migration, runtime provenance, classification and adoption receipt | project-authority, migration, and onboarding V3 suites |
| F5 retained regression | AC-047-01–68 | no redesign; only exact affected current surfaces on regression | existing focused suite matrix |
| F6 immutable candidate | AC-047-01–135 | integration metadata, package/version/evidence only after all production slices | all focused gates, Full Verify, Security, high-risk Critic, install/readback, portable-state readback |

Exact file paths, command lines, sequencing, shared-file handoff, and stop
conditions are binding in [implementation-plan.md](implementation-plan.md).
F0 releases shared State/onboarding files before F3/F4 may edit their bounded
regions; no two concurrent dispatches own the same file.

## 0. Final expanded release authority — 2026-07-29

This section supersedes the historical narrowed disposition in section 0A and
every conflicting historical status statement below. The Human/PO activated
this scope; after the implementation documents stop changing, their exact
final digests must be selected again through the sanctioned authority writer.

Implementation continues from the published corrective baseline
`41c09045e73b95988a335bcf1c476734f7785302`. The following criteria are
normative release requirements:

| Scope | Normative acceptance |
| --- | --- |
| Issue #70, backlog admission | AC-047-01–02 and H1 |
| Issue #63, V4 source/manifest recovery | AC-047-03–08 and H3 |
| Issue #73 retained bootstrap/runtime/cleanup repair | AC-047-09–15, AC-047-27–50 and H2/retained lifecycle slices |
| Issue #71, reactive WSL IPC compatibility | AC-047-16–23 and H4 |
| Discovered kickoff-authority classification | AC-047-51 |
| Issue #77, unified close ordering | AC-047-52–60 and H5 |
| Issue #80, Advisor lifecycle split | AC-047-24, AC-047-61–68 and H6 |

The Host Advisor policy uses 180,000/90,000 ms only for a valid on-demand
consultation. Bootstrap uses a separate model-free preflight with no prompt,
child, export, receipt or consultation budget. Issue #72/native Apple Silicon
remains a non-gating follow-up.

Because this scope changes security, lifecycle, generated-authority and
machine-local configuration surfaces, the final immutable commit/tree requires
fresh candidate-bound Full Verify, blocking Security and independent high-risk
Critic evidence. No earlier Full-Verify/Security run can authorize the expanded
candidate.

### AC-047-51 — Unapproved kickoff authority

WHEN the sanctioned kickoff writer produces `planApproved:false` and omits the
approval object, THE onboarding classifier SHALL treat persisted PO authority
as absent and continue the valid unapproved design boundary. WHEN approval is
true, contradictory, malformed, or only partially present, THE classifier
SHALL remain fail-closed. The production observer and a process fixture SHALL
cover both paths.

### AC-047-52–60 — Unified close coordinator (#77)

- **AC-047-52 — One close state model:** THE SYSTEM SHALL expose one
  versioned transition table for session checkpoint, feature close, tracked
  close finalization, candidate freeze, final Verify, optional publication,
  exact readback, cleanup, local/delivered terminal state, and later
  release/promotion.
- **AC-047-53 — Checkpoint separation:** WHEN unfinished work is checkpointed
  or a session ends, THE SYSTEM SHALL preserve the active feature and SHALL
  NOT require commit, feature completion, publication, or cleanup beyond the
  exact session-owned resources selected by the checkpoint.
- **AC-047-54 — Freeze ordering:** WHEN a feature is completed, every tracked
  Result, backlog, handover, history, telemetry, retrospective and close-State
  mutation SHALL occur before the single final candidate commit/tree is frozen.
- **AC-047-55 — Exact final Verify:** WHEN the candidate is frozen, final
  Verify/Security SHALL bind that exact immutable commit/tree. Any later
  tracked mutation invalidates the verified phase and blocks publication.
- **AC-047-56 — Optional publication:** WHEN publication is absent,
  unconfigured, or not authorized, THE coordinator SHALL terminate as
  `closed-local` without a remote effect; `final-verify-green` is the durable
  ready-to-publish posture before that local terminal. WHEN publication is
  authorized, it SHALL push at most the exact verified candidate and require
  matching fetch/readback before `delivered`.
- **AC-047-57 — Independent human gates:** Implementation, commit,
  publication, merge, release and promotion authorizations SHALL remain
  distinct and SHALL NOT be inferred from session end or another transition.
- **AC-047-58 — Cleanup ordering:** Cleanup SHALL release only exact
  session-owned resources and SHALL NOT mutate the tracked candidate after
  final Verify or delivery. Cleanup uncertainty is typed and cannot fabricate
  a delivered or closed terminal.
- **AC-047-59 — Restart-safe idempotency:** Interrupted or repeated
  checkpoint, close, Verify, publication, readback and cleanup operations SHALL
  resume from the last durable phase and SHALL create at most one final
  candidate commit and one publication per authorized channel.
- **AC-047-60 — Unified UX and fixtures:** `close-feature`, `close-block`,
  Stop-hook guidance, session-close checklist, publication journal and session
  cleanup SHALL consume the same transition order. Process fixtures SHALL
  cover unfinished checkpoint, local-only close, commit/no-push, authorized
  delivery, push failure, readback mismatch, post-Verify mutation,
  interruption, replay and optional release/promotion.

### AC-047-61–68 — Model-free Advisor preflight and on-demand consultation (#80)

- **AC-047-61 — Versioned authority split:** THE SYSTEM SHALL retain the
  frozen `pipeline.runner-profiles.v3` route/fallback meaning and SHALL add a
  closed versioned lifecycle authority rather than reinterpret V3 in place.
- **AC-047-62 — Zero-model bootstrap:** WHEN Epic or Feature bootstrap,
  restart, resume, re-entry or Compact observes Advisor capability, THE SYSTEM
  SHALL launch zero Advisor children, make zero model requests, export no
  question, create no consultation receipt and consume zero consultation
  budget. Mini or declined consent SHALL be disabled before those effects.
- **AC-047-63 — Honest bounded capability:** THE model-free preflight SHALL
  report exactly `available|degraded|unavailable|disabled|unknown`, explicit
  assurance and primary/fallback disposition bound to both lifecycle-policy
  and V3 route digests. A configured but unprobed route SHALL be `unknown`.
- **AC-047-64 — Concrete demand gate:** WHEN consultation is requested, THE
  SYSTEM SHALL require exactly one concrete question, one allowlisted reason,
  and one canonical bounded evidence bundle derived from 1–32 sorted, unique,
  repository-relative physical regular UTF-8 files (maximum 262,144 bytes
  each and 1,048,576 bytes total). THE SYSTEM SHALL bind every evidence path,
  byte length, content digest and content plus the canonical bundle digest to
  the closed demand's runner, profile, dispatch candidate, lifecycle policy
  and V3 route before any child or model effect. Caller-asserted digest,
  symlink/path escape, malformed UTF-8, duplicate/unsorted path, content drift,
  missing bundle or transport-selection mismatch SHALL fail closed.
- **AC-047-65 — Closed non-triggers:** Session start, profile selection,
  restart, resume, re-entry, Compact, unchanged handover, configured route and
  consent alone SHALL NOT create a consultation demand or invoke an adapter.
- **AC-047-66 — Reuse and drift:** WHEN a prior consultation record has the
  same reuse-key digest, THE SYSTEM SHALL make no repeat model request. A
  changed question, reason, evidence, candidate or route-policy digest SHALL
  invalidate reuse and require a new demand.
- **AC-047-67 — Runner-neutral semantics:** Claude and Codex SHALL share the
  same demand/non-trigger/reuse semantics while retaining their registered
  same-runner adapters, isolation, consent and sanitized evidence contracts.
  Only an actual Codex consultation MAY consume the AC-047-24 budgets.
- **AC-047-68 — Process evidence:** Unit, contract and process fixtures SHALL
  prove zero model effects for bootstrap/resume/re-entry/Compact, fail-closed
  demand mismatch, no-repeat reuse, material-drift invalidation, and one
  valid demand reaching each runner-specific route without making capability
  state a consultation or readiness claim.

## 0A. Historical narrowed candidate truth — 2026-07-29

This section records the earlier narrowed scope and is superseded by section 0.
It remains as historical design/audit context so the prior deferral is not
silently erased.

The implementation baseline is commit
`0f36072f5250708e59d200ef802bdfdba92adccf`, tree
`f77f533b94180bf9a7f77a4c046db5b96fa9fd86`, on
`hotfix/issue-73`. Against `origin/main`
`9d1b3dc108eb77629ace5b82002120f5539abd8d`, that baseline is
26 commits ahead and zero behind. Candidate
`0e6d9cdd4089620cc783d87c947e00e026379b28` is a reachable
intermediate ancestor, not the current audit target.

`0f36072` has green Full Verify and blocking Security evidence. The
independent high-risk Critic then identified seven correction-delta gaps:
persisted authority was not compared to coherent current documents; override
path/audit/plugin identity was incomplete; composite crash recovery could
retain an unreclaimable lock or adopt an unbound same-shape State; operational
Pipeline State was present in the candidate range; and deferred work had no
owner/expiry. These corrections and their focused tests are composed in one
local publishable candidate whose tree excludes operational Pipeline State.
Per explicit PO instruction, only focused delta tests and a diff-bounded
Critic are rerun; another full suite is not required.

The source and focused tests establish the following disposition of the
original acceptance criteria:

| Original AC | Candidate disposition |
| --- | --- |
| AC-047-01–02 | Removed from this hotfix and deferred: no backlog admission transaction is present. |
| AC-047-03–08 | Removed from this hotfix and deferred: no `plan-source-recovery`, `plan-manifest-repair`, or `apply-manifest-repair` surface is present. |
| AC-047-09–12 | Retained and implemented: closed cross-platform command grammar and typed lifecycle-guard denials. |
| AC-047-13–15 | Retained and implemented: trusted Windows executable, private restart-state assurance, and distinct restart diagnostics. |
| AC-047-16–23 | Removed from this hotfix and deferred: no WSL IPC compatibility controller/profile transaction is present. |
| AC-047-24 | Removed from this hotfix and deferred: the installed route intentionally remains at 60,000/45,000 ms. |
| AC-047-25 | Retained and satisfied by path/history audit: no Nova/PR #64 state, evidence, or unrelated implementation was integrated. |
| AC-047-26 | Retained release gate and currently open: all final evidence must be regenerated after AC-047-30–34 and the documentation authority transition. |
| AC-047-27 | Retained and implemented: exact legacy continuity adoption and normal close gate. |
| AC-047-28 | Retained and implemented for its narrow stale-marker shape, including rollback, identity, replay, and same-bytes inode replacement defenses. |
| AC-047-29 | Retained and implemented: exact writer-shaped closed/design re-entry and cleanup handling. |

Current-worktree host-authorized focused readback on 2026-07-29 produced:

- `pipeline-state.test.mjs`: 278/278;
- `project-onboarding-v3.test.mjs`: 43/43;
- `onboarding-continuity.test.mjs`: 73/73;
- `session-cleanup-binding.test.mjs`: 25/25;
- `human-guard-override.test.mjs`: 11/11;
- `codex-pretool-guard.test.mjs`: 16/16;
- `guard-lifecycle-ready.test.mjs`: 21/21; and
- `guard-push.test.mjs`: 100/100.

The Git-spawning suites require the documented host-authorized boundary; their
workspace-sandbox `EPERM` observations are not product failures. These focused
results are design/audit evidence. The existing `0f36072` Full Verify and
Security results remain the full-run baseline; post-Critic changes require
focused regressions, diff-Critic, packaging, and installed readback.

Two later read-only consumer bootstrap observations exposed one remaining
closed-path defect in the neutral authority decision. A Phoenix-shaped
consumer has coherent current PRD/Spec bytes while Continuity binds an older
document generation. A Nova-shaped consumer has four independently drifted
surfaces: the current PRD marker, persisted PO-gate authority, Continuity
authority, and current PRD/Spec bytes. Both fail before a plan with
`PO-DECISION-PRIOR-AUTHORITY`, leaving V4 `partial` with `nextAction:null`.
The Human override correctly refuses this State/authority path; the repair
belongs in the typed neutral planner and confirmed State writer.

The approved implementation is now present in the source worktree. Independent
focused readback passed 296/296 State-writer cases and 43/43 V4 onboarding
cases; both changed-file syntax checks and `git diff --check` passed. These are
focused correction-delta results, not a replacement or rerun of the retained
`0f36072` Full Verify/Security baseline.

### 0.1 Historical deferred-work register (fully superseded)

| Formerly deferred acceptance criteria | Current disposition |
| --- | --- |
| AC-047-01–02 | Activated in 0.4.7 by the final expanded authority; H1 is required. |
| AC-047-03–08 | Activated in 0.4.7 by the final expanded authority; H3 is required. |
| AC-047-16–23 | Activated in 0.4.7 by the final expanded authority; H4 is required. |
| AC-047-24 | Activated with Issue #80; H6 is required and its budgets are consultation-only. |

All earlier deferrals are historical provenance and grant no omission from
this candidate.

### AC-047-30–34 — Candidate-preserving PO authority decision

- **AC-047-30 — Closed V4 action:** WHEN `bootstrap`, `session`, or `dispatch`
  detects either repairable PRD/Spec document divergence or internally
  matching PRD/Spec bytes whose State/Continuity bindings are stale, and the
  narrow automatic rebind planner cannot select an exact stale-marker
  transition, THE SYSTEM SHALL return exactly one schema-valid read-only plan
  action instead of `partial` with `nextAction:null`.
- **AC-047-31 — Neutral candidate plan:** WHEN that planner runs, THE SYSTEM
  SHALL list both document candidates with their in-root path, document role,
  provenance, current SHA-256, and the State/Continuity binding that references
  them, and SHALL NOT decide which candidate is authoritative.
- **AC-047-32 — Confirmed bound apply:** WHEN the PO selects one candidate,
  THE SYSTEM SHALL expose one typed apply action bound to the exact plan and
  selection digest, marked `mutation:true` and
  `requiresConfirmation:true`, and SHALL apply only after explicit PO
  confirmation through the sanctioned lifecycle/State writer. Successful
  apply SHALL set the active feature phase to `design`, preserve the
  continuity payload, update its authority and revision, and avoid rewriting
  a PRD whose current bytes already contain the selected Spec digest.
- **AC-047-33 — Drift, replay, preservation:** WHEN PRD, Spec, State,
  Continuity, plan, selection, path identity, permissions, or DACL assurance
  drifts, or a wrong/reused digest is supplied, THE SYSTEM SHALL fail closed
  without partial authority change. Apply SHALL preserve both document
  versions, be idempotent for the identical completed selection, and return a
  precise typed ambiguity error when a safe two-candidate plan cannot be
  formed.
- **AC-047-34 — Intent regression:** WHEN an unchanged authority is inspected,
  `bootstrap`, `session`, and `dispatch` SHALL remain `ready`; WHEN a
  repairable divergence is present, all three intents SHALL expose the same
  candidate-preserving decision contract; and WHEN confirmed apply succeeds,
  all three SHALL return `ready` with the active feature in `design`.

AC-047-30–34 are implemented in the current worktree by the neutral
`pipeline.po-authority-decision-plan.v1` planner plus separately bound
selection/apply commands. The narrow
`pipeline.po-authority-rebind-plan.v1` action remains unchanged for its exact
stale-marker shape and is not widened into an implicit document choice.

### AC-047-35–38 — Composite lost-binding and orphan recovery

- **AC-047-35 — Complete composite plan:** WHEN portable Continuity binds a
  missing cleanup descriptor, no closure can be authenticated, and all other
  active private descriptors are exactly retirable, THE SYSTEM SHALL return
  one `retire-orphans-release-lost-binding` plan. Its digest SHALL bind the
  physical root, loaded writer identity, State digest/revision, lost binding,
  closure observation, expected binding status, the sorted complete
  descriptor/digest/owner/retirement set, and the deterministic sanctioned
  State-release postimage digest.
- **AC-047-36 — Ordered confirmed apply:** WHEN the Human confirms the exact
  plan, THE SYSTEM SHALL reobserve every preimage before mutation, load and
  retire only the exact still-retirable descriptors without disclosing owner
  nonces, prove the active set empty, prove portable State unchanged, release
  the exact lost binding through the sanctioned CAS writer, and read back
  `sessionCleanup:null` with exactly one revision increment.
- **AC-047-37 — Crash and replay:** WHEN execution stops before retirement,
  after retirement but before State release, or after State release, THE
  SYSTEM SHALL respectively preserve the original state, converge through the
  existing lost-binding release path, or recognize only the exact
  journal-bound State postimage. The plan-bound process-owner lock SHALL be
  rejected while its owner is live and reclaimable only after that owner is
  provably dead. Identical replay SHALL be idempotent.
- **AC-047-38 — Closed guard lane:** WHEN lifecycle readiness is blocked by
  this exact recovery, the guard SHALL admit only `status`, `plan-recovery`,
  and the planner-returned exact `apply-recovery --repo <root>
  --plan-sha256 <digest> --activate` grammar. Live or unobservable owners,
  cleanup manifests, descriptor-set drift, State drift, unsafe files, links,
  permissions, or DACL assurance SHALL remain fail-closed.

### AC-047-39–40 — Portable publication baseline

- **AC-047-39 — No machine-local handle at delivery:** WHEN close, handover,
  push, or publication readiness is evaluated, THE SYSTEM SHALL reject a
  candidate whose portable Continuity has non-null
  `runtime.sessionCleanup`. Only the sanctioned writer may clear it; private
  `.git/agent-pipeline` material is never published.
- **AC-047-40 — Real-origin clean readback:** WHEN a push is separately
  authorized, THE release evidence SHALL clone the published branch from the
  real HTTPS GitHub origin into an empty sibling directory and prove exact
  HEAD/branch/upstream/origin, a clean non-nested worktree, no inherited
  private descriptors, successful full bootstrap, and a still-clean checkout.

### AC-047-41–47 — Attended one-action guard override

The normative threat analysis for this capability is
`docs/human-guard-override-threat-model.md`.

- **AC-047-41 — Denial-bound request:** WHEN an eligible guard denial occurs,
  THE adapter SHALL expose a sanitized request digest and one read-only plan
  action bound to the exact physical repository, canonical tool name/input
  digest, complete denial set, current HEAD/tree/index/worktree and lifecycle
  preimage, and loaded plugin/writer identity.
- **AC-047-42 — Explicit Human authorization:** WHEN the Human explicitly
  confirms that plan and supplies a non-empty reason, THE SYSTEM SHALL create
  one owner-private, expiring capability through an exact
  `--plan-sha256 ... --reason-sha256 ... --activate` action. Merely asking an
  agent to retry or setting an environment variable SHALL grant no authority.
- **AC-047-43 — Exact one-time consumption:** WHEN the next tool call exactly
  matches the capability and all bound preimages remain unchanged, THE central
  adapter SHALL atomically consume it before allowing the action. Replay,
  parallel double-consumption, expiry, input drift, denial drift, repository
  drift, plugin drift, or ambiguous outcome SHALL deny.
- **AC-047-44 — Tamper-evident private audit:** Authorization, consumption,
  rejection, and expiry SHALL append sanitized records to an owner-private
  keyed hash chain below the physical Git common directory. Verification SHALL
  fail closed on a missing key, broken sequence, invalid MAC, a deleted
  ledger/head pair, a capability without its matching authorization event,
  unsafe path, symlink/hardlink, weak POSIX mode, or insufficient
  native-Windows DACL.
  Raw tool input, secrets, owner nonces, and private paths SHALL not enter the
  portable repository or audit projection.
- **AC-047-45 — Non-overridable invariants:** No override SHALL authorize
  paths outside the physical repository, direct edits of Pipeline State,
  Continuity, Runtime projection or private descriptors, descriptor deletion,
  owner-nonce disclosure, credential/secret paths, plugin installation/source
  replacement, any Git invocation (including aliases), push, tag, merge,
  release, or an unparseable/operator-ambiguous command. Every in-root path
  SHALL be checked through its existing physical ancestors, not only by
  lexical containment.
- **AC-047-46 — Central and narrow integration:** Bash, `apply_patch`, Edit,
  and Write SHALL use the same capability verifier after all guards have
  produced their normal denial. Existing guard semantics remain unchanged
  without a valid capability; the legacy free-form Git override SHALL not
  bypass this contract.
- **AC-047-47 — End-to-end evidence:** Linux/WSL, macOS semantics, and native
  Windows/DACL tests SHALL cover plan, authorize, consume, replay, expiry,
  concurrent consume, tampered audit/key/capability, State and path drift,
  protected non-overridable actions, adapter failure, and an attended smoke
  from initial denial through successful exact action and subsequent denial.

### AC-047-48–50 — Multi-generation PO authority recovery

- **AC-047-48 — Structurally valid historical surfaces:** WHEN the current
  regular in-root PRD and Spec are readable but the PRD marker, persisted
  `planApproval.poGateAuthority`, and `continuity.authority` represent two or
  more distinct document/profile generations, THE neutral decision planner
  SHALL accept each historical authority surface only if its schema, exact
  canonical PRD/Spec paths, lowercase SHA-256 values, and required provenance
  fields are structurally valid. Historical digests and PO-profile provenance
  SHALL NOT be required to equal the current document bytes or current
  profile. The current PO profile and current documents SHALL still pass their
  independent full validation before a plan is available.
- **AC-047-49 — Complete neutral disclosure:** WHEN those independently valid
  surfaces differ, THE SYSTEM SHALL return the same read-only,
  candidate-preserving decision contract rather than
  `PO-DECISION-PRIOR-AUTHORITY` or `nextAction:null`. The plan digest SHALL
  bind and disclose the current PRD marker and documents, persisted PO-gate
  authority, Continuity authority, and both historical and current
  PO-profile provenance. It SHALL make no authority choice. A malformed
  schema, non-canonical path, invalid digest, unsafe file, unavailable current
  profile, or invalid Continuity SHALL remain a typed zero-mutation refusal.
- **AC-047-50 — Confirmed convergence and regression shapes:** WHEN the PO
  selects the current Spec and confirms the exact plan/selection-bound apply,
  THE sanctioned writer SHALL reobserve every preimage, converge the PRD
  marker, PO-gate authority and Continuity authority to the current PRD/Spec
  bytes and current PO profile, increment Continuity exactly once, preserve
  its unrelated payload, return the active feature to `design`, and make all
  three V4 intents `ready`. Replay or any drift SHALL fail closed or return
  only the exact idempotent completed result. Focused fixtures SHALL cover a
  Phoenix-shaped state with coherent current documents and older Continuity,
  and a Nova-shaped state where marker, PO gate, Continuity and current
  documents are independently drifted. Human Guard Override SHALL remain
  unavailable for every authority, State, Runtime and Continuity operation.

## 0.1 Current implementation map

This table is the current code-to-contract map. “Implemented” means present in
the corrective diff and covered by the listed focused suites; it is not a
release, packaging, installation or platform-evidence claim.

| Slice | Acceptance | Current production surfaces | Current status |
| --- | --- | --- | --- |
| `047-ARB` | AC-047-30–34 | `plugins/pipeline-core/lib/project-onboarding-v3.mjs`, `plugins/pipeline-core/scripts/pipeline-state.mjs`, lifecycle guard | Implemented; neutral plan/selection/apply, coherent-document/stale-State recovery, design re-entry and all three intents covered |
| `047-CLR` | AC-047-35–37 | `plugins/pipeline-core/lib/session-cleanup-recovery.mjs`, `plugins/pipeline-core/scripts/session-cleanup.mjs` | Implemented; composite plan/apply, journal, crash replay and drift checks covered |
| `047-CLG` | AC-047-38 | lifecycle and outer Codex guards | Implemented; only exact status/plan/returned apply grammar admitted while non-ready |
| `047-ORG` | AC-047-39–40 | `plugins/pipeline-core/hooks/guard-push.mjs` | AC-047-39 implemented and covered; AC-047-40 remains the post-push real-origin readback gate |
| `047-HOV` | AC-047-41–47 | `plugins/pipeline-core/lib/human-guard-override.mjs`, `plugins/pipeline-core/scripts/guard-human-override.mjs`, central Codex guard adapter | Implemented; plan/authorize/single consume, authenticated private audit, exclusions and platform-assurance fixtures covered |
| `047-ARB-MG` | AC-047-48–50 | `plugins/pipeline-core/scripts/pipeline-state.mjs`, authority-decision fixtures and V4 lifecycle readback | Implemented; historical surfaces are structurally validated, current profile/documents remain strict, Phoenix/Nova convergence and negative fixtures pass |
| `047-BLG` | AC-047-01–02 | canonical backlog event/projection writer and checker | Implemented; exact initial event, projection CAS, rollback/replay and focused checker readback covered |
| `047-SMR` | AC-047-03–08 | V4 source diagnosis, absent-manifest planner/apply and lifecycle guard | Implemented; closed source categories, absent-only publication, race rollback and ready readback covered |
| `047-IPC` | AC-047-16–23 | typed sandbox failure, fixed probe, profile transaction and session controller | Implemented; unit/process coverage is green and the pre-install native WSL standard probe is current; confirmed apply and post-install paired native evidence remain Human-gated |
| `047-KOF` | AC-047-51 | V4 onboarding authority classifier | Implemented; unapproved kickoff remains a valid design boundary while contradictory approval fails closed |
| `047-CLO` | AC-047-52–60 | private close coordinator, State bridge, Stop guidance and compatibility skills | Implemented; local/delivery process fixtures, replay, drift, cleanup uncertainty, readback and separate release/promotion gates are green |
| `047-ADV` | AC-047-24, AC-047-61–68 | V2 Advisor lifecycle, model-free preflight, demand/reuse coordinator and skills | In progress; zero-model bootstrap and demand-only runner contracts are implemented, focused evidence remains to be finalized |
| `047-INT` | AC-047-26 | Verify registration, threat model, package/version/readback evidence | Verify registration and threat model present; immutable-candidate Verify/Security/Critic/package/install evidence remains open |

The attended override threat model is
`docs/human-guard-override-threat-model.md`. It is part of the implementation
contract for AC-047-41–47 and will become a checked documentation link when
the new file is staged with the implementation candidate.

## 0.2 Historical candidate audit baseline — 2026-07-28 (non-normative)

The audited candidate is `af71c2e18226da8527c94a359fbd343500c6d5b0` on
`hotfix/issue-73`, observed 15 commits ahead of and zero commits behind
`origin/main` at the declared base. This baseline records implementation state;
it is not a plan approval, release claim, or authorization to dispatch.

- `047-LCY` is present with focused host evidence. Its first independent
  Critic round failed for missing persisted-State postimage validation and a
  rollback path; the follow-up adds both. That follow-up still requires a fresh
  candidate-bound Critic review and all applicable candidate gates.
- At that historical baseline, H3 and H4 remained planned work: that tree did
  not yet expose the
  specified `plan-source-recovery`, `plan-manifest-repair`,
  `apply-manifest-repair`, or WSL IPC compatibility controller surfaces.
- The later H5 close coordinator was not yet present. The separate H6 Advisor
  proposal had not been accepted at that historical baseline; it was
  subsequently activated through Issue #80 and section 0.

This subsection and the detailed historical design below are retained as
provenance. They do not override the dispositions in section 0. In particular,
AC-047-01–68, including AC-047-24, are now current release requirements. No
focused evidence may be reused as
immutable-candidate, release, platform, or approval evidence after any
candidate byte changes.

## 1. Invariants

The implementation must preserve these release-wide invariants:

1. `pipeline.user.yaml` remains authoritative; generated projections are never
   hand-edited or guessed.
2. Read-only planning is deterministic and causes no write.
3. Every durable or persistent-state writer is exact-target,
   explicit-confirmation, digest-bound, drift-detecting, recoverable, and
   followed by readback.
4. V4 readiness remains fail-closed.
5. The lifecycle guard admits only behavior proven by its parsed command
   structure; raw substring tests cannot grant or deny authority.
6. Windows support relies on native identity and access-control evidence, not
   synthetic POSIX mode bits.
7. A compatibility profile may narrow a known host incompatibility but cannot
   become a general privilege escalation.
8. Reference commits from Nova are read-only design/patch inputs. Their state,
   evidence, history, and unrelated implementation never enter the hotfix.
9. A model-free diagnostic may create only its declared nonce-bound temporary
   resources, must prove canary preservation and complete cleanup, and may
   never turn temporary-resource creation into a durable-state success claim.
10. Runtime routing consumes a closed structured failure projection, never
    human log text. Troubleshooting logs are bounded, owner-private,
    machine-local, sanitized, and cannot become activation authority.
11. A legacy continuity authority can change only through a dedicated
    exact-preimage transition. Generic CAS, ordinary feature replacement, and
    manual State editing remain unable to adopt a Result or rewrite PRD
    authority.
12. A published portable baseline cannot bind a machine-local cleanup
    descriptor.
13. A Human guard override is denial-bound, expiring, one-use and
    tamper-evident; it never authorizes protected invariants or disables a
    guard.
14. Historical PO-gate and Continuity authority may be independently stale,
    but only a neutral plan plus an explicitly confirmed digest-bound writer
    may converge them; structural validation is never relaxed for current
    documents, paths, profiles, State or Continuity.
15. Bootstrap Advisor capability observation is model-free and cannot create
    a consultation demand, child, model request, export, receipt or timeout
    spend. Actual consultation requires a current V2 demand.

## Historical acceptance-criterion definitions (EARS)

These original definitions preserve identifier history. Their current
normative disposition is the table in section 0: AC-047-01–68, including
AC-047-24, are required for 0.4.7.

- **AC-047-01 — Backlog admission:** WHEN the canonical backlog checker reads
  the 0.4.7 candidate, THE SYSTEM SHALL find exactly one valid initial
  `null -> open` event for `pipeline.managed-onboarding-success-contract` and
  SHALL keep the item status `open`.
- **AC-047-02 — Backlog transaction:** WHEN the missing-event writer observes
  any item, status, digest, ledger-head, or additional-finding drift, THE SYSTEM
  SHALL refuse the repair without a partial ledger/projection change.
- **AC-047-03 — Source recovery:** WHEN V4 reports `source_invalid`, THE SYSTEM
  SHALL return the exact read-only source-recovery planner and that planner
  SHALL end in one sanctioned workflow or a typed terminal disposition.
- **AC-047-04 — Manifest recovery:** WHEN a current Codex-selected V3 source
  has no generated manifest, THE SYSTEM SHALL offer a deterministic
  absent-manifest plan and an explicitly confirmed digest-bound apply action.
- **AC-047-05 — Existing manifest preservation:** WHEN any manifest target
  already exists, THE SYSTEM SHALL return a typed unrepairable disposition and
  SHALL preserve the target's bytes and identity.
- **AC-047-06 — Publication race:** WHEN source, target, parent, or publication
  identity drifts during manifest apply, THE SYSTEM SHALL reject success and
  SHALL remove/quarantine only the exact writer-owned generated inode.
- **AC-047-07 — Recovery readback:** WHEN manifest apply completes, THE SYSTEM
  SHALL report success only after a fresh V4 inspection accepts the resulting
  state.
- **AC-047-08 — Pre-ready authority:** WHILE V4 is not ready, THE SYSTEM SHALL
  admit only the exact shipped recovery planners, exact V3 authority validator,
  exact digest-bound manifest writer, and pre-existing sanctioned lifecycle
  commands.
- **AC-047-09 — Windows token fidelity:** WHEN the guard parses a native Windows
  command, THE SYSTEM SHALL preserve single backslashes, drive/UNC paths,
  quoted spaces, and direct `node.exe` argv values without applying POSIX
  escape semantics.
- **AC-047-10 — Fixed PowerShell read:** WHEN PowerShell requests
  `Get-Content -LiteralPath <exact-loaded-SKILL.md> -Raw`, THE SYSTEM SHALL
  admit that read and SHALL deny aliases, extra paths, missing `-Raw`,
  expressions, chaining, redirection, or write forms.
- **AC-047-11 — Bounded read pipeline:** WHEN a diagnostic has the approved
  `rg ... 2>/dev/null | head ...` or Windows-null-device shape, THE SYSTEM
  SHALL classify it as read-only only after every segment, operator, redirect,
  bound, and path passes its closed validator.
- **AC-047-12 — Unsupported shell syntax:** WHEN command syntax is unsupported
  or a segment/operator/redirect is unapproved, THE SYSTEM SHALL deny it with a
  typed reason and SHALL NOT relabel it as cross-repository mutation solely
  because quoted/raw input contains `<` or `>`.
- **AC-047-13 — Trusted Windows executable:** WHEN native Windows resolves the
  restart executable, THE SYSTEM SHALL admit only a physical digest-bound
  direct `codex.exe` and SHALL reject `.cmd`, `.bat`, wrappers, unsafe links,
  aliases, and shell-mediated launch.
- **AC-047-14 — Private restart state:** WHEN restart state is created or read
  on native Windows, THE SYSTEM SHALL require shared owner-only DACL/owner/
  physical-path/reparse-point assurance; WHEN it runs on POSIX, THE SYSTEM
  SHALL retain exact `0700`/`0600` assurance.
- **AC-047-15 — Restart diagnostics:** WHEN executable binding, private-state
  persistence, barrier, launch-ticket, or readback fails, THE SYSTEM SHALL
  preserve a distinct sanitized phase/code and SHALL NOT misattribute every
  failure to barrier persistence.
- **AC-047-16 — Nested-standard-first Elephant session:** WHEN a new Elephant
  session under WSL starts, THE SYSTEM SHALL route its first eligible real
  nested operation through the Codex standard sandbox regardless of
  platform/version, installed fallback profile, direct-host observations, or
  prior-session evidence.
- **AC-047-17 — Reactive IPC trigger:** WHEN and only when the current session's
  real operation at execution boundary `nested-codex-sandbox` under the native
  standard posture returns either the typed
  `unix_socket_bind_denied` cause or a structurally plausible
  `sandbox_permission_denied_unknown` with OS code `EPERM`, THE SYSTEM SHALL
  preserve that original result and run the fixed model-free compatibility
  verifier without parsing stderr. A direct-host success or failure SHALL NOT
  activate, pre-activate, suppress, or consume this trigger.
- **AC-047-18 — IPC confirmation:** WHEN the verifier runs, THE SYSTEM SHALL
  classify the workaround as confirmed only if workspace temporary-file
  creation succeeds and AF_UNIX listen/bind reproduces a structured
  `local-ipc` + `af-unix-socket` + `EPERM` result; THE SYSTEM SHALL propagate
  that typed cause through every supported adapter and append its sanitized
  lifecycle events to the bounded machine-local session log; unrelated
  `EPERM`, stderr text, unknown errors, or cleanup/canary failure SHALL NOT
  activate the fallback.
- **AC-047-19 — Profile transaction:** WHEN the compatibility profile is not
  installed, THE SYSTEM SHALL require exact preview, explicit approval,
  digest-bound apply, strict Codex config validation, and readback before the
  profile can be selected.
- **AC-047-20 — Session-only fallback:** WHEN the native IPC failure is
  confirmed and an unchanged dormant profile carries an exact prior operator
  approval receipt, THE SYSTEM SHALL automatically select it only for the
  closed eligible operation classes later in the current session and SHALL NOT
  set global defaults or affect a later session.
- **AC-047-21 — Safe retry:** WHEN the triggering operation is proven
  read-only within an eligible general workspace duty, deterministic, and free
  of partial effects, THE SYSTEM MAY retry it once under the validated profile;
  OTHERWISE THE SYSTEM SHALL preserve the original non-success and use the
  profile only for a later eligible operation.
- **AC-047-22 — Automatic non-use after repair:** WHEN a later new Elephant
  session's first eligible nested operation succeeds in the standard sandbox
  because Codex, WSL, or the environment is fixed, THE SYSTEM SHALL not run the
  verifier or select the dormant compatibility profile. No version heuristic,
  direct-host probe, or uninstall is required for that session-level
  retirement.
- **AC-047-23 — Narrow-duty isolation:** WHEN Advisor, readiness, Critic,
  review, validation, or security duties run, THE SYSTEM SHALL use their
  independently required narrow profiles and SHALL NOT inherit the WSL
  compatibility profile.
- **AC-047-24 — Advisor budgets:** WHEN a valid on-demand Codex consultation
  invokes the Advisor, THE SYSTEM SHALL allow one 180,000 ms primary attempt
  and one 90,000 ms fallback attempt while retaining the existing models,
  efforts, isolation, digest checks, maximum attempt count, and non-blocking
  exhaustion result. Bootstrap SHALL consume neither budget.
- **AC-047-25 — Nova exclusion:** WHEN the 0.4.7 candidate diff is audited, THE
  SYSTEM SHALL contain none of PR #64's Nova state, lifecycle, specs, backlog
  evidence, candidate evidence, or unrelated implementation.
- **AC-047-26 — Release evidence:** WHEN 0.4.7 is declared releasable, THE
  SYSTEM SHALL bind focused, native-platform, Full Verify, Security, Critic,
  packaged-plugin, installed-readback, standard-vs-compatible IPC probe,
  version, and downstream-rebase evidence to the same exact candidate commit
  and tree.
- **AC-047-27 — Legacy continuity adoption:** WHEN the exact released
  `codex-onboarding-0.4.5` continuity-adoption preimage is presented with its
  reachable historical PRD, current repository-scoped PO approval, unchanged
  Spec, existing Result, close evidence, and remote-read-back `v0.4.6`
  commit/tree, THE SYSTEM SHALL offer one read-only digest-bound plan and,
  only after explicit confirmation, atomically reconcile the PRD authority,
  bind the Result, and advance the queue to `close`; any drift, broader state,
  missing evidence, replay conflict, or durability ambiguity SHALL fail
  closed without a false zero-mutation or success claim.
- **AC-047-28 — PO authority rebind:** WHEN a regular in-root PRD has a valid
  older `technical-spec-sha256` marker while the current regular in-root Spec
  is newer and `planApproval.poGateAuthority` plus `continuity.authority`
  retain the older PRD/Spec bindings, THE SYSTEM SHALL offer one read-only,
  closed `pipeline.po-authority-rebind-plan.v1` plan that binds the current
  PRD and marker, current Spec, State revision, plan-approval/PO-gate and
  continuity authority, and every file/State preimage. Only an explicit PO
  confirmation of that exact plan SHA-256 may run its complete apply action.
  Apply SHALL atomically rewrite the PRD marker, planApproval and
  poGateAuthority bindings, and continuity PRD/Spec bindings to one matching
  postimage set, then read them back through PO-gate authority, Continuity and
  V4 inspection. Drift, identity/permission/DACL failure, write failure,
  partial durability, mixed postimage, or unauthorized replay SHALL roll back
  completely and fail closed. An interrupted pair of complete postimage bytes
  SHALL also roll back to the journal-bound preimage bytes and require a fresh
  plan; postimage byte equality cannot authenticate path identity after a
  same-bytes inode replacement. The transition SHALL use existing
  cross-platform private-state assurance, reject links/reparse points and
  non-regular files, and SHALL NOT widen generic authority, force-close a
  feature, or permit a manual State repair.
- **AC-047-29 — Closed-feature re-entry:** WHEN the sanctioned State writer
  has completed `close-feature` and removed active Continuity, THE SYSTEM SHALL
  classify that exact closed audit shape as a valid re-entry boundary rather
  than damaged Continuity. After the sanctioned `set-feature` writer selects
  the next feature, its exact unapproved `design` shape without Continuity
  SHALL remain valid while PRD/Spec approval is prepared. Bare inactive State,
  malformed closed audit entries, active non-design shapes, lingering
  approval/Continuity fields, cleanup residue, or invalid close artifacts
  SHALL remain fail-closed. The complete
  `close-feature -> V4 ready -> set-feature -> V4 ready` path SHALL be covered
  by a process-level test without a manual State edit or guard bypass.

## 2. Change boundary

### 2.1 Expected production surfaces

The implementation is expected to modify or add only the following production
families, plus their matching schemas/tests and maintained documentation:

- `backlog/transitions.ndjson`, `backlog/STATUS.md`, `backlog/index.json`;
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`;
- a hook-local command grammar module if extraction is required;
- `plugins/pipeline-core/lib/project-onboarding-v3.mjs`;
- `plugins/pipeline-core/lib/continuity-state.mjs`;
- `plugins/pipeline-core/lib/codex-onboarding-runtime.mjs`;
- shared Windows private-state boundary modules already present under
  `plugins/pipeline-core/lib/`;
- a new WSL IPC compatibility/profile transaction module under
  `plugins/pipeline-core/lib/`;
- a closed sandbox-failure projection and bounded machine-local IPC diagnostic
  log module under `plugins/pipeline-core/lib/`;
- `plugins/pipeline-core/scripts/project-onboarding-v3.mjs`;
- `harness/scripts/pipeline-state.mjs`;
- a new model-free WSL IPC compatibility CLI under
  `plugins/pipeline-core/scripts/`;
- `plugins/pipeline-core/scripts/codex-host-advisor-route.mjs`;
- `plugins/pipeline-core/skills/pipeline-start/SKILL.md`;
- `docs/codex-onboarding-threat-model.md`;
- the Verify registry, release readiness, version, manifests, and changelog at
  the gated release stage; and
- this hotfix's own result/evidence artifacts.

### 2.2 Forbidden transfer surfaces

The implementation must not copy or modify as part of the #63 transfer:

- `.claude/pipeline-state.json`;
- `specs/sprint-nova-epic/**`;
- Nova backlog items, transitions, receipts, or evidence;
- Nova changes to `docs/state.md`;
- Nova worker, supervisor, forge, Antigravity, or runner-capability modules; or
- commit/PR metadata intended to make the hotfix look descended from PR #64.

The pipeline session may update its own sanctioned runtime binding in
`.claude/pipeline-state.json`; that operational change is not #63 candidate
content and must be excluded from the implementation commit.

### 2.3 H0 — Exact legacy continuity adoption

`047-LCY` is the sole implementation slice allowed before the 0.4.7 plan can
become the active State authority. It is still implemented by one fresh
bounded Goldfish dispatch after the PO approves these final PRD/Spec bytes.
No other hotfix slice may start until the old feature is closed and the 0.4.7
feature is set, approved, bound to this Spec, and read back in
`implementation`.

The read-only planner accepts only this complete preimage:

- State schema `pipeline.state.v0`, active feature
  `codex-onboarding-0.4.5`, its exact plan path, phase `implementation`, and
  `planApproved:true`;
- a valid `pipeline.plan-approval.v2` whose physical PRD/Spec paths and hashes
  are `217eff325fffa5d82d5d49f31883c426dca74c42879aaae0a70da87be8e492ae`
  and `5a95aa55b393a88e0d7ab1a8006957fc04d80bcae24399b40f3ffa8e4eb3cf70`;
- continuity schema `pipeline.continuity.v0`, matching feature, revision `3`,
  PRD authority
  `9825ca78a3765dc71ee2793ef9f84f2eaf998bf297086d869be3562d792cdb94`,
  identical Spec authority, `result:null`, package
  `continuity-adoption`, action `review-active-feature`,
  `nextAction:review`, both retry counters zero, and no dispatch, blocker,
  acknowledgement, recovery, decision transaction, or close transition;
- the historical PRD digest at the same path is reachable at
  `7a62a4ef9febba844cf5be8a659177b37c6a5da5`, and the final approved PRD,
  unchanged Spec, and Result are physical regular in-root files;
- Result path
  `specs/2026-07-25-codex-onboarding-0.4.5/result.md` and digest
  `ceed30ddce48d921f2afbbb44d02a3fe5301302ad07fab3f41dfbc149f657b73`;
  and
- annotated release tag `v0.4.6`, local and remote tag-object/readback
  agreement, dereferenced commit
  `9d1b3dc108eb77629ace5b82002120f5539abd8d`, tree
  `282a8b5c5b0581e042985bfb373a66be0eb2d08b`, plus a physical
  hash-bound close-evidence file recording those facts.

The planner returns a closed
`pipeline.continuity-result-adoption-plan.v0` envelope with exact root,
preimage State digest, expected revision, artifact bindings, release
bindings, `planSha256`, and one complete apply action marked
`mutation:true` and `requiresConfirmation:true`. Planning writes nothing.

The apply command requires the same request plus `--plan-sha256` and
`--activate`, recomputes the entire plan, acquires the existing continuity
writer lock, and revalidates every file, Git, remote, and State precondition.
Its pure transition increments the continuity revision once, replaces only
the historical continuity PRD artifact with the already approved current PRD
artifact, binds the existing Result artifact, and changes only
`queueHead.nextAction` from `review` to `close`. Runtime/session cleanup,
Spec, package/action identifiers, counters, resume, capacity, and all null
control fields remain byte-equivalent.

After atomic durable write/readback, descriptor-bound session cleanup writes
its closure receipt and CAS-releases the exact runtime binding, advancing
Continuity once more to revision `5`. The existing
`pipeline.continuity-close.v0` request binds that post-cleanup revision, the
same Result, and close evidence, and the ordinary `close-feature` writer
removes the old active feature and continuity. The normal writers then set
`agent-pipeline-0.4.7-hotfix`, bind the final PRD and Spec hashes, record PO
approval, set phase `implementation`, and read back repository-scoped PO
authority. Neither the adoption transition nor close automatically activates
the new feature.

Tests cover the exact transition and zero-mutation refusal for every changed
precondition: wrong feature/revision/queue/control field, unbound or
unreachable historical PRD, current PRD/Spec/approval mismatch, absent or
changed Result/close evidence, lightweight/wrong/moved tag, local/remote
tag-object or dereferenced commit/tree mismatch, State/HEAD drift between plan
and apply, lock contention, replay and conflicting replay, symlink/non-regular
artifacts, pre-rename failure, post-rename durability ambiguity, and ordinary
CAS remaining `CS-PROTECTED-AUTHORITY`.

## 3. H1 — Canonical backlog admission

### 3.1 Exact event

Append one `pipeline.backlog-transition.v1` event for
`pipeline.managed-onboarding-success-contract`:

- `from: null`;
- `to: open`;
- actor identifies the bounded 0.4.7 missing-initial-ledger repair;
- reason states that the event admits the existing open item and claims no
  implementation or closure;
- evidence binds the exact item path, its SHA-256, and the exact reachable base
  commit used for the repair;
- `sequence` is the next ledger sequence;
- `previousHash` equals the current ledger head; and
- `entryHash` is computed by the canonical transition hash.

The existing Markdown item bytes must remain unchanged.

### 3.2 Writer

Do not append by an unverified freehand write. Extend or reuse the existing
recoverable missing-initial-event transaction so it:

1. accepts only the single checker finding for the target item;
2. verifies exact item identity/status/digest and current ledger head;
3. plans ledger plus deterministic STATUS/index projections;
4. journals all preimages;
5. atomically writes the complete target set;
6. recovers the whole preimage set after any partial failure; and
7. reruns the canonical checker.

### 3.3 Tests

Tests cover exact success, wrong item, wrong status, changed item bytes, changed
ledger head, additional checker findings, partial write failure, journal
recovery, repeated apply, and deterministic projections.

## 4. H2 — Closed guard command grammar

### 4.1 Parser result

Replace `parseSimpleShellWords()` with one closed parser whose result is:

```text
pipeline.guard-command.v1
  dialect
  segments[]
    executable
    argv[]
  operators[]
  redirects[]
    segment
    fd
    direction
    target
  parseStatus
  denialCode
```

The result is internal immutable data; it need not be serialized unless tests
or diagnostics already require serialization.

Supported dialect classes are:

- `posix-simple`;
- `posix-readonly-pipeline`;
- `powershell-fixed-read`; and
- `windows-direct`; and
- `windows-readonly-pipeline`.

The parser is closed. Unsupported syntax returns a typed parse denial and no
partially authoritative argv.

### 4.2 Token semantics

For POSIX input:

- single quotes preserve all enclosed bytes;
- double quotes preserve text and reject unsupported expansion/substitution;
- backslash escaping follows the supported simple-command subset;
- `$PWD` and `${PWD}` may expand only as the existing exact-root token;
- operators are recognized only outside quotes;
- command substitution, process substitution, heredocs, backgrounding,
  grouping, multiline commands, `;`, `&&`, and `||` are unsupported; and
- a redirect-like string inside quotes remains argv data.

For Windows-direct input:

- native `\` path separators are ordinary path bytes;
- quoted spaces stay within the same argv value;
- drive-letter, UNC, and absolute paths retain their original separators;
- `node.exe` is recognized only as the direct trusted runtime executable; and
- POSIX escape rules are not applied to native Windows paths.

For PowerShell, do not implement a general grammar. Recognize only the fixed
bootstrap read:

```text
Get-Content -LiteralPath <exact-loaded-SKILL.md> -Raw
```

The command may use the canonical executable name required by the runtime and
normal PowerShell case-insensitivity. It permits no alias, wildcard, provider
path, expression, variable expansion, additional path, pipeline, redirect,
write flag, encoding transform, or trailing operation.

### 4.3 Bounded diagnostic pipeline

The pipeline grammar is exactly:

```text
<rg-search> [2>/dev/null] | head -n <count>
<rg-search> [2>NUL]      | head.exe -n <count>
```

The POSIX form accepts basenames `rg` and `head`; the Windows form accepts
case-insensitive basenames `rg.exe` and `head.exe`. No other executable or
path-qualified substitute is admitted by this pipeline rule.

`<count>` is one canonical base-10 integer from `1` through `500`, with no
sign, leading zero, suffix, second operand, or alternate spelling. This keeps
the observed `head -n 280` class usable while making output and execution
bounded.

`<rg-search>` has one of two closed forms:

```text
rg[.exe] <search-options>* [--] <pattern> <path>*
rg[.exe] --files <file-options>* [--] <path>*
```

Search-mode boolean options are exactly:

```text
-n --line-number -S --smart-case -i --ignore-case
-s --case-sensitive -F --fixed-strings -w --word-regexp
-x --line-regexp -l --files-with-matches -L --files-without-match
--hidden --no-ignore --no-messages
```

Search-mode value options are exactly:

```text
-A --after-context -B --before-context -C --context
-g --glob -t --type -T --type-not -e --regexp
--max-count --max-depth
```

Each value option consumes exactly one following non-empty argv token.
Context, max-count, and max-depth values are canonical decimal integers in
`0..500`. Glob/type values remain data and cannot begin a shell expression.
`-e/--regexp` supplies the pattern; without it, exactly one positional pattern
is required. After the pattern, every positional token is a read path.

Files mode permits only these boolean/value options:

```text
--hidden --no-ignore --no-messages
-g --glob -t --type -T --type-not --max-depth
```

It has no pattern operand. Every remaining positional token is a read path.

For both modes:

- option bundling, `--option=value`, unknown/duplicate semantic options, and
  options that execute preprocessors or external commands are denied;
- each path is empty (meaning current governed root) or passes the existing
  physical project/cross-repository read policy;
- the only operator is exactly one pipe;
- the only redirect is fd `2`, output direction, to `/dev/null` on POSIX or
  case-insensitive `NUL` on Windows, attached only to the `rg` segment;
- stdout/stderr to any other target, stdin redirection, `tee`, `xargs`,
  mutating commands, control operations, and substitutions are denied; and
- the whole pipeline is read-only only if both segments, every operand, the
  operator, redirect, and path policy pass.

Already supported single-command read-only diagnostics remain governed by
their own existing validators. Expanding this pipeline grammar requires a
reviewed spec change.

### 4.4 Guard verdicts

Add typed denial fields internally and include a stable code in the sanitized
human reason:

- `GUARD-PARSE-UNSUPPORTED`;
- `GUARD-SEGMENT-UNAPPROVED`;
- `GUARD-OPERATOR-UNAPPROVED`;
- `GUARD-REDIRECT-UNAPPROVED`;
- `GUARD-PATH-OUTSIDE-AUTHORITY`;
- `GUARD-CROSS-REPO-MUTATION`; and
- `GUARD-LIFECYCLE-NOT-READY`.

`isForbiddenCrossRepositoryMutation()` consumes the parsed structure. If
parsing fails, it may deny unsupported syntax, but it must not relabel the
failure solely because the raw input contains `<` or `>`.

### 4.5 Guard tests

In addition to existing hostile fixtures, test:

- native Windows single-backslash paths;
- quoted paths containing spaces;
- direct `node.exe`;
- exact PowerShell fixed read and near misses;
- the approved `rg`/`head` pipeline with `/dev/null` and `NUL`;
- redirect-looking text inside single and double quoted JavaScript strings;
- multiple pipes, control operators, multiline input, substitutions, tee,
  xargs, stdout redirects, arbitrary redirect destinations, mutating segments,
  and unbounded or malformed `head` counts; and
- outer `codex-pretool-guard` routing, not only the inner helper.

## 5. H2 — Trusted restart runtime

### 5.1 Executable resolution

`resolveRuntimeExecutable()` becomes platform-explicit and returns a bound
descriptor rather than only a path:

```text
pipeline.codex-runtime-executable.v1
  platform
  requestedName
  physicalPath
  sha256
  resolution
```

On POSIX, preserve the existing direct physical executable behavior.

On native Windows:

1. use a controlled PATH split and case-insensitive `PATHEXT` interpretation;
2. consider only direct `codex.exe`;
3. reject `codex.cmd`, `codex.bat`, generic wrapper names, shell aliases, and
   paths resolved through unsafe links/reparse points;
4. require a physical regular file with the expected trusted path assurance;
5. hash the exact executable bytes; and
6. launch the bound path with an argv array and `shell:false`.

The restart barrier stores the physical path and digest already required by
the lifecycle. Currentness recomputes the same descriptor. Test dependency
injection uses the descriptor selected by the fixture; it never falls back to
the developer host's ambient `codex`.

### 5.2 Private restart state

All restart-state directories and files use one shared assurance adapter:

```text
assurePrivateDirectory(path, platform)
assurePrivateFile(path, platform)
```

On POSIX, directories remain exact `0700` and files exact `0600`, with existing
physical/single-link checks.

On native Windows, directory/file admission requires the shared Windows
private-state implementation:

- current user is the owner;
- owner-only DACL is proven;
- no implicit SYSTEM/Administrators/Everyone exception;
- no reparse point;
- canonical physical path;
- expected file/directory kind; and
- fail-closed `unavailable` when assurance cannot be established.

Apply this to the private root, lock, restart barrier, current readback, ticket
directory, and individual tickets. No component may retain a native-Windows
`mode & 0777 === 0600/0700` success criterion.

### 5.3 Diagnostic phases

Do not catch the entire restart lifecycle under one persistence error. Preserve
sanitized typed phases:

- `runtime-executable-resolution`;
- `runtime-executable-binding`;
- `private-root-assurance`;
- `restart-barrier-persist`;
- `runtime-target-transaction`;
- `launch-ticket-persist`;
- `native-runtime-readback`;
- `restart-barrier-clear`; and
- `post-clear-readback`.

The outer V4 result exposes the phase/code without raw private paths, command
output, environment, or inner stack traces.

## 6. H3 — V4 source and manifest recovery (#63)

### 6.1 Reference patch policy

The following references define prior tested behavior but are not cherry-picked
as commits:

| Reference | Transferable concern |
| --- | --- |
| `7de0ec8` | closed source/manifest planners, exact pre-ready guard entries, CLI and process fixtures |
| `bef69f7` | raw source/target binding, pinned parent, hostile outer-adapter tests, threat model |
| `17da0b2` | absent-target-only policy, atomic no-replace publication, inode-bound quarantine |
| `8701961` | consistent injected runtime executable across lifecycle and fixtures |
| `ddd0d6a` | hermetic host-control fixture dependency injection |

Only current-base-compatible hunks are reimplemented. The hotfix tests must
prove the behavior independently.

### 6.2 Source recovery planner

Add:

```text
project-onboarding-v3.mjs plan-source-recovery
  --root <exact physical root>
```

It returns `pipeline.project-onboarding-source-recovery.v1` with exact keys for
schema, status, root, category, source digest, next action, and diagnostics.

Closed categories:

| Observation | Category | Result |
| --- | --- | --- |
| invalid/unrecognized authority | `invalid-authority` | terminal `unrepairable`; external source owner |
| recognized older V3 projection | `stale-generated-projection` | existing V3 inspect/plan/apply |
| recognized legacy source | `unsupported-source-transition` | existing supported migration or terminal disposition |
| pending transaction hides evidence | `unavailable-evidence` | existing preview-attested recovery |
| source is already current | `current-authority` | rerun V4 and follow controlling action |

The planner never writes or synthesizes source authority. Every returned action
contains the complete executable/argv, mutation, confirmation, schema, and
expected-readback contract.

### 6.3 Manifest repair planner

Add:

```text
project-onboarding-v3.mjs plan-manifest-repair
  --root <exact physical root>
```

It returns `pipeline.project-onboarding-manifest-repair-plan.v1` bound to:

- canonical physical root;
- exact `pipeline.user.yaml` path, raw SHA-256, and byte length;
- sole target `.claude/pipeline.yaml`;
- target status `absent`, absent digest sentinel, and zero byte length;
- generated postimage SHA-256 and byte length;
- preservation mode `absent-target-only`;
- pinned physical target parent identity; and
- canonical `planSha256`.

If the target already exists in any form, including invalid bytes, a link, or
unexpected type, the result is terminal `unrepairable` and the target remains
byte/identity unchanged.

### 6.4 Manifest apply

Add:

```text
project-onboarding-v3.mjs apply-manifest-repair
  --root <exact physical root>
  --plan-sha256 <lowercase 64-hex>
  --activate
```

Apply:

1. requires explicit `--activate`;
2. recomputes and authenticates the exact plan;
3. pins and rechecks root, source bytes, target absence, and parent identity;
4. generates the sole manifest into a private temporary physical file;
5. publishes with atomic no-replace semantics;
6. binds the exact generated inode through publication and durability;
7. if source or parent drift appears after publication, quarantines/removes
   only that exact generated inode and never a raced-in replacement;
8. rejects any target that appears concurrently;
9. performs a fresh V4 inspection; and
10. returns success only from that readback.

No rename-over-existing, check-then-replace, manual YAML copy, broad runtime
write, or inferred success is permitted.

### 6.5 Pre-ready guard admission

Before V4 readiness, admit only:

- exact `plan-source-recovery`;
- exact `plan-manifest-repair`;
- exact digest-bound `apply-manifest-repair`;
- exact Pipeline-shipped
  `v3-bootstrap-authority.mjs --root <exact physical root>`; and
- the pre-existing exact lifecycle commands.

All remain single-command argv shapes. The diagnostic-pipeline allowance from
section 4 does not create a general pre-ready command path.

### 6.6 Recovery verification

Focused tests cover:

- every source-recovery category;
- absent-manifest plan determinism;
- wrong digest, missing confirmation, wrong root, raw-source drift, target
  appearance, parent swap, link/hardlink/reparse cases, durability failure,
  publication race, quarantine ownership, and readback failure;
- repeated inspect/plan causing zero writes;
- hostile guard aliases, flags, argument counts, chaining, redirection,
  substitution, and project-local substitutes;
- outer Codex guard behavior; and
- process fixtures for `ready -> source transition -> diagnose/recover ->
  ready` and `current V3 + absent manifest -> plan/apply/readback -> ready`.

### 6.7 PO authority rebind

Add one repository-owned read-only planner and its digest-bound confirmed
apply action for the narrow stale-PRD-marker case in AC-047-28. The planner is
admitted only after it proves an exact current State/PRD/Spec/approval/
Continuity preimage and returns complete argv, expected postimages, platform
assurance requirements, and a `planSha256`. Apply must re-observe every bound
identity, publish the PRD and State changes as one recoverable transaction,
and perform PO-gate, Continuity, and V4 readback before reporting success.
Fixtures cover the exact Nova preimage, plan, PO-confirmed apply, postimage,
interrupted post/post rollback including same-bytes inode replacement, closed
replay refusal and fresh replanning, preimage drift, each transaction write
failure and full rollback, link/path identity and permission failures,
native-Windows DACL assurance, and read-only planning against the Nova
checkout. No Nova file or stash is an apply target.

### 6.8 Closed-feature re-entry

Continuity classification admits two and only two writer-owned transition
shapes in addition to an active valid Continuity:

1. an inactive State with `planApproved:false`, no active feature, approval or
   Continuity fields, a non-empty structurally valid `closedFeatures` audit,
   and `updatedAt` equal to the final close timestamp; and
2. the subsequent `set-feature` State with one exact
   `{id,planPath,phase:"design"}` active feature, `planApproved:false`, and no
   approval or Continuity fields.

Cleanup observation treats the first as closed/unbound and the second as
active/unbound, so retained descriptors still flow through the existing
typed cleanup-recovery planner. Every inactive lookalike, invalid close
artifact, non-design active transition, orphan Continuity, or retained
approval is still damaged. A process-level fixture executes the real State
writer between two V4 inspections and requires `ready` on both sides.

## 7. H4 — WSL IPC compatibility (#71)

### 7.1 State model

The compatibility controller is driven by the current session's observed native
sandbox events and returns
`pipeline.codex-wsl-ipc-compatibility.v1` with one of:

- `standard`;
- `suspected`;
- `probe-required`;
- `confirmed`;
- `remediation-available`;
- `approval-required`;
- `installed`;
- `validation-required`;
- `session-fallback-active`;
- `not-required`; or
- `unavailable`.

The result binds:

- Codex executable path/digest and version;
- platform/filesystem class;
- effective standard permission-profile/config digest;
- fixed probe version and input digest;
- temp-file observation;
- AF_UNIX observation;
- exact `pipeline.sandbox-failure.v1` projection or absent sentinel;
- machine-local diagnostic-log session/digest reference or absent sentinel;
- installed profile digest or absent sentinel;
- session activation status; and
- next action.

Every new Elephant session begins in `standard`; persisted profile presence
does not imply active fallback. The first eligible real nested operation is
routed through the native standard Codex sandbox. Direct-host observations are
outside this activation boundary and do not consume the nested-standard-first
attempt. The controller does not run an eager probe or select by
platform/version.

Closed operation classes are:

- eligible: `coordinator-workspace`, `implement`, `mechanic`, `deep`, and
  `test_author`, only when their selected baseline is the standard workspace
  sandbox for the exact current workspace roots;
- ineligible: `advisory`, `readiness`, `critic_normal`,
  `critic_high_risk`, `review`, `validation`, `security`, lifecycle
  pre-readiness/recovery, release, and every unknown class.

An eligible class may contain a read-only or mutating command. This operation
property controls retry safety; it does not turn the class into a narrow
read-only duty.

### 7.2 Reactive trigger and model-free verifier

The verifier may start only after the current session observes a structured
failure from a real native standard-sandbox operation in one of two forms:

```text
direct:
  failureCode = unix_socket_bind_denied
  capability = local-ipc
  resourceClass = af-unix-socket
  operation = bind|listen
  osCode = EPERM

plausible-unknown:
  failureCode = sandbox_permission_denied_unknown
  osCode = EPERM
  plausibility = operation-contract-local-ipc

both:
  originLayer = native-standard
  executionBoundary = nested-codex-sandbox
  session = current
```

The direct form may come from an inner adapter that retained the Node/Rust/OS
error properties. The unknown form is eligible only when the invoking
operation contract already declares local IPC as a capability; free-form
stderr cannot establish plausibility. A generic process exit, filesystem
permission error, platform/version match, historical receipt, or string
containing `EPERM` is not a trigger. A structurally identical result observed
at `host-direct` or an unknown execution boundary is also not a trigger.

The verifier is a fixed shipped payload invoked through the same native
standard sandbox
surface the affected duty would use. It has a monotonic total deadline and:

1. creates and removes one fixed-name, nonce-bound temporary regular file
   inside the approved scratch/workspace boundary;
2. creates, binds, closes, and removes one AF_UNIX socket at a bounded path;
3. records typed capability, logical operation, syscall, resource class,
   sanitized location class, and OS error code directly from error properties;
4. proves canary pre/post digests outside the permitted probe paths; and
5. emits no model request, network request, credential read, repository
   mutation, or retained private path.

Classification binds the triggering event and verifier result to the same
session, native sandbox identity, Codex executable/config digest, and probe
version. It is based on a structured child result/exit protocol. Stderr is
diagnostic-only and never determines compatibility.

`confirmed` requires temp-file success plus the exact accepted AF_UNIX
listen/bind `EPERM` incompatibility matching the trigger. Its normalized cause
is `failureCode: unix_socket_bind_denied`, even when the directly observed
runtime syscall label is `listen`. Temp failure, AF_UNIX success,
different/unknown failure, missing child receipt, timeout, changed canary, or
cleanup failure is `unavailable` and does not switch profiles.

The verifier is never invoked when the native operation succeeds or returns a
non-matching failure. This negative path is part of acceptance, so a future
Codex fix automatically leaves the dormant profile unused.

### 7.3 Structured failure propagation and troubleshooting log

Every fixed payload, sandbox process, Codex command, runner adapter, duty
adapter, coordinator, and Elephant-facing action preserves one immutable
`pipeline.sandbox-failure.v1` projection:

```text
schema
failureCode
capability
operation
osCode
syscall
resourceClass
locationClass
runnerClass
adapterTrace[]
originLayer
executionBoundary
permissionPosture
evidenceSource
probeVersion
retryClass
partialEffect
rawDiagnosticsAvailable
```

For the reproduced incompatibility, the normalized values are:

```text
failureCode = unix_socket_bind_denied
capability = local-ipc
operation = listen|bind
osCode = EPERM
syscall = listen|bind
resourceClass = af-unix-socket
locationClass = system-temp
runnerClass = codex
originLayer = native-standard
executionBoundary = nested-codex-sandbox
permissionPosture = standard
evidenceSource = direct|fixed-probe
```

`adapterTrace` is a closed, ordered, duplicate-free list of at most eight safe
adapter-class identifiers. An outer adapter may append its class but cannot
replace a more specific inner cause. Process spawn, command exit, semantic
probe denial, malformed output, timeout, truncation, cleanup, and transport
failure retain distinct failure codes.

Raw messages, absolute paths, usernames, hostnames, environment values,
configuration bytes, profile contents, process identifiers, command payloads,
and stack traces never enter the projection, model-visible diagnostics,
repository evidence, or portable receipts. `rawDiagnosticsAvailable` is only a
boolean; bounded raw stderr may remain in Codex's existing local diagnostics
but is never parsed for routing.

The controller appends sanitized lifecycle events for original failure, probe
start/result, classification, remediation decision, profile validation,
activation, and retirement to:

```text
<effective CODEX_HOME>/log/pipeline-ipc/<session-digest>.jsonl
```

The path is reported only as the symbolic location class above. The directory
and files use owner-private POSIX mode or native-Windows owner/DACL assurance.
One log is bounded to 256 events and 1 MiB; oldest completed session logs are
retained for at most seven days and removed only by the exact Pipeline-owned
retention routine. A full/corrupt/unwritable log returns a typed
`diagnostic_log_unavailable` event to the current result but never changes the
failure classification or activates/deactivates a profile. The router consumes
the in-memory typed projection, not JSONL readback.

Portable candidate evidence may retain only the sanitized probe projection,
event count, schema/probe versions, and SHA-256 of the bounded local log; it
cannot retain the local log itself.

Only a deterministic read-only operation with
`partialEffect: none-observed-and-proven` may receive one policy-declared
automatic retry. No profile apply, activation, writer, or ambiguous child
failure is automatically retried.

### 7.4 Profile transaction

The profile name is `pipeline-wsl-ipc-compat` unless current Codex validation
rejects it, in which case a revised neutral name requires a spec update.

The transaction operates only on the operator-local Codex configuration under
the exact resolved `CODEX_HOME`:

1. `plan-profile` reads and validates current config/profile state;
2. preview shows the exact owned-key addition, preimage digest, postimage
   digest, dangerous-key warning, unchanged-key proof, and the exact strict
   inline-profile sandbox validator;
   when the active configuration omits `default_permissions`, the plan must
   also show the owned materialization `default_permissions = ":workspace"`
   that Codex requires before it accepts a named profile; the probe-bound
   effective standard remains `:workspace`, and the compatibility profile
   must never become the default;
3. apply requires exact plan digest and explicit confirmation;
4. apply preserves unrelated bytes/keys and refuses ambiguous or unsupported
   configuration;
5. atomic write/readback re-reads and digest-checks the actually published
   bytes, loads an exact copy through Codex's strict configuration parser in
   an empty private temporary `CODEX_HOME`, and then loads the published
   profile through a bounded local sandbox no-op; the strict Doctor therefore
   cannot scan the operator's active network, auth, databases, updates,
   app-server or rollout inventory;
6. profile definition is installed but not selected as
   `default_permissions`; an absent default may only be materialized as the
   equivalent standard `:workspace` value; and
7. successful readback publishes an operator-approval receipt bound to the
   profile name, exact config pre/postimage digests, profile digest, dangerous
   key set, approval actor, and approval time; and
8. failure restores the exact preimage or returns typed recovery state.

The custom profile reproduces the standard workspace filesystem permissions
using supported permission-profile primitives and adds only
`network.enabled = true` plus Unix-socket compatibility. Codex requires the
network policy to be enabled before the Unix-socket rule can take effect.
Because the profile defines no domain `allow` entry, `allow_local_binding`,
non-loopback listener, upstream-proxy override, SOCKS widening, credential
path, or additional workspace root, it permits no external destination.

If an earlier Pipeline-owned 0.4.7 candidate installed the exact profile block
without `network.enabled`, the planner may return an `upgrade` only when the
physical private approval receipt exactly binds that legacy block, current
config, Codex executable, effective `:workspace` default, and legacy profile
digest. The new plan binds the prior receipt digest and exact replacement
block. Apply atomically replaces only the Pipeline-owned block and receipt;
failure restores both exact preimages. Any unknown block, missing/drifted
receipt, link, duplicate profile, or non-owned field fails closed as
`recovery-required` or `validation-required`.

The currently documented broad fallback key
`dangerously_allow_all_unix_sockets = true` is permitted only when:

- the fixed probe confirms the incompatibility;
- no narrower supported Unix-socket rule can satisfy the fixed bind probe;
- the preview names the broad local-daemon exposure risk;
- the operator explicitly confirms the exact digest; and
- the profile remains session-selected rather than default.

This key permits the sandboxed command to reach local Unix-socket daemons that
the standard allowlist would block. It does not by itself allow external
network domains. `network.enabled = true` changes the sandbox network policy,
but with no domain allow entries Codex continues to deny every external
destination. The local-daemon exposure remains material and must appear in the
preview, approval receipt, PRD risk, and session activation readback.

### 7.5 Session activation

The model and invoked command cannot select the compatibility profile.
Activation is performed only by the model-free compatibility controller after
the verified trigger. It is bound to:

- current Codex executable/config/probe digests;
- exact triggering native failure receipt;
- installed profile digest and unchanged operator-approval receipt;
- exact project/session identity;
- one of the eligible operation classes from section 7.1; and
- successful fallback validation probe.

If the profile or config has no matching approval receipt, the controller
returns `approval-required`; it does not activate. The operator may then run
the section 7.4 preview/approve/apply/readback transaction. That explicit
approval both installs the dormant profile and authorizes automatic
current-session activation after this exact failure class. A later exact
confirmed failure may activate the unchanged approved profile without a second
prompt.

Once active, the controller selects the named profile for all later eligible
operation classes in that session. It does not rewrite global default
configuration and cannot affect a later session. Unknown or ineligible classes
remain on their independently selected route and cannot fall back.

The originally failed operation is retried automatically only if its operation
contract proves all of:

- read-only;
- deterministic;
- no partial effect observed and proven; and
- one retry maximum under the now-validated profile.

Otherwise the activation applies to the next eligible operation and the
original failure remains an honest non-success.

The ineligible duty classes in section 7.1 always retain their independently
selected narrow profiles. A read-only command inside an eligible general
workspace class is not one of those duties; it may qualify for the single safe
retry above.

Every later Elephant session resets routing to native standard. If its first
eligible nested standard-sandbox operation succeeds after a Codex, WSL,
config, host, or probe-version repair, there is no matching trigger and the
compatibility profile is not used at all in that session. The installed
dormant profile may remain until an explicit separate removal operation, but
it has no active effect. Neither a Codex/WSL version heuristic nor a
direct-host probe may pre-activate or retire it. A deliberate diagnostic may
report `not-required`; ordinary successful nested operation need not run the
verifier merely to produce that state.

### 7.6 Reproduced design baseline

The 2026-07-27 model-free probe on the exact 0.4.6 base observed:

```text
tempFile = success
operation = listen
resourceClass = af-unix-socket
socketStatus = denied
osCode = EPERM
syscall = listen
```

This proves that the observed standard-sandbox failure is local IPC/AF_UNIX,
not a general temporary-file denial. The operator separately confirmed that
the reviewed compatibility profile makes the same script pass. That
confirmation is valid design input but not 0.4.7 release evidence: the
implemented fixed payload must reproduce the standard-profile denial and the
compatible-profile success on the same installed candidate and bind both
structured results to its commit/tree.

The upstream issue calls the failing facility an IPC pipe and shows Node's
direct `listen EPERM` / `createIpcServer` path. Neither that prose nor its
stderr spelling is runtime activation authority.

### 7.7 WSL tests

Tests cover:

- first eligible operation always uses native standard;
- direct-host success/failure never activates, suppresses, or consumes the
  nested-standard trigger;
- native operation success causes no verifier call and no profile selection;
- direct `unix_socket_bind_denied` and structurally plausible local-IPC
  `sandbox_permission_denied_unknown` each trigger exactly one verifier;
- temp success plus reproduced AF_UNIX `EPERM`;
- filesystem or unrelated-phase `EPERM` causes no verifier or fallback;
- temp failure;
- unknown AF_UNIX error;
- stderr text that disagrees with structured result;
- preservation of the inner IPC cause through every supported adapter class;
- exact sanitized JSONL event sequence, owner-private assurance, 256-event /
  1-MiB bounds, seven-day retention, full/corrupt/unwritable-log behavior, and
  proof that log contents never control activation;
- timeout, no child receipt, wrong identity, canary drift, and cleanup failure;
- preview/apply/readback, digest drift, unsupported config, rollback, repeated
  plan/apply, and absence of default activation;
- exact dangerous-key warning and consent;
- activation for later operations in the same session, guarded retry of the
  original read-only/no-partial-effect operation, no retry for ambiguous or
  effectful operations, next-Elephant-session native reset, Codex/config/probe
  drift, successful nested standard operation after a WSL/Codex repair,
  built-in recovery without verifier execution, and `not-required`; and
- narrow-duty non-inheritance.

Native WSL evidence is required. Synthetic Linux tests alone cannot establish
the WSL acceptance cell. The native evidence contains the paired fixed-probe
results under the built-in standard posture and approved compatibility
profile. After profile installation, the standard probe is rerun so both
receipts bind the same post-install config digest, candidate, Codex binary,
probe version, session and workspace class. The standard receipt names
`:workspace` and binds its standard-profile digest; the compatible receipt
names only `pipeline-wsl-ipc-compat` and binds the approved profile digest.
Any profile-name substitution, pre-/post-config mixture or otherwise
unpaired receipt blocks activation.

## 8. H5 — Unified close coordinator (#77)

### 8.1 Canonical state machine

Extend the publication-close journal into the single close coordinator
authority. Its closed phases are:

```text
active
checkpointed
feature-close-prepared
tracked-close-finalized
candidate-frozen
final-verify-green
publication-authorized
published
readback-confirmed
cleanup-complete
closed-local | delivered
release-eligible
promoted
```

`checkpointed` is a resumable non-completion state. `closed-local` and
`delivered` are terminal feature-close states; release and promotion are
separate optional descendants. Each transition binds the prior state digest,
feature/Result/authority identity, exact input and observed postimage, and the
candidate OID/tree when one exists. Unsupported skips and conflicting replays
fail closed.

### 8.2 Tracked mutation and candidate freeze

`feature-close-prepared` owns the exact feature-close intent. Before
`tracked-close-finalized`, the coordinator executes or validates all tracked
Result, backlog, handover, HISTORY, telemetry, retrospective and Pipeline-State
effects. Only then may the project policy authorize one final commit and bind
its exact OID/tree as `candidate-frozen`.

Final Verify and Security consume only that frozen OID/tree. The coordinator
rechecks Git status, OID and tree before advancing to `final-verify-green`.
Any tracked mutation, candidate replacement or evidence drift invalidates the
phase; it never silently creates a second candidate.

### 8.3 Optional publication and readback

Publication is a distinct Human/policy action. With no configured or approved
channel, `final-verify-green` is the durable ready-to-publish posture and a
verified feature may advance through cleanup to `closed-local` without a push.
With authorization, the existing publication
bundle imports at most one receipt per channel and only for the exact verified
OID/tree. `published` is not delivery; `readback-confirmed` requires exact
remote/ref/OID/tree observation before `delivered`.

The coordinator cannot mint authorization. Commit, publication, merge, release
and promotion remain separate typed gates. A push failure or readback mismatch
keeps a resumable non-delivered phase.

### 8.4 Cleanup

Session cleanup runs after the candidate is frozen and may run before or after
optional publication only when it changes no tracked candidate byte. It
consumes the exact cleanup descriptor/handoff already bound by the lifecycle,
records a digest-only private outcome, and advances to `cleanup-complete`.
Uncertain cleanup blocks a clean terminal claim but never rewrites or republishes
the candidate.

The #73 close-time cleanup-release prevention/recovery remains the authority
for continuity-bound descriptor release. H5 orders that transition; it does
not create a second cleanup binding or generic recovery writer.

### 8.5 Compatibility entry points and guidance

- `close-feature` becomes one coordinator transition, not an independent
  completion universe.
- `close-block` remains a compatibility entry point for checkpoint/finalize
  planning but cannot require push and cannot maintain a parallel ritual.
- Stop-hook output derives the exact next transition from coordinator/State and
  becomes silent at the applicable terminal.
- `harness/checklists/session-close.md`, `PIPELINE_FLOW.md`, README and the
  operating model point to the same transition table; the stale
  `v0.1.0-draft` authority is removed or explicitly archived.
- Tool declarations include only operations reachable in the selected
  transition. No prose instruction grants a missing tool capability.

### 8.6 Verification

Unit and process fixtures cover every AC-047-52–60 transition, conflicting
replay, crash recovery, candidate/evidence drift, local-only repositories,
commit-required/no-push policy, exact authorized publication, push failure,
readback mismatch, cleanup uncertainty and optional release/promotion. Existing
State, Stop-hook, publication, cleanup, Verify and Security suites remain
registered and green.

## 9. H6 — Model-free Advisor preflight and on-demand consultation (#80)

### 9.1 Versioned contracts

`pipeline.runner-profiles.v3` remains byte-semantically frozen route authority.
The new `pipeline.advisory-lifecycle-policy.v2` is a separate trigger contract:

- bootstrap mode `capability-preflight-only`;
- consultation mode `on-demand`;
- five closed capability states;
- closed trigger reasons and lifecycle non-trigger events; and
- reuse invalidation over question, reason, evidence, candidate and
  route-policy bindings.

ADR-0047 explicitly supersedes ADR-0038's session-trigger/mandatory-receipt
meaning while retaining its registered Claude/Codex route topology.

### 9.2 Model-free bootstrap

`advisor-capability-preflight.mjs` accepts only runner, profile and consent. It
loads and validates the committed V2 policy and frozen V3 registry, returns one
`pipeline.advisory-capability-preflight.v2`, and has no prompt/model adapter.
Its effects object is closed at zero child launches, model requests, question
exports, receipts and consultation-budget milliseconds.

Absent stronger model-free observation, a configured route is `unknown` with
the assurance that model availability and identity were not probed. Optional
bounded observations map primary/fallback state to available, degraded,
unavailable or unknown without invoking either adapter. Mini and declined
consent are disabled.

`pipeline-start` executes only this preflight. Session start, profile
selection, restart, resume, re-entry, Compact, unchanged handover, configured
route and consent never invoke the legacy-named consultation launcher.

### 9.3 Demand and reuse

`pipeline.advisory-demand.v2` contains no raw question. It binds:

- runner, Epic/Feature profile and one allowlisted reason;
- question and bounded-evidence SHA-256;
- dispatch ID/revision and candidate commit/tree; and
- V2 policy and frozen V3 registry SHA-256.

The derived `reuseKeySha256` covers every material binding. A matching
`pipeline.advisory-consultation-record.v2` returns
`advisory_reused_no_repeat` without adapter invocation. Any changed binding
permits a new consultation. Missing or mismatched demand fails before
workspace observation or a child.

The bounded-evidence SHA-256 is derived from one canonical
`pipeline.advisory-evidence-bundle.v1`; it is never trusted merely because a
caller supplied it. The bundle contains 1–32 lexically sorted, unique,
repository-relative paths resolving to physical regular files beneath the
repository root. Each file is valid UTF-8, at most 262,144 bytes, and the
bundle is at most 1,048,576 bytes. Each entry binds exact path, byte length,
content SHA-256 and content. Symlinks, path escapes, missing/non-regular files,
duplicate or unsorted paths, invalid UTF-8, size overflow, byte/content drift
and supplied-digest mismatch fail before any child or model effect.

### 9.4 Runner adapters and budgets

Only after a valid demand:

- Claude uses the unchanged same-runner V3 order: bounded native Fable, native
  Opus after repeated Fable failure, then one fresh read-only Claude consult;
- Codex uses the registered Host Advisor route with at most two fresh attempts;
- Codex primary remains `consult-advisor`, `gpt-5.6-sol`, `max`, now with one
  monotonic 180,000 ms deadline;
- Codex fallback remains `consult-advisor-fast`, `gpt-5.6-terra`, `high`,
  `forkTurns:none`, with one monotonic 90,000 ms deadline; and
- before/between/after workspace digest, interrupt-once, no-third-attempt,
  same-runner, consent, isolation, sanitized receipt and non-blocking
  exhaustion semantics remain unchanged.

For Codex, the launcher builds the physical bundle and the host bridge and
selected App Server transport independently validate it against the demand and
selected dispatch. The child receives the same bundle and digest only after
those checks, then renders the exact contents into the single model turn with
an explicit untrusted-data boundary. Raw evidence remains runtime-only and is
never persisted in the demand, consultation record or sanitized receipt.

No bootstrap path consumes these budgets.

### 9.5 Verification

Focused fixtures cover both runners' model-free preflight, every state,
disabled routes, malformed contracts, all lifecycle non-triggers, valid demand,
question/policy/evidence/candidate drift, no-repeat reuse, route preservation,
consultation-only 180/90 budgets, physical evidence-bundle construction,
tamper/missing/selection-drift rejection at launcher, bridge and App Server,
exact evidence delivery to the child model turn, and the absence of model
effects before the demand gate.

## 10. Historical AC-047-01–68 integration record (non-normative)

This entire section is retained only as implementation provenance for the
already delivered AC-047-01–68 baseline. It is not current hotfix work.
Sections 10.2–10.3 describe post-release downstream adoption owned by the
respective Sprint and require separate authorization. No Goldfish may use them
to import, copy, rebase, merge, or mutate Sprint work during 0.4.7 completion.

### 10.1 Historical bounded implementation slices

The current hotfix is partitioned into these reviewable slices. Same-file
slices remain serial; the immutable candidate is not formed until every slice
and the final document authority are stable.

| Slice | Exclusive production ownership | Required acceptance before handoff |
| --- | --- | --- |
| `047-LCY` | retained legacy adoption, stale-marker rebind and closed/design re-entry | AC-047-27–29 remain green and unchanged by the new general decision path |
| `047-ARB` | neutral authority planning and State-writer selection/apply | AC-047-30–34; two candidates, three intents, drift/replay/identity negatives green |
| `047-CLR` | composite cleanup planner/apply and private journal | AC-047-35–37; ordered apply plus pre-/mid-/post-crash convergence green |
| `047-CLG` | exact non-ready cleanup and authority command grammar | AC-047-38; no operators, alternate paths or additional arguments admitted |
| `047-ORG` | portable cleanup-binding publication guard | AC-047-39 green; AC-047-40 reserved for separately authorized real-origin readback |
| `047-HOV` | Human override capability, audit store, CLI and central adapter | AC-047-41–47; exact denial through single consumption and protected exclusions green |
| `047-ARB-MG` | multi-generation neutral authority planning and confirmed convergence | AC-047-48–50; Phoenix- and Nova-shaped historical-surface fixtures, drift/replay negatives and three-intent readback green |
| `047-BLG` | canonical missing-initial backlog event and projection transaction | AC-047-01–02; exact open item, ledger CAS, rollback/replay and checker readback green |
| `047-SMR` | source diagnosis, absent-manifest plan/apply and pre-ready guard lane | AC-047-03–08; category matrix, races, hostile aliases and process readback green |
| `047-IPC` | typed reactive WSL IPC verifier, profile transaction and session router | AC-047-16–23; native WSL paired probes, adapter propagation, opt-in apply and next-session reset green |
| `047-KOF` | unapproved kickoff authority classification | AC-047-51; real writer output ready and approved/malformed negative fail-closed |
| `047-CLO` | unified close coordinator, compatibility entry points and process fixtures | AC-047-52–60; checkpoint/local close/delivery/retry/order matrix green |
| `047-ADV` | V2 Advisor lifecycle policy, model-free preflight, demand/reuse coordinator, runner skills and ADR | AC-047-24 and AC-047-61–68; zero-model bootstrap and demand-only route matrix green |
| `047-INT` | Verify registration, threat model, result/evidence, package/version/readback surfaces | AC-047-25–26; every final gate binds one immutable commit/tree |

AC-047-24 is implemented only within `047-ADV`; it never applies to bootstrap.

### 10.2 Post-release Nova adoption (not hotfix implementation)

After 0.4.7 reaches the approved integration commit:

1. Nova rebases from the exact 0.4.7 integration commit;
2. it identifies the old B4R implementation derived from `7de0ec8`,
   `bef69f7`, `17da0b2`, `8701961`, and `ddd0d6a`;
3. it drops duplicate behavior already supplied by 0.4.7;
4. it manually reconciles legitimate Nova changes in overlapping files;
5. it keeps a short historical transfer note for #63; and
6. it reruns Nova's complete candidate gates.

Expected collision paths include:

- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`;
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`;
- `plugins/pipeline-core/hooks/codex-pretool-guard.test.mjs`;
- `plugins/pipeline-core/lib/project-onboarding-v3.mjs`;
- `plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`;
- `plugins/pipeline-core/scripts/project-onboarding-v3.mjs`;
- `plugins/pipeline-core/scripts/project-onboarding-e2e.test.mjs`;
- `plugins/pipeline-core/skills/pipeline-start/SKILL.md`; and
- `docs/codex-onboarding-threat-model.md`.

No automated conflict resolution may choose Nova or hotfix wholesale for those
paths.

### 10.3 Post-release other-Sprint adoption (not hotfix implementation)

For each of the three Sprint branches rebasing onto 0.4.7, produce a
machine-generated changed-path intersection and a human disposition for every
overlap. A successful textual rebase is not acceptance; each Sprint reruns its
own focused and full gates against its new exact candidate.

## 11. Historical AC-047-01–68 verification record

The commands and gates below remain regression inputs for delivered behavior,
but they are not the complete current DoD. The current AC-047-69–135 ownership
and focused commands are in the implementation plan; the integrated immutable
candidate gate is F6 there.

### 11.1 Focused gates

Required focused suites:

- canonical backlog ledger/projection admission and recoverable writer;
- source/manifest recovery planners, confirmed apply, pre-ready guard and
  consumer process fixtures;
- WSL IPC structured failure propagation, fixed probe, profile transaction,
  session routing/retirement and native paired-probe evidence;
- legacy continuity adoption, State writer, normal close-feature, narrow
  stale-marker rebind, neutral authority decision, and multi-generation
  authority-surface recovery;
- composite cleanup plan/apply, crash replay and private-state assurance;
- lifecycle guard and outer Codex pretool guard;
- project onboarding unit and process E2E;
- Codex onboarding runtime and Windows private-state assurance;
- portable push/publication baseline guard;
- attended Human override and authenticated-audit tamper/replay tests; and
- unified close coordinator, compatibility entry points, Stop guidance and
  end-to-end checkpoint/local/delivery/retry fixtures; and
- pipeline-start/preflight contract regressions.

Every new focused suite is registered in the single Verify gate.

### 11.2 Platform gates

Required platform evidence:

- Linux/WSL host lane for authority, cleanup, central guard, publication guard
  and Full Verify;
- macOS semantic fixtures for private files, path identity, atomic
  replace/readback and attended override;
- native Windows non-admin lane using a packaged/installed 0.4.7 candidate,
  direct `codex.exe`, DACL-backed private state, restart persistence and
  attended-override assurance; and
- a clean real-origin clone/readback lane after a separately authorized push,
  proving no private descriptor or portable cleanup binding is inherited.

Issue #72 and native Apple Silicon are not platform gates for this release.

### 11.3 Candidate gates

The exact final candidate commit and tree are reported by Git and package
readback rather than embedded recursively in their own document bytes. They
must carry:

1. all focused suites;
2. fresh Full Verify evidence for the exact final candidate;
3. fresh blocking Security evidence for the exact final candidate;
4. a fresh independent high-risk Critic review of the complete expanded
   candidate against this updated design;
5. packaged Claude and Codex plugin validation;
6. installed-plugin readback;
7. native platform evidence above;
8. version-surface, manifest and changelog consistency;
9. clean repository/readback after candidate evidence is recorded; and
10. after separately authorized publication, the AC-047-40 real-origin clone
    and bootstrap readback.

Any correction byte after final evidence invalidates the affected evidence and
requires a new exact-candidate run. Evidence from PR #64 or any Nova candidate
is inadmissible.

### 11.4 Production rollback and forward-repair boundary

The PO/release owner owns this gate. Its current authorization expires before
any Main publication and no later than 2026-07-30; a later publication requires
a newly reviewed rollback target and fresh authorization.

- Before publication, promotion is withheld. A rejected candidate is removed
  only by an ordinary reviewed revert commit; shared history, tags, evidence,
  Pipeline State and private runtime/configuration files are never rewritten.
- After publication but before any 0.4.7 writer has mutated repository or
  private lifecycle state, the rollback target is the trusted packaged 0.4.6
  plugin. Reinstall that exact package, reload Claude Code plugins or start a
  new Codex session as applicable, and require version/source plus lifecycle
  readback before project work resumes.
- After any 0.4.7 writer or typed recovery has mutated state, downgrade is
  prohibited. Freeze further mutations and ship a forward corrective patch
  from 0.4.7 using only its typed plan/confirmation/apply/recovery contracts;
  never edit continuity, authority, cleanup descriptors, audit, runtime state
  or private configuration manually.
- The H4 compatibility profile is dormant and non-default, so rollback does
  not require deleting it. Removal or legacy-profile replacement requires its
  own typed digest-bound plan and confirmation.
- There is no database migration. Any revert or forward-fix candidate reruns
  all affected focused gates plus fresh exact-candidate Full Verify, blocking
  Security, package validation, installation and lifecycle readback before
  publication.

## 12. Release evidence

Create hotfix-owned result/evidence under this design directory. It records:

- exact base, candidate commit, and candidate tree;
- exact legacy continuity preimage, adoption-plan/apply readback, 0.4.6 close
  evidence, and 0.4.7 plan-activation readback;
- authority-decision plan/selection/apply, composite cleanup crash/replay,
  portable-baseline and attended-override evidence;
- exact #70, #63, #71, #73, kickoff-correction and #77 acceptance mapping;
- explicit #24/#80, #72, PR #64 and downstream-state exclusion;
- focused/platform/Verify/Security/Critic commands and results;
- installed plugin versions and readback;
- version and release surface digests;
- known residual risks; and
- downstream Sprint collision/rebase manifest.

Issue comments, status changes, PR operations, release publication, tag, and
merge remain separately authorized external actions.
