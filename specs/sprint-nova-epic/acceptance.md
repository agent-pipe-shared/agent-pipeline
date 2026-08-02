# Sprint Nova Epic — Acceptance and Evidence Matrix

## Gate model

The Epic has four human-visible gates:

1. **PRD gate:** approve product scope, outcomes, Nova A/B allocation and
   independence boundaries only.
2. **Technical Spec/readiness gate:** approve exact contracts, state machines,
   files, tests, ADR extensions and implementation slices.
3. **Nova A gate:** accept an exact Nova A commit/tree, increment receipt,
   Result, Verify, Security and Critic evidence before Nova B implementation.
4. **Nova B / Epic close gate:** accept the frozen Nova-only candidate,
   platform/runner/forge evidence and all 17 issue dispositions.

No prior gate implies a later gate.

## Global acceptance criteria

| ID | Requirement | Evidence |
| --- | --- | --- |
| NVA-G01 | WHEN base commit, candidate tree, dispatch, attempt, queue revision or authority digest is absent or mismatched, THE SYSTEM SHALL reject admission before execution. | Negative contract fixtures and candidate-bound test receipt. |
| NVA-G02 | WHEN an outcome is unknown, unavailable, stale, invalidated, cancelled, expired, malformed or completed-but-undelivered, THE SYSTEM SHALL NOT project success. | Outcome taxonomy fixtures across local and async adapters. |
| NVA-G03 | WHEN a worker requests delegation, review, approval, merge, release or undeclared authority, THE SYSTEM SHALL reject it. | Closed-schema and confused-deputy fixtures. |
| NVA-G04 | WHEN isolation evidence is absent or weaker than requested, THE SYSTEM SHALL report only the observed assurance and SHALL NOT infer OS isolation from branch, worktree, runner or process names. | Assurance downgrade fixtures and reports. |
| NVA-G05 | WHEN Nova and Cyborg would mutate the same physical workspace or global runtime resource concurrently, implementation SHALL stop until the actual resource is serialized. An identical repository-relative path on independent Sprint branches SHALL be recorded as a later merge collision and SHALL block only the combined integration if the accepted diffs conflict. The completed stable `main` 0.4.7 adoption remains bound to its exact write-set, protected-surface disposition and conflict/readback evidence; every later Nova dispatch still fails closed on an absent or uncertain path/resource classification. | Physical-resource declaration, exact dispatch write-set, protected-surface disposition, collision manifest, exact 0.4.7 adoption receipt and later exact-OID integration receipt. |
| NVA-G06 | WHEN Nova and Cyborg both claim direct reconciliation ownership of one canonical backlog ID, integration SHALL fail closed until one claim is withdrawn or an explicit common owner is approved. | Backlog claim manifests bound to the same ledger head. |
| NVA-G07 | WHEN the backlog ledger head, item body or status differs from the approved intake snapshot, no backlog transition preview SHALL be accepted until the complete intake is regenerated. | Canonical backlog readback and fresh disposition digest. |
| NVA-G08 | WHEN a frozen V3 or v1 authority would need an in-place edit, the slice SHALL stop and propose a versioned companion or explicit ADR. | Diff review and schema compatibility tests. |
| NVA-G09 | WHEN a result is accepted, it SHALL bind the exact package, dispatch, attempt, candidate and result digest; conflicting replay SHALL fail closed. | Replay/duplicate/out-of-order fixtures. |
| NVA-G10 | Every external mutation SHALL resolve the exact target, require confirmation matching its preview, carry an idempotency binding and require matching readback before success. | Forge/credential adapter tests and opt-in observation. |
| NVA-G11 | Every portable metric SHALL preserve unknown usage/cost as unknown and SHALL exclude prompts, secrets, private coordinates and unrestricted output. | Privacy/cardinality tests. |
| NVA-G12 | Epic completion SHALL require all 17 issue acceptance sets and the same frozen Nova-only candidate to pass configured Verify, Security, independent Critic and PO acceptance; unavailable or deferred criteria SHALL remain open unless the PO explicitly changes scope. | Final Result and issue-evidence matrix. |
| NVA-G13 | Before renewed implementation approval, Nova A increment acceptance, immutable final candidate evidence or full Nova readiness approval, the branch SHALL retain the completed adoption of commit `89cb12b99e3fd86ac44878d0c23b278f00538921`, tree `b6537dcaa7bee526d9a393e2603b28648f4b0438`, including its 17-Issue conflict disposition, upstream #63 recovery regressions and regenerated bindings without claiming #63 delivery. Pre-rebase evidence remains provisional and SHALL be invalidated or re-established according to path impact. | Exact previous Nova head/tree, released base identity, resulting head/tree, replay/conflict disposition, impact invalidation, regression readback and regenerated binding/lifecycle digests. |
| NVA-G14 | The standing TP-1-through-TP-5 authorization SHALL apply only to an exact Nova task/write-set, SHALL be audit-recorded, SHALL NOT weaken tests or another guard, and SHALL be fully restored before candidate gates, push/publication and Nova close. | PO authorization record, per-use audit entries, guard readback before each gate and close. |

