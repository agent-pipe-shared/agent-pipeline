# Sentinel shared prerequisites and direct Codex Host-Advisor hotfix

**Status:** PO-approved execution delta, 2026-07-23
**Profile / phase:** `epic` / `execution_phase`
**Authority:** live GitHub Issues `#10` and `#27`, ADR-0041, ADR-0043, and
the PO instructions in the active session.

## Outcome

Deliver one candidate that:

1. avoids the repeatedly unavailable selected-sandbox advisory probe on Codex
   WSL hosts and exposes the already-authorized local `consult-advisor` lane;
2. satisfies the live least-privilege GitHub Actions contract in Issue `#27`;
3. freezes the minimum provider-neutral control/execution exchange required by
   live Issue `#10`; and
4. remains a Sentinel prerequisite candidate, not a release, Issue closure,
   Windows `#34`–`#37` closure, or Epic-close claim.

Existing implementation is authoritative input. A package must extend or bind
an existing primitive when it already satisfies an acceptance criterion; it
must not introduce a parallel implementation of the same contract.

## Package A — direct Codex host-advisor hotfix

### Acceptance criteria

- This PO-approved delta amends ADR-0041 for every Codex session: when
  Advisory is eligible and export is permitted, the project-scoped host
  consult is the normal Codex advisory route rather than a fallback.
  ADR-0041 must record the amendment before the runtime methodology consumes
  it.
- WHEN the validated profile is `epic` or `feature` and
  `advisor_export.consent` is absent or `approved`, THEN bootstrap/advisory
  selects exactly one project-scoped `consult-advisor` child immediately,
  before any selected-sandbox, App-Server, native adapter, or other advisory
  probe.
- WHEN `advisor_export.consent` is absent, THEN the configured default permits
  the bounded advisor and the session must not ask for per-run consent. WHEN
  it is `declined`, THEN Advisory is disabled before any probe, child, export,
  or receipt. `mini` remains disabled by profile.
- The model-free route authority is
  `plugins/pipeline-core/scripts/codex-host-advisor-route.mjs`. It consumes the
  closed resolved input `runner`, `profile`, and `consent`, where `runner` is
  `codex`, `profile` is `epic|feature|mini`, and `consent` is
  `default|approved|declined`. Its result is exactly
  `host-bound-consult|disabled-no-consent|disabled-by-profile`; malformed or
  non-Codex input fails closed. It never inspects platform class and never
  selects a sandbox/native route.
- The direct Codex route uses `sandbox_mode = "read-only"`, one supplied
  question, no inherited chat/handover/memory, no
  repository mutation, no separate network-tool/third-party export, and no
  auto-apply.
- The frozen V3 advisory registry is amended only for Codex:
  `adapter = "host-consult"`, `isolation = "project-read-only"`,
  `evidence = "host-advisor-status"`, and
  `status = "pipeline.host-advisor-status.v1"`. The existing top-level
  `pipeline.advisory-receipt.v1` and Claude evidence/fallback chain remain
  Claude authority. `pipeline.user.yaml` must project the amended exact Codex
  cell; no Codex success rule may still require an advisory receipt.
- WHEN the host consult answers, THEN it satisfies the normal Codex Advisory
  gate as `host-bound-consult` and every claim retains:
  `no attested selected-sandbox execution; OS isolation and model identity are
  not asserted`.
- The sole success evidence is a sanitized
  `pipeline.host-advisor-status.v1` record. Its exact top-level fields are
  `schema`, `candidate`, `launch`, `questionSha256`, `answerSha256`, `attempt`,
  `boundary`, and `outcome`. `candidate` contains exact full Git `commit` and
  `tree`; `launch` contains exactly `sessionId` and `launchId`, where
  `launchId` is a fresh coordinator-generated 64-hex nonce for this one
  advisory attempt; `attempt` contains exactly `agentName`, `count`, and `terminal`;
  `boundary` contains exactly `sandboxMode`, `workspaceBeforeSha256`,
  `workspaceAfterSha256`, `selectedSandboxAttempts`, and
  `nativeAdapterAttempts`. `agentName` is `consult-advisor`, `count` is `1`,
  `sandboxMode` is `read-only`, and both attempt counters are `0`.
  `outcome`/`terminal` are the matching value
  `answered|failed|unavailable`; only `answered` has a non-null answer digest
  and requires identical before/after workspace digests. The record asserts
  neither model identity, OS isolation, nor absence of unobserved network
  activity and is not a `pipeline.advisory-receipt.v1`.
