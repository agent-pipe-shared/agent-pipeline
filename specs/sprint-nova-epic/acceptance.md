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
   platform/runner/forge/recovery evidence and all 17 issue dispositions.

No prior gate implies a later gate.

## Global acceptance criteria

| ID | Requirement | Evidence |
| --- | --- | --- |
| NVA-G01 | WHEN base commit, candidate tree, dispatch, attempt, queue revision or authority digest is absent or mismatched, THE SYSTEM SHALL reject admission before execution. | Negative contract fixtures and candidate-bound test receipt. |
| NVA-G02 | WHEN an outcome is unknown, unavailable, stale, invalidated, cancelled, expired, malformed or completed-but-undelivered, THE SYSTEM SHALL NOT project success. | Outcome taxonomy fixtures across local and async adapters. |
| NVA-G03 | WHEN a worker requests delegation, review, approval, merge, release or undeclared authority, THE SYSTEM SHALL reject it. | Closed-schema and confused-deputy fixtures. |
| NVA-G04 | WHEN isolation evidence is absent or weaker than requested, THE SYSTEM SHALL report only the observed assurance and SHALL NOT infer OS isolation from branch, worktree, runner or process names. | Assurance downgrade fixtures and reports. |
| NVA-G05 | WHEN Nova and Cyborg would mutate the same physical workspace or global runtime resource concurrently, implementation SHALL stop until the actual resource is serialized. An identical repository-relative path on independent Sprint branches SHALL be recorded as a later merge collision and SHALL block only the combined integration if the accepted diffs conflict. Nova's current base is delivered and closed `v0.4.6`. | Physical-resource declaration, collision manifest and later exact-OID integration receipt. |
| NVA-G06 | WHEN Nova and Cyborg both claim direct reconciliation ownership of one canonical backlog ID, integration SHALL fail closed until one claim is withdrawn or an explicit common owner is approved. | Backlog claim manifests bound to the same ledger head. |
| NVA-G07 | WHEN the backlog ledger head, item body or status differs from the approved intake snapshot, no backlog transition preview SHALL be accepted until the complete intake is regenerated. | Canonical backlog readback and fresh disposition digest. |
| NVA-G08 | WHEN a frozen V3 or v1 authority would need an in-place edit, the slice SHALL stop and propose a versioned companion or explicit ADR. | Diff review and schema compatibility tests. |
| NVA-G09 | WHEN a result is accepted, it SHALL bind the exact package, dispatch, attempt, candidate and result digest; conflicting replay SHALL fail closed. | Replay/duplicate/out-of-order fixtures. |
| NVA-G10 | Every external mutation SHALL resolve the exact target, require confirmation matching its preview, carry an idempotency binding and require matching readback before success. | Forge/credential adapter tests and opt-in observation. |
| NVA-G11 | Every portable metric SHALL preserve unknown usage/cost as unknown and SHALL exclude prompts, secrets, private coordinates and unrestricted output. | Privacy/cardinality tests. |
| NVA-G12 | Epic completion SHALL require all 17 issue acceptance sets and the same frozen Nova-only candidate to pass configured Verify, Security, independent Critic and PO acceptance; unavailable or deferred criteria SHALL remain open unless the PO explicitly changes scope. | Final Result and issue-evidence matrix. |

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

## Nova A increment gate

Nova A is accepted only when:

- all nine issue slices have a disposition and no hidden partial completion;
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

- NVA-B60-1: An active work item projects only one generation-bound native goal
  and receives an exact native readback before continuation is claimed.
- NVA-B60-2: A Codex native `blocked` readback stops automation and persists as
  `typed-blocker` evidence with its goal identity, generation and observation.
- NVA-B60-3: The user-facing notice distinguishes same-blocker CLI resume from
  a changed objective, which requires `/goal <new objective>`; the Pipeline
  never silently resumes or replaces the goal.

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

### `#18` Credential leases

- NVA-B18-1: Leases are short-lived, task/repository/operation scoped,
  externally brokered and deterministically revoked.
- NVA-B18-2: Workers cannot widen scope or access unrelated repository,
  credential, home, SSH or global Git state.
- NVA-B18-3: Canary tests prove forbidden access is denied.
- NVA-B18-4: Logs/evidence contain no secret values or private coordinates.

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

### `#51` GitLab forge