## Nova A issue acceptance

### `#57` Canonical delivery/status reconciliation

- NVA-A57-1: One versioned record binds backlog item, accepted Spec digest,
  Sprint/increment, base/candidate, delivery evidence and required gates.
- NVA-A57-2: Assignment and closure use only authorized append-only
  transitions through the sanctioned writer; file presence, Issue state and
  labels alone cannot advance status.
- NVA-A57-3: Preview, apply and readback are idempotent and CAS-bound; stale,
  replayed, colliding and partially written operations fail without a false
  transition claim.
- NVA-A57-4: Nova and Cyborg can bind one byte-identical portfolio snapshot
  while this repository remains the only canonical ledger authority.
- NVA-A57-5: Historical events 39/40 are repaired through append-only evidence
  amendment; prior event bytes are unchanged and the default checker becomes
  green.
- NVA-A57-6: A generic initializer creates a reviewed backlog item without
  bypassing schema, ownership, evidence, uniqueness or atomic projection rules.

### `#7` Runner conformance

- NVA-A7-1: Every advertised runner/adapter capability has a versioned report
  with runner version, environment class, capacity class and evidence digest.
- NVA-A7-2: Native subagent fan-out and independent worker execution are
  distinct cells.
- NVA-A7-3: The suite runs offline with synthetic adapters and supports
  opt-in live/native certification.
- NVA-A7-4: Unsupported, partial and unavailable cells cannot be advertised as
  certified.
- NVA-A7-5: A required non-empty baseline matrix is explicit; zero advertised
  cells or runner-reported identity alone cannot close the issue.
- NVA-A7-6: Supported usage, cost and actual-assurance fields are observed or
  typed unsupported/unavailable; “not collected” is not zero, configured
  independence is not executed attestation, and #75 owns the shared
  cross-runner taxonomy, denominators and aggregation.

### `#8` Benchmark suite

- NVA-A8-1: Mini, Feature, review, migration and failure-recovery fixtures are
  versioned and reproducible.
- NVA-A8-2: Serial and runner-native results use unchanged scoring that Nova B
  can extend with local-pool/external results.
- NVA-A8-3: Results separate orchestration, workspace, verification, review,
  retry and cleanup overhead.
- NVA-A8-4: No concurrency recommendation is made without observed task-level
  benefit and a resource envelope.
- NVA-A8-5: `pipeline.multi-cli-efficiency-pilots` remains an input until its
  separately PO-gated pilot and evidence criteria are satisfied; benchmark
  framework delivery alone cannot close it.

### `#12` Bounded scheduling

- NVA-A12-1: Same canonical input produces the same maximum-cardinality safe
  wave and receipt.