- The authorized data boundary is the existing configured export of the one
  question plus allowlisted repository evidence to the configured Codex
  provider. The agent receives no authority for a separate network tool or
  third-party export; any observed such use invalidates the pass, while the
  status record makes no unobservable no-network claim.
- The record validator is owned only by
  `plugins/pipeline-core/lib/host-advisor-status.mjs` and its closed JSON
  schema `plugins/pipeline-core/scripts/host-advisor-status.schema.json`.
  Bootstrap/advisor methodology constructs the status from the one
  runner-native child completion plus model-free pre/post workspace digests;
  the advisor itself cannot self-assert success or change a gate.
  `validateHostAdvisorStatus` also requires the separately supplied
  `expectedCandidate` (`commit`, `tree`), `expectedLaunch` (`sessionId`,
  `launchId`), and `expectedQuestionSha256` and rejects any status whose
  candidate, one-use launch nonce, session, or question binding differs. A
  structurally valid older status therefore cannot be replayed even when its
  candidate and question are unchanged.
- Workspace observations are produced only by the model-free
  `plugins/pipeline-core/scripts/host-advisor-workspace.mjs` before launch and
  after child completion. It resolves the physical Git top level, requires it
  to equal the governed project root, and hashes
  `"pipeline.host-advisor-workspace.v1\0" + canonicalJson(manifest)`.
  `manifest` contains exactly `headCommit`, `headTree`, and `entries`.
  `entries` are bytewise path-sorted records for the union returned by
  `git ls-files --cached --others --exclude-standard -z`; each record contains
  exactly `path`, `indexMode`, `indexOid`, `worktreeKind`, `worktreeMode`, and
  `contentSha256`. Cached index mode/OID come from
  `git ls-files --stage -z`; absent values are `null`. Worktree kind is
  `regular|symlink|missing`; mode is the normalized executable/symlink mode;
  content digest covers exact regular-file bytes or exact symlink-target
  bytes, and is `null` only for missing. Invalid UTF-8, traversal, path
  aliases, physical escape, unsupported file kinds, duplicate paths, Git
  command failure, or changed HEAD during observation fails closed.
  `canonicalJson` recursively sorts object keys, preserves entry order, emits
  ordinary JSON scalars without whitespace or trailing newline. Ignored files
  and Git-internal metadata are explicitly outside the governed workspace;
  the advisor receives neither as input. The sanitized status is created only
  after the post-observation and is retained outside the worktree.
- WHEN the host consult is absent, fails, changes the workspace, uses an
  observed external network/export tool, or retries, THEN no advisory success
  is claimed and there is no selected-sandbox/native/other fallback.
- The project V3 runtime projection owns
  `.codex/agents/consult-advisor.toml`; no handwritten untracked agent
  registration or plugin-only Markdown definition may substitute for it.
- The new manifest target is exactly
  `projection: "codex-advisor-agent-v3"`,
  `cell: { "kind": "duty", "dutyId": "advisory" }`, and owns the complete
  top-level key set `name`, `description`, `model`,
  `model_reasoning_effort`, `developer_instructions`, and `sandbox_mode`.
  It renders the existing `routing.duties.advisory.codex` selector and effort,
  fixes `name = "consult-advisor"` and `sandbox_mode = "read-only"`, and
  generates the closed description/instructions required by this package.
  This is a V3-owned full-file projection added directly to the V3 plan; it
  must not be smuggled through the frozen V2 implementor/critic target list.
- Focused tests prove absent/approved consent routes Epic/Feature directly,
  declined/Mini disables before a child, no Codex selected-sandbox or native
  attempt precedes/follows the one host consult, the read-only custom-agent
  projection is exact, and no native/sandbox receipt is fabricated.
- This amendment changes only the Codex Advisory duty. Selected-sandbox
  policies for Codex readiness or Critic duties and all Claude Advisory
  fallback ordering remain unchanged.

## Package B — Issue #27 least-privilege Actions baseline

### Acceptance criteria

- `.github/workflows/verify.yml` declares workflow-level
  `permissions: { contents: read }` in YAML block form and checkout sets
  `persist-credentials: false`; immutable action SHA pins remain unchanged.
- Every repository workflow is checked deterministically for an explicit
  workflow- or job-level permission declaration.
