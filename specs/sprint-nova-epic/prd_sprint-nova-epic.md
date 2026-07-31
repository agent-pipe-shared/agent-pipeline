# Sprint Nova Epic — Product Requirements

<!-- po-language: en -->
<!-- technical-spec-sha256: aa5eba0ce0c251ed90b8a00e94509a73146873f1cfc9f0942203c5dca9fccf17 -->

**Feature ID:** `sprint-nova-epic`
**Profile / rigor / risk:** Epic / 2 / high
**Gate:** PRD/Spec approved for bounded pre-rebase Execution; Bootstrap,
installation and V4/#63-overlapping implementation remain blocked
**Current working base:** delivered and closed release `v0.4.6`, commit
`9d1b3dc108eb77629ace5b82002120f5539abd8d`, tree
`282a8b5c5b0581e042985bfb373a66be0eb2d08b`
**Pre-rebase execution base:** the current v0.4.6-derived branch, restricted to
packages whose exact write-set is disjoint from Bootstrap, installation,
runtime-readback and V4/#63 recovery surfaces
**Required full execution base:** the exact future stable `main` 0.4.7
commit/tree, accepted and rebased before protected surfaces, increment
acceptance or final candidate evidence
**Working branch:** `feat/sprint-nova-codex-v046`; bounded conflict-independent
Nova work may continue without importing `main`
**Sibling workstream:** Sprint Cyborg, independently owned and independently
closable

## Gate boundary

The PO approved the reconciled PRD and technical Spec on 2026-07-30, with an
explicit exception that the independently attempted high-risk Advisor was
typed unavailable and produced no answer, child or sandbox binding. That
exception is not an Advisor success claim.

The same PO decision authorizes bounded pre-rebase implementation only when a
dispatch declares an exact write-set that is disjoint from Bootstrap,
installation, runtime-readback and V4/#63 recovery surfaces. An absent,
uncertain or overlapping path is protected and waits for the stable 0.4.7
rebase. This approval grants no external access, credentials, provider
mutation, merge, push, release, issue closure or final increment acceptance.

## Executive decision

Sprint Nova contains exactly the 16 open GitHub Issues carrying `sprint:nova`
on the 2026-07-30 read-only snapshot, after excluding competing Sprint and
`hotfix:*` ownership. They remain one Epic but are delivered as two
serial, separately accepted increments:

| Increment | Product outcome | Issues |
| --- | --- | --- |
| **Nova A — Trustworthy execution foundation** | Make backlog state, capability claims, invocation, scheduling, review and release preparation deterministic and evidence-bound before increasing execution capacity. | `#57`, `#7`, `#8`, `#12`, `#14`, `#29`, `#38`, `#54`, `#56` |
| **Nova B — Bounded continuity, scale and portability** | First bind active Pipeline work to supported runners' native goal continuation, then add supervised local workers, asynchronous execution, bounded credentials, the Antigravity Alpha boundary and dual-provider GitHub/GitLab support. The native Apple-Silicon close transfers to `#72`. | `#60`, `#21`, `#16`, `#18`, `#15`, `#51`, `#49` (narrowed) |

Nova B may begin only from an exact PO-accepted Nova A commit/tree and immutable
increment receipt. Nova A and Nova B must remain independently verifiable from
Cyborg. No Nova gate requires a Cyborg OID, unpublished implementation,
manifest or Result.

**Current basis (PO confirmations, 2026-07-30):** Nova remains isolated on its
current v0.4.6-derived branch and imports no `main` bytes yet. Issue `#63` is
owned by `hotfix:0.4.7`, not Nova. Conflict-independent packages may enter
bounded pre-rebase Execution. A stable accepted `main` 0.4.7 and exact Nova
rebase remain mandatory before protected-path work, increment acceptance,
final candidate evidence or any claim that depends on the recovered V4
baseline. Existing B4R bytes/evidence are retained as historical pre-rescope
material and are neither extended nor claimed as Nova delivery.

## Product problem

The delivered `v0.4.6` release provides the closed onboarding/V4 base plus
useful but deliberately narrow execution primitives: an
immutable control/execution exchange, deterministic conflict-aware package
planning, runner outcome normalization, selected-sandbox diagnostics,
review-economy controls and runner-honest V3 routing.