- NVA-A12-2: Cycles, unknown dependencies/write sets, overlapping authority
  and stale receipts fail closed.
- NVA-A12-3: Every unselected ready package has an explicit dependency, path,
  resource or capacity reason.
- NVA-A12-4: Completion, failure, cancellation and invalidation yield a
  deterministic next-wave plan with separate package evidence.

### `#14` Execution-plane contract

- NVA-A14-1: Request, admission, state, heartbeat, cancellation, timeout,
  result and evidence envelopes are closed and versioned.
- NVA-A14-2: Locality, workspace, network, mounts, resource limits, sidecars
  and write capability are explicit.
- NVA-A14-3: Advertised capacity and observed admission remain separate.
- NVA-A14-4: Synthetic adapters cover success, failure, timeout, cancellation,
  retry, duplicate delivery and lost heartbeat.
- NVA-A14-5: The frozen control/execution exchange remains unchanged.

### `#29` Selected-sandbox resolution

- NVA-A29-1: CAS health cannot satisfy selected-sandbox availability.
- NVA-A29-2: A terminal selection failure is attempted at most once per valid
  capability fingerprint.
- NVA-A29-3: Relevant runner/host/environment/profile/policy/probe drift
  invalidates the disposition.
- NVA-A29-4: Functional-equivalent review is never reported as native
  selected-sandbox execution.
- NVA-A29-5: State/diagnostics contain no private machine or account
  coordinates.
- NVA-A29-6: At least one opt-in selected-child execution produces a fresh
  nonce-bound positive receipt; no-child, wrong child/attempt/profile/
  fingerprint, replay, host-only observation, CAS health or fallback fixtures
  cannot produce `available-attested`.
- NVA-A29-7: The selected-sandbox policy SHALL select a closed semantic
  compatibility class, not a fixed Codex CLI version or released-binary hash.
  The current version and binary hash SHALL instead match a fresh,
  integrity-bound preflight receipt for the same boot, profile, platform,
  network and preflight schema. Any missing, stale or mismatched identity or
  semantic field SHALL fail closed.

### `#38` Invocation reliability

- NVA-A38-1: Each logical invocation has correlated, distinct attempts.
- NVA-A38-2: Deterministic request/chain defects fail before launch where the
  host contract permits.
- NVA-A38-3: Byte-equivalent invalid requests cannot loop.
- NVA-A38-4: One confirmed resolution is atomically reused within the session
  only while all fingerprint predicates match.
- NVA-A38-5: Failure classes, recurrence metrics and remediation candidates
  remain privacy-safe and observational.
- NVA-A38-6: Accepted systemic repairs require a reproducer, owning-layer fix,
  regression fixture and post-fix non-recurrence.

### `#54` Critic convergence

- NVA-A54-1: Critic requests are compiled and admitted before a model/runner
  launch.
- NVA-A54-2: Oversized/incoherent reviews are deterministically packaged with
  an integration-impact closure.
- NVA-A54-3: First review emits a schema-valid verdict plus complete coverage
  receipt; empty output is not `No findings`.
- NVA-A54-4: Corrections use a fresh Critic on exact delta plus impact scope;
  broader review requires typed invalidation.
- NVA-A54-5: Four review rounds/three correction commits are enforced and
  exhaustion opens a PO course gate.
- NVA-A54-6: `pipeline.evidence-bound-review-retry-economics` and
  `pipeline.closed-input-channel-review-economics` are reconciled with
  evidence before any closure transition.
- NVA-A54-7: Closed structured channels reject free text; retained stage
  receipts, typed infrastructure aborts and invalidation predicates are exact
  and retained evidence cannot itself become PASS.
- NVA-A54-8: `pipeline.critic-context-isolation` remains under Cyborg's
  activated ownership unless a later explicit transfer is recorded.
- NVA-A54-9: Nova exposes request validity, convergence and delta-review inputs
  without owning #75's cross-runner usage/cost or Critic-assurance aggregation.