- The checker rejects `write-all`, unexplained root-level write permissions,
  and checkout credential persistence without a narrow documented exception.
- The checker accepts a narrowly scoped, explicitly justified job-level write
  permission while keeping untrusted pull-request execution separate from
  privileged publication.
- `governance/github-actions-permissions.json` is the only repository exception
  authority. Its closed schema is
  `pipeline.github-actions-permissions.v1` with exactly
  `schema`, `jobWriteExceptions`, and `checkoutCredentialExceptions`.
  `jobWriteExceptions` entries contain exactly `workflow`, `job`,
  `permissions`, `justification`, `owner`, and `expires`;
  `checkoutCredentialExceptions` entries contain exactly `workflow`, `job`,
  `justification`, `owner`, and `expires`. Paths and job IDs are canonical,
  `permissions` is a nonempty sorted list of exact GitHub permission scopes,
  and `owner`/`expires` are mandatory. Expired, duplicate, wildcard, root-level,
  or pull-request-untrusted exceptions are invalid. The committed baseline has
  empty exception lists.
- Negative fixtures cover missing permissions, `write-all`, broad root writes,
  and unexplained persisted credentials; a positive fixture covers the narrow
  job-level exception by injecting a complete non-expired policy entry.
- The checker is registered in the single Verify gate. The PO-authorized TP-3
  lift may be used only while editing `harness/scripts/verify.mjs` and must be
  restored before staging.
- Maintainer documentation states that repository/organization token defaults
  are not a security boundary and documents the narrow permission exception
  path.
- No token, secret, authenticated fetch, publication job, or organization
  settings change is introduced.

## Package C — Issue #10 minimum control/execution exchange

### Acceptance criteria

- One accepted ADR compares serial execution, runner-native subagents, a
  supervised local Goldfish pool, provider-hosted async execution, external
  self-hosted/clustered execution, and no added integration.
- The ADR contains a threat model, sequence diagrams, failure modes,
  alternatives, a local-first capacity/isolation/reliability decision, the
  smallest reversible spike, and explicit rejection criteria.
- The Elephant remains the sole orchestrator. Workers cannot recursively gain
  implementation authority. External telemetry is observation only.
- PO gates, admission, mutation authority, deterministic verification,
  independent Critic review, candidate binding, cancellation, merge, release,
  and final acceptance remain control-plane authority.
- A single minimal provider-neutral contract binds package, base candidate,
  candidate commit/tree, invalidation, dispatch, worker, correlation, attempt,
  and parent-orchestration identity.
- The sole portable boundary is
  `pipeline.control-execution-exchange.v1`, owned by
  `plugins/pipeline-core/lib/control-execution-exchange.mjs` and its JSON schema
  `plugins/pipeline-core/scripts/control-execution-exchange.schema.json`. It is
  a validated immutable exchange DTO/projection, not a second state machine,
  dispatch writer, executor, or authority store.
- The closed top-level fields are exactly `schema`, `package`,
  `orchestration`, `event`, and `extensions`.
  `package` contains exactly `featureId`, `packageId`, `baseCommit`,
  `candidateCommit`, `candidateTree`, `queueRevision`, and
  `authoritySha256`, and `invalidation`; `orchestration` contains exactly
  `parentOrchestrationId`, `dispatchId`, `workerId`, `correlationId`,
  `attemptId`, and `mayDelegate`, where `mayDelegate` is always `false`.
- `package.invalidation` contains exactly `state`, `reasonCode`, and
  `supersededByQueueRevision`. `state` is `valid|invalidated`. A valid package
  requires both other fields to be `null`; an invalidated package requires
  `reasonCode` from
  `queue-advanced|authority-drift|base-drift|candidate-superseded|cancelled`.
  `supersededByQueueRevision` is `null` unless a higher queue revision caused
  invalidation.
- `event` contains exactly `class`, `status`, `observedAt`, and
  `evidenceSha256`. The normative class/status pairs are:
  `admission` → `admitted|rejected|unknown|unavailable`;
  `progress` → `running|blocked|unknown|unavailable`;
  `terminal` → `succeeded|failed|cancelled|unknown|unavailable`;
  `cancellation` → `requested|acknowledged|rejected|unknown|unavailable`;
  `verification` → `passed|failed|unknown|unavailable`; and
  `review-handoff` → `ready|rejected|unknown|unavailable`.
  `unknown` and `unavailable` are never success.