They are not yet a complete execution product. Delivery status can drift from
the accepted Spec; capability and isolation claims are not uniformly
certified; deterministic invocation failures can repeat; scheduling does not
yet supervise workers; remote work introduces cancellation, replay and
credential risks; and final platform/forge support lacks exact-candidate
evidence.

Implementing all 16 issues as one parallel wave would mix authority,
certification, scheduling, execution, review, provider integration and release
acceptance. A mixed wave would also make later failure attribution and rollback
unreliable. The V4 recovery correction is an external 0.4.7 baseline
prerequisite and cannot be counted again as a Nova outcome.

## Product outcome

At Nova close, Agent-Pipeline can prepare and supervise bounded work across
the supported local and external modes without conflating scheduling,
admission, execution, verification, review or PO authority.

Every advertised capability is backed by a versioned conformance status and
evidence class. Every accepted delivery advances the canonical backlog through
an authorized, idempotent, atomic transition rather than later manual cleanup.
Unknown, unavailable, cancelled, stale, expired, malformed or undelivered
outcomes cannot become success.

Nova advertises only its synthetic/non-native macOS contract boundary. Exact
Apple Silicon evidence is transferred to Issue `#72` (`sprint:NONE`) because
no eligible device is currently available; unsupported or unobserved cells
remain explicit. Post-Sprint Nova/Cyborg integration is a separate lifecycle
and cannot retroactively redefine either Sprint's acceptance.

## Users and stakeholders

- **PO:** approves the PRD, technical Spec, Nova A activation and Nova B/Epic
  acceptance separately; can see which evidence closes which issue or backlog
  item.
- **Elephant:** remains the sole orchestrator and disposition authority while
  receiving deterministic admission, capacity and failure reasons.
- **Goldfish/worker:** receives one sealed work package, cannot delegate or
  widen authority, and returns an attributable result.
- **Critic:** receives a first-pass-valid, closed review request and later
  exact correction deltas without implementation reasoning.
- **Maintainer/operator:** sees capability, capacity, retry, cleanup and
  preflight status without secrets or private host coordinates.
- **Adopting project:** can distinguish supported, emulated, manual,
  unavailable and unsupported runner/forge/platform cells.

## Nova A requirements — trustworthy execution foundation

### A1. Canonical delivery/status reconciliation — `#57`

- Bind backlog item, accepted Spec, Sprint/increment, candidate, evidence and
  required gates in one versioned delivery record.
- Advance assignment to `in_progress` and propose closure only through the
  sanctioned append-only writer and explicit authority.
- Make preview, application and readback idempotent, CAS-bound and recoverable
  across interruption or partial write failure.
- Produce one byte-bound portfolio snapshot for parallel runners while keeping
  this Nova repository the sole canonical backlog authority.
- Repair the unreachable evidence references in historical events 39 and 40
  append-only; never rewrite prior ledger bytes.
- Provide a generic sanctioned item initializer so a confirmed GitHub issue
  does not require a fabricated manual ledger entry.

### A2. Runner conformance — `#7`

- Define a versioned capability report and offline synthetic certification.
- Keep runner-native fan-out, supervised worker execution and unavailable
  capability cells distinct.
- Require a non-empty minimum regression matrix; zero advertised cells cannot
  satisfy the issue.
- Make conformance consumable by admission, benchmarking and platform
  acceptance without treating reported model identity as independent
  attestation.
- Expose whether the usage/cost and actual Critic-assurance fields required by
  the shared contract are observed or typed unavailable; never project
  `not collected` as zero or configured independence as executed attestation.
- Keep the cross-runner receipt taxonomy, denominators and aggregation under
  `#75`; consuming that boundary does not expand Nova to deliver Nightwing
  telemetry.

### A3. Reproducible benchmark — `#8`

- Freeze representative tasks, scoring, baselines, resource envelopes,
  unknown-usage treatment, stop conditions and rollback.
- Establish serial and runner-native baselines in Nova A; Nova B may append
  supervised/async observations without changing scoring.
- Treat `pipeline.multi-cli-efficiency-pilots` as an input until its own
  pilot-specific closure evidence exists.

### A4. Bounded scheduling and execution contract — `#12`, `#14`

- Compose the existing planner and immutable v1 exchange instead of replacing
  them.
- Define versioned companion contracts for execution identity, admission,
  lifecycle, cancellation, timeout, heartbeat, result and evidence.