- NVA-A54-10: In the release path, the first admitted review is broad; every
  normal correction review binds the previous reviewed candidate-to-current
  candidate range plus deterministic impact closure, and a broad rerun is
  rejected without a typed invalidation reason.
- NVA-A54-11: A correction finding identifies a changed line or direct
  consequence of the correction delta; unchanged historical findings remain
  dispositions in the existing lineage rather than new findings.

### `#56` Release preflight

- NVA-A56-1: A clean prepared `0.4.x`-style candidate receives a deterministic
  ready report without running final gates.
- NVA-A56-2: Version, documentation, retention and candidate drift fail before
  Full Verify.
- NVA-A56-3: Local deterministic blockers remain distinct from remote/human
  gates.
- NVA-A56-4: Valid GG-03 binding reaches evidence validation instead of an
  ambiguous command-form rejection.
- NVA-A56-5: Cyborg requirements can be registered after reconciliation
  without importing unpublished Cyborg bytes.
- NVA-A56-6: Missing lifecycle manifest, durable PRD/Spec/acceptance/Result
  destination, archive digest/provenance, public/private classification or
  bounded consent-status readback blocks readiness without exposing raw
  consent, credential or environment material.
- NVA-A56-7: Before candidate authorization, preflight binds the intended
  remote fingerprint/ref and exact preimage and reports usable credentials,
  ref write capability, relevant workflow-update capability, repository/ref
  policy and fixed executor availability as sanitized typed cells.
- NVA-A56-8: Missing endpoint access, insufficient permission, policy
  rejection, stale preimage, ambiguous transport and unavailable executor are
  distinct non-ready results; successful read access cannot imply write
  capability.

### `#98` Post-v0.4.7 delivery loop

- NVA-A98-1: One reviewed adoption record binds previous Nova head/tree,
  released `v0.4.7` commit/tree, rebased candidate, ordered replay/conflict
  dispositions and every invalidated/rerun evidence item.
- NVA-A98-2: A fixed productive CLI exposes prepare, explicit authorization,
  execute and fresh remote readback by consuming the existing publication
  authority and executor contracts, without direct library invocation.
- NVA-A98-2a: The released closed-key publication v1 contract remains
  byte-stable and readable; Critic and release-preflight bindings use a
  versioned successor in the same authority family/store, and no v1 approval
  can authorize successor execution.
- NVA-A98-3: Raw push, arbitrary Git arguments, force, delete, wildcard,
  multiple refspec and unbound generic guard override remain unavailable.
- NVA-A98-3a: Every Human-recoverable project guard denial exposes either a
  typed executable narrower recovery action or one universal PO emergency
  plan; it cannot terminate permanently as `HGO-NONOVERRIDABLE` merely
  because lifecycle readiness is partial.
- NVA-A98-3b: The emergency plan binds the exact guard/denial, normalized
  tool and full input digest, eligible path/command class, repository
  identity, HEAD/tree/status, State/continuity preimage, loaded guard-policy
  identities, Human reason and short expiry.
- NVA-A98-3b1: Before the second confirmation, the PO sees the exact action,
  guard rationale, exhausted safer alternatives, expected repository/external
  effects, evidence invalidation, rollback/recovery and residual risk. The PO
  remains final authority for the project-policy decision.
- NVA-A98-3c: A separate explicit activation arms one single-use capability;
  changed action, argv, target, preimage, reason, expiry or replay rejects,
  and immutable audit is durable before the action is admitted.
- NVA-A98-3d: Override admission is never operation success. The identical
  original operation must run and pass its normal effect/readback contract;
  ambiguous effect permits only reconciliation, not blind repetition.
- NVA-A98-3e: Regression fixtures cover expired unused-plan retry, partial
  lifecycle cleanup recovery, rebase-abort/readback, commit retry, exact
  in-root patch admission, drift/replay denial and audit-before-effect order.