- NVA-B51-1: Git remains the only supported VCS and Public Core hosting remains
  separate from consumer-forge support.
- NVA-B51-2: GitHub and GitLab implement one versioned forge capability
  contract.
- NVA-B51-3: GitLab.com and explicit Self-Managed targets resolve
  deterministically without exposing tokens.
- NVA-B51-4: Issues/change requests/CI/governance mappings are exact-target,
  previewed, read back and capability honest.
- NVA-B51-5: Each control is native, emulated, manual or unsupported; weaker
  controls are never silently substituted.
- NVA-B51-6: At least one live read-only GitLab capability is proved; zero
  supported cells cannot close the issue.
- NVA-B51-7: Delete, transfer, settings, permissions, silent close/relabel and
  broad batch authority remain unsupported without separate approval.

### `#63` V4 recovery deadlock

- NVA-B63-1: Every V4 `source_invalid` result exposes the exact read-only
  source recovery planner rather than `nextAction:null`.
- NVA-B63-2: Every V4 `manifest_invalid` result exposes the exact read-only
  manifest repair planner rather than `nextAction:null`.
- NVA-B63-3: Source diagnosis distinguishes invalid authority, stale generated
  projection, unsupported transition and unavailable evidence.
- NVA-B63-4: Source recovery never synthesizes or directly rewrites
  `pipeline.user.yaml`; it ends in one sanctioned workflow or explicit
  `unrepairable`.
- NVA-B63-5: A missing generated manifest yields a plan bound to the current
  raw V3 source digest and the raw manifest preimage/postimage; source drift
  before publication rejects the write.
- NVA-B63-6: An invalid existing manifest always remains byte-identical and
  returns terminal `unrepairable`; only an absent generated manifest may use
  the atomic no-replace writer.
- NVA-B63-7: Manifest apply targets only `.claude/pipeline.yaml`, recomputes
  the exact plan and rejects source, root, plan or preimage drift.
- NVA-B63-8: Manifest apply requires the exact plan digest and explicit
  `--activate`; inspection and planning never auto-apply.
- NVA-B63-9: Apply returns a fresh V4 readback; recovery reaches `ready`,
  another typed controlling state, or explicit terminal disposition without a
  false success claim.
- NVA-B63-10: The exact Pipeline-shipped V3 authority validator is available
  read-only before readiness for the exact governed root.
- NVA-B63-11: Only the exact source/manifest planners and manifest writer argv
  are added to pre-ready lifecycle authorization.
- NVA-B63-12: Arbitrary pre-ready writes, direct State/source edits and
  readiness-guard bypasses remain denied.
- NVA-B63-13: Wrong roots, aliases, missing/extra arguments, chaining,
  redirection and command substitution fail hostile guard tests.
- NVA-B63-14: Process-level shipped-CLI fixtures prove `ready` through
  manifest loss and governed V3 registry refresh back to `ready`.
- NVA-B63-15: Full Verify, Security and fresh independent Critic evidence bind
  the exact candidate; the Issue comment names the actual delivery merge
  commit and relevant verification results before Sprint close.

### `#49` Native macOS

- NVA-B49-1: A clean Apple Silicon host completes documented bootstrap without
  omitted manual repair.
- NVA-B49-2: The exact final candidate completes lifecycle, Full Verify,
  Security and Close natively.
- NVA-B49-3: `#7` reports every supported runner cell, including Antigravity
  after `#15`.
- NVA-B49-4: Filesystem, Unicode, case-folding, symlink, permission,
  durability, process and tool-resolution fixtures cover native behavior.
- NVA-B49-5: Evidence exposes no secret/keychain/account/private-path material.
- NVA-B49-6: Apple Silicon, Intel, hosted CI and synthetic claims remain
  distinct.
- NVA-B49-7: Keep-awake is explicit, bounded and observed; denied or
  unavailable host support is reported honestly and never becomes a
  correctness, completion or wakeup guarantee.
- NVA-B49-8: Nonblocking interaction preserves exact input authority,
  interruption, completion delivery and deterministic resume without a hidden
  background-input or approval channel.

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
| Real host | Selected-sandbox opt-in where claimed | Local worker + Apple Silicon where claimed |
| External readback | None unless a slice explicitly mutates | Every forge/remote mutation |
| PO acceptance | Activates Nova B | Closes Epic |