- Reject absent or non-authoritative path/resource declarations.
- Keep advertised capacity separate from observed admission and preserve
  distinct evidence/Critic duties for every package.
- Require a separately approved ADR before adding a production executor,
  remote transport, credential boundary or second state store beyond
  ADR-0044's in-process reversible spike.

### A5. Selected-sandbox and invocation reliability — `#29`, `#38`

- Resolve capability once per valid fingerprint with typed terminal/transient
  states, bounded retry, invalidation and operator-authorized reprobe.
- Require a nonce/attempt/profile/fingerprint-bound positive child receipt
  before any `available-attested` claim.
- Never report CAS health, fallback execution or a functional equivalent as
  selected-sandbox success or OS isolation.
- Correlate logical invocations and attempts, stop byte-equivalent invalid
  loops, and reuse a confirmed session resolution only while every binding
  remains unchanged.
- Keep failure telemetry observational, privacy-safe and unable to authorize
  its own remediation.

### A6. Critic convergence — `#54`

- Compile and admit closed Critic requests before launch.
- Bind first-pass coverage, structured findings, correction lineage, retained
  evidence and exact impact invalidation.
- Preserve fresh Critic independence and reject coordinator/status
  contamination deterministically.
- Enforce the existing four-review/three-correction course gate rather than
  introducing a competing review-budget authority.
- Reconcile `pipeline.closed-input-channel-review-economics` and
  `pipeline.evidence-bound-review-retry-economics`; keep
  `pipeline.critic-context-isolation` under Cyborg's already activated
  ownership unless the PO later transfers it.
- Emit the Critic-specific validity, convergence and actual assurance inputs
  required by `#75` while leaving cross-runner usage/cost receipt taxonomy,
  denominators and public aggregation to that Nightwing Issue.

### A7. Release preflight — `#56`

- Produce a read-only exact-candidate readiness report before expensive final
  gates.
- Detect version, documentation, lifecycle-manifest, Spec/Result retention,
  archive provenance, public/private classification, consent-status and
  candidate drift.
- Keep deterministic local blockers distinct from remote/human gates.
- Admit a valid GG-03 target binding without treating preflight readiness as
  Verify, Security, Critic, publication or release success.
- Allow later Cyborg requirements through a versioned post-Sprint extension;
  do not consume unpublished Cyborg schemas.

## Nova B requirements — bounded continuity, scale and portability

### B0. Runner-native continuation baseline — `#60`

- Define one bounded, provider-neutral continuation contract from the active
  feature, phase, approved plan, current executable work item, acceptance
  criteria and required verification evidence; the derived condition is
  generation-bound and contains no raw user or private host text.
- Project that condition into Codex's and Claude Code's supported native goal
  mechanisms and require a fresh native readback. An unavailable/unsupported
  runner or version returns typed degraded evidence; it never claims protected
  continuation.
- Continue an active executable item until and only until verified completion
  with durable Pipeline evidence, a named PO gate, a typed blocker, or an
  explicit user pause, cancellation, replacement or redirect. An intermediate
  question, clarification or observation is additive input, not a terminal.
- Pause and clear native continuation before a PO gate is presented; restore a
  fresh generation only after the recorded gate resolution. Resume and compact
  re-entry re-establish the same bounded objective when it remains active.
- Report machine-readable progress from phase/revision, process deadline,
  test/dispatch/candidate/evidence observations and read-only artifacts.
  Unknown remains unknown; a Git diff is neither required nor sufficient.
- Preserve the Stop-hook context budget, deduplication and emergency brake;
  goal activation does not widen sandbox, approval, network, repository or
  host permissions.

### B1. Supervised local worker pool — `#21`

- Consume accepted Nova A scheduling, execution, conformance and benchmark
  contracts.
- Compute effective capacity only from commensurate certified/observed units,
  with missing assurance yielding no advertised concurrent capability.
- Preserve reserved Elephant/Verify/Critic/recovery capacity.
- Bind per-worker workspace and authority leases, cleanup ownership,
  heartbeat, cancellation, timeout, orphan expiry and stale-result rejection.
- Treat the closed JSON Schema as structural validation and the exported
  runtime validator as canonical semantic admission; require both and prove
  the combined contract against the supervisor with one shared corpus.
- Describe workers as separately supervised workspaces; never infer OS
  isolation from a worktree or process.
- Preserve serial fallback; advertise a pool only after at least two workers
  are certified and observed on the target host.