- NVA-A98-3f: Every denial returns an actionable next route. A project-policy
  guard cannot deadlock as permanently non-overridable; a genuine host/OS
  limitation instead returns an exact external-operator boundary. When no
  automatic recovery is safely constructible, the route SHALL expose a
  bounded, PO-confirmed Human-recovery decision/plan rather than a null
  repair state.
- NVA-A98-3g: The minimal append-only Nova decision record is durable and
  forward-compatible with Phoenix's later richer authorization trail; absence
  of that future trail never blocks today's PO exception.
- NVA-A98-3h: For `host-authorized-wsl` actions, every Git observation uses
  the declared host execution profile directly. A sandbox Git EPERM is a
  typed routing condition, never repository invalidity or a sandbox retry.
  Host and sandbox Git observations cannot be combined as one authority.
- NVA-A98-3i: A shell grammar denial is effect-free and SHALL NOT require a
  Human-override audit reconciliation. Pasted LF or CRLF read-only commands
  may yield only separately executable normalized retries when every line is
  independently admitted; quoted/escaped continuations, operators,
  substitutions, redirects and mutable lines yield no retry action.
- NVA-A98-4: Wrong candidate, tree, repository/remote fingerprint,
  destination ref, preimage, gate evidence, approval digest, expiry, replay or
  non-fast-forward state rejects before mutation.
- NVA-A98-4a: A proven non-fast-forward feature-ref update produces only a
  sanitized attended-human `--force-with-lease` handover plus a required fresh
  remote readback. No Agent executor, Human-override capability or raw-push
  bypass may execute the force operation or claim it succeeded.
- NVA-A98-4b: V2 plan revocation atomically sets active phase `design` in the
  same writer-lock postimage as `planApproved=false` and the exact V2
  revocation. It can never emit an unapproved implementation phase.
- NVA-A98-4c: Recovery accepts only the exact old V2 mixed shape: no
  submission/invalidation, matching V2 approval/revocation and active plan
  path, implementation phase and unchanged valid Continuity. Its read-only
  plan binds preimage/postimage, actor, time and recovery class; its exact
  `--activate true` apply clears the spent approval/revocation into a durable
  receipt and moves to Design. Unknown input, drift or replay is fail-closed
  or zero-write; onboarding rejects every mixed postimage.
- NVA-A98-5: An isolated disposable-remote suite covers success, stale
  preimage, already-published convergence, ambiguous transport, replay and
  denied operations.
- NVA-A98-6: Release preflight detects unavailable credentials, insufficient
  ref permission and missing workflow-update capability before candidate
  authorization, without exposing identity, endpoint or credential bytes.
- NVA-A98-7: Full Verify emits bounded machine-readable suite progress while
  complete logs remain in the private run journal outside the interactive
  channel.
- NVA-A98-8: Resume reuses only terminal completed suites bound to the same
  candidate tree, suite identity/implementation, inputs, environment contract
  and Verify policy; partial suites rerun.
- NVA-A98-9: Candidate, suite, input, environment-contract or policy drift
  invalidates exactly the affected resume receipts and deterministic
  dependents without reducing registered coverage.
- NVA-A98-10: A correction-cycle fixture proves that the second Critic reviews
  the previous reviewed candidate-to-corrected candidate delta plus impact
  closure rather than complete release history.
- NVA-A98-11: Every broader correction rerun records a typed invalidation
  reason and a new lineage-parent binding.
- NVA-A98-12: Public release-state projection and `docs/state.md` agree with
  the published version/tag/commit/tree, and deterministic validation rejects
  an unpublished-candidate claim for an observed published tag.
- NVA-A98-13: The exact final Nova candidate passes Full Verify, Security,
  release preflight, delta-correct Critic review, explicit publication and
  fresh remote readback.
- NVA-A98-14: Closure evidence names the Nova candidate, integration commit,
  publication transaction/readback, Verify progress/resume fixtures and
  Critic lineage.