- The sanitized exchange supports exactly these lifecycle classes:
  `admission`, `progress`, `terminal`, `cancellation`, `verification`, and
  `review-handoff`; unknown/unavailable are explicit non-success states.
- Isolation, credentials, messaging, event projections, remote execution, and
  result import are extension points only through declared namespaced
  capability fields below `extensions`. Extension keys match
  `^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$`; values are JSON data.
  `plugins/pipeline-core/config/control-execution-extension-namespaces.json`
  is the sole namespace registry with schema
  `pipeline.control-execution-extension-namespaces.v1` and exactly
  `schema` plus `namespaces`. Its initial sorted closed list is:
  `pipeline.credentials`, `pipeline.event-projection`,
  `pipeline.isolation`, `pipeline.messaging`,
  `pipeline.remote-execution`, and `pipeline.result-import`.
  Unknown namespaces fail validation; no provider/product-specific core field
  or undeclared extension key is accepted.
- Deterministic fixtures prove that Phoenix can consume the minimum contract
  without unpublished `#14`, and Nova can consume it without the richer `#17`
  replay model.
- The accepted ADR assigns admission identity as follows:
  the Elephant/control plane creates
  `parentOrchestrationId`, `workerId`, and `correlationId` once before worker
  admission; Git supplies the explicit `baseCommit`, `candidateCommit`, and
  `candidateTree`; the active continuity binding supplies
  `featureId`, `packageId`, `dispatchId`, `attemptId`, `queueRevision`,
  `mayDelegate`, and the canonical digest collapsed into `authoritySha256`.
  `authoritySha256` is exactly the lowercase hexadecimal SHA-256 of the UTF-8
  bytes of
  `"pipeline.control-execution-authority.v1\0" + canonicalJson({authorityDigests,
  routeRequestSha256})`, where `authorityDigests` contains exactly
  `prdSha256`, `resultSha256`, and `specSha256`. `canonicalJson` recursively
  sorts object keys lexicographically, preserves array order, uses ordinary
  JSON scalar encodings (including the literal `null`), emits no insignificant
  whitespace, and has no trailing newline. This binds the complete existing
  continuity authority digest set and route request while deliberately
  excluding newly assigned orchestration identities.
- The three admission-authority inputs are named exactly:
  `continuityState` (the validated active state, including its active
  `queueHead` and `queueHead.dispatch`), `gitBinding` (exactly `baseCommit`,
  `candidateCommit`, and `candidateTree`), and `orchestrationAssignment`
  (exactly `parentOrchestrationId`, `workerId`, and `correlationId`).
  Event and extension data are separate projection payloads, not admission
  identity inputs. The constructor invokes the existing continuity validator
  and requires a non-null active dispatch; it then requires
  `dispatch.packageId === queueHead.packageId`,
  `dispatch.actionId === queueHead.actionId`,
  `dispatch.queueRevision === continuityState.revision`,
  `dispatch.featureId === continuityState.featureId`, and every authority
  digest to equal the active state authority. It preserves an allowed nullable
  `resultSha256` as JSON `null` in the hash input. If the delivered continuity
  validator already enforces these comparisons, the package adds regression
  evidence and reuses it; it must not implement a parallel continuity
  validator. Any disagreement or missing fact is rejected rather than
  synthesized.
  The resulting immutable exchange snapshot is the portable authority for
  those newly assigned orchestration identities.
- `workflow-runner-boundary` remains the authority for observed runner
  outcomes, which may be projected only into the matching event class/status.
  The new module must not write continuity, inspect Git by itself, replay,
  cancel, retry, or independently advance either source state. No executor,
  remote worker pool, provider adapter, or production integration is added.

## Candidate and evidence gates

- Each package runs focused tests before the next package starts.
- The combined candidate runs `node harness/scripts/verify.mjs`, the configured
  Security gate, `git diff --check`, and an independent fresh-context Critic.
- TP-1 through TP-5 may be lifted only for the exact protected path during its
  edit and must be restored byte-for-byte before staging, commit, or push.
- The final candidate is pushed only after all gates pass and is read back from
  the remote at the exact commit OID.
- `VERSION` remains `0.2.0`; `0.4.0` is the already-selected later HAW-E target,
  and `0.4.1` remains reserved for the fully closed Sentinel sprint. This
  prerequisite package creates no tag, GitHub Release, Issue close, backlog
  transition, or Epic-close claim.