### B2. Asynchronous execution and credential leases — `#16`, `#18`

- Reconcile queued, running, paused and terminal outcomes including duplicate,
  out-of-order, timeout, provider-outage and cancellation-race behavior.
- Reject obsolete-candidate results or require an explicit repackage.
- Keep provider attestation separate from Pipeline Verify/Critic/PO
  acceptance.
- Use short-lived, externally brokered repository/operation/task-scoped
  leases; workers cannot widen repository, operation or duration.
- Store no secret or private coordinate in portable state or evidence.

### B3. Antigravity with Gemini models — `#15`

- Provide a documentation-bound Alpha integration boundary for Antigravity as
  the visible third runner; Gemini remains its model family.
- Keep selection fail-closed and label the adapter Alpha; it has no AGY install,
  discovery, authentication, network, invocation or advertised execution.
- Keep unsupported Advisor/review/write cells unavailable.
- Transfer direct executable AGY runner delivery to #69 (`sprint:NONE`) for a
  later dedicated sprint with current-contract, auth and #7 certification.

### B4. GitHub/GitLab transport and forge support — `#51`

- Keep Git as the common transport engine and bind GitHub and GitLab as
  interchangeable remote/forge targets for consumer-selected repositories.
- Cover exact remote resolution, fetch/ref readback, branch publication and
  bounded push separately from provider forge operations: projects, issues,
  change requests, merges, CI, releases and branch protection.
- Classify every GitHub/GitLab transport and forge cell as native, emulated,
  manual or unsupported.
- Require exact target resolution, matching preview confirmation, idempotency,
  readback and typed partial/compensation outcomes for every mutation.
- Use accepted B2 leases or a separately approved operator-local
  authentication boundary.
- Keep delete, transfer, settings, permissions, silent close/relabel and broad
  batch authority unsupported unless separately approved.
- Require at least one proved read-only GitLab cell; zero supported cells
  cannot close the issue.

### Execution-baseline prerequisite — external `#63`

- Issue `#63` is owned by `hotfix:0.4.7` and is not part of the 16-Issue Nova
  delivery.
- Nova performs no further B4R, Bootstrap, installation or runtime-readback
  implementation before the stable 0.4.7 rebase.
- A pre-rebase package may proceed only with an exact reviewed write-set that
  excludes those protected surfaces; uncertainty fails closed into the rebase
  lane.
- The rebase must resolve redundant/conflicting B4R bytes against the accepted
  `main` implementation and rerun its applicable regression coverage.
- No pre-rebase package receives final increment acceptance or immutable final
  candidate evidence before that rebase and refreshed readiness readback.
- Nova cannot claim the `#63` merge, close evidence or product outcome.

### B5. macOS contract boundary and native-transfer disposition — `#49` → `#72`

- Retain the synthetic/non-native macOS contract and honest support boundary.
- Transfer clean-host Apple-Silicon bootstrap, lifecycle, runner, Verify,
  Security, Critic and PO-close evidence to `#72` (`sprint:NONE`).
- Keep Apple Silicon, Intel, hosted CI and synthetic evidence distinct; the
  latter never substitutes for native evidence.
- Nova makes no native macOS completion claim after this transfer.

## Sequencing

```text
current v0.4.6-derived Nova branch
  |
  +--> approved bounded pre-rebase Nova A packages
  |      (exact write-set; no Bootstrap/install/runtime-readback/V4 overlap)
  |
  +--> stable accepted main 0.4.7
  |
  +--> exact Nova rebase + conflict disposition + regenerated bindings
  |      + refreshed readiness approval
  |
  +--> protected-path work and completion of Nova A
  +--> Nova A1 backlog authority (#57)
  +--> Nova A2 conformance (#7)
           |
           +--> A5 sandbox/invocation (#29/#38) --> A6 Critic (#54)
           +--> A4 execution/scheduling (#14/#12)
           +--> A3 benchmark (#8)
           +--> A7 release preflight (#56)
                         |
                         v
        exact accepted Nova A increment receipt
                         |
                         v
           B0 runner-native continuation
                         |
             +-----------+-----------+
             v                       v
        B1 local pool             B3 Antigravity research
             |                       |
             v                       v
        B2 async/leases           B3 implementation
             |                       |
             +-----------> B4 GitLab
                         |
                         v
              frozen Nova-only candidate
                         |
                         v
                B5 synthetic macOS boundary
                         |
                         v
             #72 native Apple-Silicon follow-up
```