## Nova A increment gate

Nova A is accepted only when:

- all ten Nova A issue slices have a disposition and no hidden partial completion;
- `#57` has made the default backlog checker green or the Nova A gate remains
  blocked;
- focused tests and the one configured Verify/Security chain are green on one
  exact candidate;
- a fresh independent high-risk Critic has no undispositioned blocker/major
  finding;
- shared-file collisions with Cyborg are either absent or explicitly
  reconciled;
- the Nova A Result binds commit/tree and evidence; and
- the PO explicitly activates Nova B.

## Nova B issue acceptance

### `#60` Runner-native continuation

- NVA-B60-1: One versioned runner-neutral continuation contract binds the exact
  active feature, phase, approved plan/Spec, current action, acceptance and
  required evidence.
- NVA-B60-2: While that item is active, an informational question,
  clarification or observation is additive input and does not silently end,
  replace or split the continuation.
- NVA-B60-3: Codex activates or updates exactly one generation-bound native
  goal and receives an exact identity/objective/generation readback before
  claiming continuation.
- NVA-B60-4: Claude Code activates or updates the same bounded semantic goal
  through its supported native mechanism and receives an equivalent fresh
  bound readback.
- NVA-B60-5: Session activation, resume and Compact re-entry preserve the same
  goal generation while the bound executable item remains unchanged.
- NVA-B60-6: A named PO gate pauses native continuation before the prompt,
  confirms the same Goal's paused identity readback and persists
  `paused-po-gate` with the exact gate binding; it never maps that gate to a
  native blocked Goal.
- NVA-B60-7: Only a recorded PO resolution may restore that paused item; a
  successor generation is never created merely for ordinary autonomous work.
- NVA-B60-8: A typed blocker is distinct from a PO gate, stops automation and
  binds the exact goal identity, objective, generation and observation.
- NVA-B60-9: The user-facing blocker notice distinguishes same-blocker CLI
  resume from a changed objective, which requires a new explicit goal.
- NVA-B60-10: Explicit pause, cancel, replace and redirect always override
  automatic continuation and are recorded as explicit control changes.
- NVA-B60-11: Read-only tools, writes and long-running tools project bounded
  progress without manufacturing completion; absent progress stays unknown.
- NVA-B60-12: Stop-hook and interruption protections prevent duplicate native
  activation, recursive continuation and completion before durable evidence.
- NVA-B60-13: Continuation never widens approval, sandbox, network, repository,
  host, delegation, merge or release authority.
- NVA-B60-14: Unsupported or incompatible native goal support emits a typed
  degraded/unavailable result and no false continuation claim.
- NVA-B60-15: Cross-runner fixtures cover activation/readback, intermediate
  input, PO pause/resolution, typed blocker, explicit control, resume/Compact,
  progress, verified completion and degraded capability.
- NVA-B60-16: Focused tests, configured Verify and public documentation bind
  the exact contract and candidate for both Codex and Claude Code.
- NVA-B60-17: Normal bootstrap and Compact re-entry record a privacy-safe,
  reproducible payload measurement and stay within a runner-neutral 10–15k
  token budget. Role/state-specific lazy loading must retain every required
  lifecycle, authority, calibration, handover, verify and continuation check;
- NVA-B60-18: Claude Code's absolute soft Compact nudge SHALL begin no earlier
  than 400k observed context tokens and escalate only at 500k. The percentage
  safety brake remains independently governed and this nudge does not itself
  invoke Compact.
  a cached or skipped check is not a passing optimization.

### `#21` Local worker pool

- NVA-B21-1: A capable test host can execute a conflict-free wave larger than
  runner-native in-session fan-out.
- NVA-B21-2: Effective concurrency is the minimum of configured, operator,
  certified, observed, pressure and reserved capacity.
- NVA-B21-3: Resource pressure stops admission before reserved
  Elephant/Verify/Critic capacity is consumed.
- NVA-B21-4: Crash, timeout, cancellation, orphan, stale-candidate and partial
  wave behavior are deterministic and independently attributable.
- NVA-B21-5: Serial fallback preserves package semantics and evidence.
- NVA-B21-6: Pool capability is advertised only after at least two workers are
  certified and observed with separately bound workspaces and reported
  assurance; a process or worktree name is not OS-isolation evidence.
- NVA-B21-7: Every worker workspace has exact PO-approved target/base/write
  authority, creation/ownership/lease/cleanup evidence and fail-closed
  wrong-target, stale-owner and orphan cases.
- NVA-B21-12: Machine-local supervisor root, record, journal and lock require
  the current owner, restrictive non-group/non-world-writable modes and
  unambiguous regular-file link count; ownership, mode or hard-link drift is
  typed unavailable/recovery-required rather than create, noop or recovery.
- NVA-B21-8: The B1-I functional test wave uses real temporary Git
  repositories, independent no-hardlink local clones and overlapping operating
  system child processes; an in-process reducer or mocked spawn alone cannot
  satisfy it.
- NVA-B21-9: Fixture-process evidence proves only the local supervisor
  mechanism. Pool capability and Issue `#21` remain open until a separately
  activated same-host observation proves at least two provider-backed
  Goldfish workers under one candidate, fixture set and resource envelope.
- NVA-B21-10: Explicit cancellation is accepted only against the exact current
  supervisor record and owner identity, persists a closed intent, drains only
  re-observed child identities and does not claim terminal success before the
  supervisor records it.
- NVA-B21-11: Source-checkout drift and tracked, untracked or ignored output
  outside a worker's exact write set produce `recovery-required`; a zero exit
  cannot override those failures.

### `#16` Asynchronous execution

- NVA-B16-1: Delayed, duplicate, out-of-order, timeout, cancellation-race and
  provider-outage fixtures are deterministic.
- NVA-B16-2: Obsolete-candidate results are rejected or explicitly repackaged.
- NVA-B16-3: Provider attestation never substitutes for Verify/Critic/PO
  authority.
- NVA-B16-4: No named provider is required for core conformance.
- NVA-B16-5: Unattended assumptions use a closed task-scoped set with explicit
  expiry, stop/escalation behavior and no delegation, approval, credential,
  mutation, merge or release authority.
- NVA-B16-6: The B2-I broker binds candidate to the fixed Nova base commit and
  tree, closed target digest and job identity; every non-genesis record proves
  its sealed predecessor, exact allowed transition and, for cancellation, the
  exact predecessor pre-state digest; provider `success`
  remains `succeeded-unverified` until a second matching metadata observation
  reconciles it.

### `#18` Credential leases

- NVA-B18-1: Leases are short-lived, task/repository/operation scoped,
  externally brokered and deterministically revoked.
- NVA-B18-2: Workers cannot widen scope or access unrelated repository,
  credential, home, SSH or global Git state.
- NVA-B18-3: Canary tests prove forbidden access is denied.
- NVA-B18-4: Logs/evidence contain no secret values or private coordinates.
- NVA-B18-5: The B2-I local contract represents no personal token, accepts
  only `CI_JOB_TOKEN` job mode and rejects raw credential fields, substituted
  jobs and pre-submission observations.

### `#15` Antigravity with Gemini models

- NVA-B15-1: The Alpha descriptor identifies Antigravity as the third runner,
  Gemini as its model family and `alpha-documentation-only` status.
- NVA-B15-2: Selection fails closed and no AGY discovery/install/auth/network/
  invocation or advertised execution capability is present.
- NVA-B15-3: The descriptor binds the reviewed B3-R decision and direct AGY
  delivery is tracked separately in #69 with `sprint:NONE`.
- NVA-B15-4: Unsupported Advisor/review/write cells remain unavailable.
- NVA-B15-5: Claude/Codex frozen fixtures and hostile no-execution tests remain
  green.