The diagram is precedence, not permission to run implementation packages
concurrently. Nova's implementation WIP remains one. Product runtime
concurrency is a separately measured capability.

## Cyborg and backlog boundary

- The 13 active Nova backlog reconciliations are sliced explicitly:
  - **Nova A:** `pipeline.execution-model-switchback`,
    `pipeline.multi-cli-efficiency-pilots`,
    `pipeline.closed-input-channel-review-economics`,
    `pipeline.evidence-bound-review-retry-economics`,
    `pipeline.codex-plugin-validator-host-parity`,
    `pipeline.codex-sandbox-critic-longterm`, and
    `pipeline.t1-governance-path-preflight`.
  - **Nova B:** `pipeline.afk-assumption-mode`,
    `pipeline.session-keep-awake`,
    `pipeline.nonblocking-interaction-continuity`,
    `pipeline.runner-native-continuation`,
    `pipeline.canonical-worktree-lifecycle`,
    `pipeline.po-gate-worktree-authority`, and
    `pipeline.project-scoped-github-issue-operations`.
- Cyborg is independently closable and is never a prerequisite for Nova A,
  Nova B or Nova Epic acceptance.
- Identical paths on independent branches are later merge collisions, not
  current execution collisions. Actual overlap in one workspace or global
  resource blocks work.
- This Nova repository owns the canonical backlog. Cyborg keeps the manual
  read-only mirror bound to transition head
  `36dd616d3aa5bc21e49e138f6b8a9a17a9de25321998304306e4fa47289de562`.
- The 13 Nova backlog items and six Cyborg backlog items are already
  `in_progress`; six future Nightwing/Phoenix items remain `open`; ten delivered
  items are `closed`.
- Issue `#57` is not fabricated into the ledger before the generic initializer
  exists. Its GitHub issue and this PRD are its current product authority.
- Cyborg delivery returns item ID, Spec, candidate and evidence to this
  repository. Canonical status changes occur only here through the sanctioned
  writer.
- Combined Nova/Cyborg code integration is a separate post-Sprint lifecycle
  using exact accepted Results and fresh integrated gates.

## Branch and authority policy

- Nova's current bounded pre-rebase working base is delivered and closed
  `v0.4.6` at the exact commit/tree named above. It authorizes only
  conflict-independent packages with an exact protected-path-negative
  write-set.
- Nova does not merge, rebase or cherry-pick `main`, Cyborg or another Sprint
  before the stable 0.4.7 rebase decision.
- Once `main` exposes the stable accepted 0.4.7 baseline, an explicit rebase
  onto its exact commit/tree is mandatory before protected-path
  implementation, increment acceptance, final candidate evidence and full
  readiness approval.
- Shared behavior comes only from the released base or a separately approved
  common-contract lifecycle.
- The Nova branch is an explicit feature-branch disposition for this Epic;
  this PRD does not silently rewrite global project calibration.
- PRD approval resubmits ADR-0043 only for Nova membership: the exact 16 Issues
  above replace its earlier allocations. It explicitly removes `#63` from
  Nova ownership while retaining `#15`, `#49` and `#60` under their current
  narrowed/current Issue details. ADR-0043's independent-closability rules
  remain.
- PRD approval does not supersede ADR-0044. Any production execution,
  remote/credential or additional state-authority boundary needs the technical
  Spec and the explicit ADR decisions named above.

## Non-goals

- Unbounded or recursive agent spawning.
- Treating branch, worktree, process, runner or provider names as isolation.
- A second orchestrator, backlog, state, review, merge or release authority.
- Editing frozen V3 or v1 contracts in place.
- Importing or depending on unpublished Cyborg work.
- Provider-hosted elasticity or live credential use without its activation
  gate.
- An independent watchdog, periodic recovery polling, host restart/replacement,
  multi-session writer election, automatic branch takeover or remote-worker
  supervision. Those remain the separate Execution Liveness Supervisor scope.
- Direct generic model APIs under the Antigravity issue.
- The broader onboarding UX, documentation information architecture,
  installer redesign, or other Nightwing work from `#61`.
- Universal safety, performance, runner parity, model identity or platform
  claims from synthetic/partial evidence.
- Closing an issue or backlog item merely because adjacent code or a Spec file
  exists.