- NVA-B15-6: Sprint-close evidence for #15 explicitly says that direct AGY
  implementation is not delivered.

### `#51` GitHub/GitLab transport and forge

- NVA-B51-1: Git remains the only supported VCS; GitHub and GitLab are
  interchangeable transport and forge targets for consumer-selected projects.
- NVA-B51-2: GitHub and GitLab implement one versioned transport-plus-forge
  capability contract.
- NVA-B51-3: GitLab.com and explicit Self-Managed targets resolve
  deterministically without exposing tokens.
- NVA-B51-4: Issues/change requests/CI/governance mappings are exact-target,
  previewed, read back and capability honest.
- NVA-B51-5: Each control is native, emulated, manual or unsupported; weaker
  controls are never silently substituted.
- NVA-B51-6: At least one live read-only GitLab capability and one exact
  GitLab transport readback are proved; zero supported cells cannot close the
  issue.
- NVA-B51-7: Delete, transfer, settings, permissions, silent close/relabel and
  broad batch authority remain unsupported without separate approval.
- NVA-B51-8: Exact remote resolution, fetch/ref readback and a new-branch
  publication bind provider, source commit and full destination ref; force,
  delete and wildcard refspecs remain denied.
- NVA-B51-9: Change-request merge and release operations are explicit forge
  mutations with preview, confirmation and readback; a Git push alone never
  claims either outcome.

### External `#63` hotfix baseline

Issue `#63` has no Nova acceptance IDs. Its stable 0.4.7 implementation is
consumed only through NVA-G13; Nova does not implement, close or claim delivery
of the hotfix.

### `#49` macOS boundary transfer

- NVA-B49-1: Apple-Silicon native bootstrap and clean-host completion are
  transferred to #72 (`sprint:NONE`); Nova cannot advertise them as complete.
- NVA-B49-2: Native lifecycle, Full Verify, Security, Critic and PO-close
  evidence are owned by #72 with its own candidate/evidence lifecycle.
- NVA-B49-3: `#7` still reports every Nova-supported runner cell; that
  non-native inventory duty does not depend on #72's native close.
- NVA-B49-4: Native execution of filesystem, Unicode, case-folding, symlink,
  permission, durability, process and tool-resolution fixtures transfers to
  #72; Nova retains only the synthetic contract fixtures.
- NVA-B49-5: Nova's retained synthetic records expose no
  secret/keychain/account/private-path material.
- NVA-B49-6: Apple Silicon, Intel, hosted CI and synthetic claims remain
  distinct; Intel, hosted CI and synthetic evidence never substitute for #72.
- NVA-B49-7: Keep-awake remains an explicit, bounded Nova lifecycle contract;
  denied or unavailable support is reported honestly and is never a
  correctness, completion or wakeup guarantee.
- NVA-B49-8: Nonblocking interaction remains in Nova and preserves exact input
  authority, interruption, completion delivery and deterministic resume
  without a hidden background-input or approval channel.
- NVA-B49-9: Nova records an exact original-Issue transfer comment before its
  narrowed #49 disposition; it neither closes #72 nor claims a native result.

## Final evidence matrix

| Evidence class | Nova A | Nova B / close |
| --- | --- | --- |
| Base/candidate binding | Required | Required, based on accepted Nova A OID |
| Focused contract tests | Every slice | Every slice |
| Synthetic adapter/failure tests | Required | Required |
| Full Verify | Exact A candidate | Exact final candidate |
| Security | Exact A candidate | Exact final candidate |
| Independent Critic | High-risk A review | High-risk final review |
| Benchmark | Serial/native baseline | Local/async/runner/forge additions |
| Real host | Selected-sandbox opt-in where claimed | Local worker where claimed; synthetic/non-native macOS disposition only |
| External readback | None unless a slice explicitly mutates | Every forge/remote mutation |
| PO acceptance | Activates Nova B | Closes Epic |