## Success measures

- All 16 Issues have non-vacuous acceptance and exact evidence disposition;
  incomplete criteria keep the issue and Epic open unless the PO explicitly
  changes scope.
- 100% of advertised runner, sandbox, worker, forge and platform cells have a
  versioned conformance status and evidence reference.
- Zero unknown, unavailable, cancelled, expired, stale, malformed or
  completed-but-undelivered states project success.
- A byte-equivalent deterministic invocation or selected-sandbox failure
  launches at most once per valid fingerprint/retry authority.
- Every ready but unselected package has a deterministic dependency, path,
  resource or capacity reason.
- Reserved control/review capacity is never consumed by worker admission.
- Benchmark reports preserve unknown usage as unknown and compare against an
  immutable serial baseline.
- Review lineages cannot silently exceed their existing course budgets.
- Every external mutation is exact-target, confirmed against its preview,
  idempotent and read back.
- Every accepted delivery produces or advances an authorized canonical
  backlog transition with exact readback.
- Nova's narrowed `#49` disposition binds the exact frozen Nova candidate,
  preserves only synthetic/non-native claims and identifies `#72` as the sole
  native Apple-Silicon lifecycle.

## Principal risks and stop conditions

| Risk or stop condition | Required response |
| --- | --- |
| Mega-diff or circular A/B dependency | Preserve serial issue slices and immutable Nova A receipt; stop on a reverse dependency. |
| Canonical backlog or Spec drift | Invalidate the delivery preview and regenerate from current authority. |
| Cyborg byte/resource collision | Continue Nova-only work if independent; serialize only the actual shared integration/resource. |
| In-place frozen schema change | Stop for versioned companion contract or explicit ADR. |
| Unbounded execution/credential/target | Stop before launch or mutation. |
| Missing positive assurance | Advertise no capability; never downgrade silently. |
| Repeated deterministic failure or exhausted review budget | Stop at the typed course/PO gate. |
| Final candidate changes after native/gate evidence | Invalidate and rerun the affected evidence. |
| Any path can project false success | Block the affected increment. |

Each implementation slice must be additively revertible. Rollback reverts the
slice and invalidates its candidate-bound evidence; append-only Results and
historical evidence are never rewritten.

## Alternatives considered

| Alternative | Decision |
| --- | --- |
| One unsliced Nova implementation wave | Rejected: unreviewable, circular and weakly attributable. |
| Separate Epics for every issue | Rejected: duplicates lifecycle authority and obscures the common product outcome. |
| Move all remote/provider work out of Nova | Rejected by the retained PO scope; instead it is isolated behind Nova B activation gates. |
| Require Cyborg completion before Nova acceptance | Rejected: contradicts independent Sprint closure. |
| Let each runner maintain its own canonical backlog | Rejected: creates split-brain ledger state. |
| Infer completion from issue labels, branches or file presence | Rejected: none is delivery evidence. |

## PO decisions recorded

The PO approvals recorded on 2026-07-30 mean:

1. the exact 16 current `sprint:nova` Issues remain in one Nova Epic;
2. Nova A contains nine foundation Issues and Nova B seven bounded
   continuity/scale/portability
   issues as listed above;
3. `#57` is the first quality foundation and this repository remains the sole
   canonical backlog authority;
4. Nova B starts only from an exact PO-accepted Nova A increment receipt;
5. Nova remains independently closable without any unpublished Cyborg input,
   and combined integration occurs only after both Sprint Results;
6. the ADR-0043 Nova membership resubmission and the explicit feature-branch
   disposition are accepted while ADR-0044 remains in force;
7. bounded pre-rebase implementation may proceed only for exact write-sets
   disjoint from Bootstrap, installation, runtime-readback and V4/#63
   recovery;
8. stable `main` 0.4.7 plus an exact Nova rebase, conflict disposition and
   regenerated bindings remain mandatory before protected-path work,
   increment acceptance and final candidate evidence;
9. live Antigravity/GitLab/external execution requires the later research,
   Spec, ADR, credential and mutation gates described above; and
10. the high-risk Advisor attempt is accepted only as typed unavailable under
    an explicit PO exception; no Advisor answer, model identity or sandbox
    success is claimed.

This decision authorizes the bounded lane above, not merge, push, release,
issue closure or a waiver of the later 0.4.7 rebase/readiness gate.
