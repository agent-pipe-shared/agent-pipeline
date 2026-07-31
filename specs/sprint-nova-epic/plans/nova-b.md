# Nova B plan — Scale and Portability

## Entry gate

- Nova A has one exact accepted product commit/tree, immutable increment
  receipt, independent `E1` readback, structurally gate-only `E1`/`E2` tail,
  append-only Result, green Verify/Security, accepted fresh Critic disposition
  and explicit PO activation.
- Nova B uses that exact accepted product candidate as product base and the
  validated `E2` evidence descendant as branch continuation head.
- No unpublished Cyborg dependency is introduced.
- The branch is rebased onto the exact Product-Owner-identified stable `main`
  0.4.7 commit/tree; conflicts are dispositioned against the 17-Issue scope,
  affected bindings are regenerated and upstream #63 regressions pass without
  a Nova delivery claim.
- External hosts, credentials and mutations remain opt-in and separately
  authorized.
- The PO-approved pre-rebase lane applies first to Nova A only. Nova B retains
  this full entry gate because its activation depends on the exact accepted
  Nova A receipt.
- **B0 exception (historical, superseded):** the temporary exception allowing
  a `0.4.3`-based branch while `0.4.4` was pending is complete. Nova is now
  historically adapted on `v0.4.6`; that fact is superseded as an Execution
  basis by the mandatory stable 0.4.7 rebase. B1–B6 retain only their Nova
  integration gates.

## Slice B0 — Runner-native continuation baseline

**Issue:** `#60`

**Outcome:** bind every active executable Pipeline work item to a bounded,
provider-neutral continuation contract and project it into the supported native
goal mechanism of Codex and Claude Code. This is a runner integration, not a
watchdog, external supervisor or permission grant.

**Order:**

1. derive a generation-bound goal from active feature/phase, approved plan,
   executable work item, acceptance criteria and required evidence;
2. persist typed lifecycle/progress/readback evidence without raw prompts or
   private host text;
3. activate and read back Codex, then Claude Code, native goals using their
   supported host interfaces;
4. retain the same goal and generation on resume and compact re-entry while
   the same item remains active; only a recorded PO-gate resolution may create
   its successor;
5. pause/clear it for a named PO gate, restore it only after recorded gate
   resolution, and honour explicit pause/cancel/replace/redirect first; and
6. run cross-runner fixtures for premature completion, intermediate questions,
   PO wait/resume, typed blocker, explicit control, compact/resume, read-only
   progress, successful completion and unsupported capability.

**Terminal contract:** only verified durable completion, named PO gate, typed
blocker, or explicit user control may end an active goal. Intermediate input
is answered/recorded and continuation resumes. Unsupported capability produces
typed degraded evidence and leaves no false continuation claim.

**Codex blocked-goal rule:** a native `blocked` observation stops automation and
must explicitly tell the user that CLI resume is required; it cannot be
silently replaced or resumed by the Pipeline. Resume applies only if the same
blocker is resolved; a changed scope/objective requires `/goal <new objective>`.
The adapter accepts it as current evidence only after exact rendered-objective
and generation binding. A different blocked goal, or an active user-controlled
goal, is never overwritten and never becomes current continuation evidence.

**Long-running-goal boundary:** an ordinary resume or compact continuation is
not a new goal. The controller retains the already-bound active generation
without calling a native set operation. If an adapter is asked to set, its
readback must still match the exact rendered objective; a stale prefix-like
goal is typed unavailable rather than retained. A new native goal is permitted
only after a named PO-gate resolution has cleared its predecessor.

**Stop:** any implied permission expansion, duplicate native activation,
unbounded retry, unclear native-goal readback, conflict with Stop-hook context
protection, or a need for an external watchdog/recovery supervisor.

**Rollback and compatibility (PO-scoped, 2026-07-25):**

- `pipeline.runner-native-continuation.v1` is additive and has no pre-existing
  persisted consumer or migration target. An unavailable or incompatible
  runner continues to produce the typed degraded result; it does not change
  existing serial Pipeline execution or claim protected continuation.
- A defect is rolled back by one ordinary forward revert of the B0 code,
  schema, adapters and conformance fixtures as one unit. Any native goal that
  was actually set is first cleared through the same bounded adapter readback;
  no background worker, host restart, credential or repository permission is
  introduced by rollback.
- A schema or runtime change remains atomic: the closed JSON Schema, runtime
  validator and conformance corpus move together under a new version if their
  public record shape changes. The reverted or changed candidate receives a
  fresh Verify, Security and Critic tail; prior gate evidence is not reused.

The Product Owner authorized this limited plan addition explicitly: “B0 darf
`specs/sprint-nova-epic/plans/nova-b.md` für die begrenzte
Rollback-/Kompatibilitätsdokumentation ändern.” It does not authorize any
other B0 path, external integration, permission expansion or new supervisor.

## Design D1 — Executor, state and credential authority

**Outcome:** after Nova A acceptance, convert
`design/execution-state-authority-proposal.md` into a separately approved ADR
with a serialized ADR number and exact machine-local path/source/test manifest.

**Stop:** no lawful authority class/root, ambiguous owner recovery,
repository-local secret/state persistence, frozen-boundary widening or missing
platform durability semantics.

**Rollback:** one ordinary forward revert of the complete ADR-0047 D1 manifest
after a fresh Verify, Security and Critic tail. It neither deletes a broad
machine-local path nor signals a process; any candidate-bound local state is
left for a separately authorized, exact-manifest cleanup decision.

## Slice B1-C — Resource-aware local worker-pool contract

**Issue:** `#21`

**Outcome:** implement the pure pool/capacity reducer and synthetic fault
corpus without a production supervisor or durable state store.

**Order:**

1. pool/admission/capacity contracts;
2. serial and in-process reference adapters;
3. heartbeat, cancellation, timeout and orphan state fixtures;
4. stale-candidate/result-import handling; and
5. resource pressure/reservation tests.

## Slice B1-I — Local worker supervisor

**Entry:** ADR-0047 and ADR-0048 accepted with the exact source/test/path
manifest in ADR-0048.

**Outcome:** supervise separately bound local Goldfish workspaces within
deterministic capacity and authority limits, without inferring OS isolation.

**ADR-0047 repair hardening:** the B1-I correction may adjust only the
existing local-supervisor-state implementation and matching test to preserve
the accepted D1 authority boundary: current-user-owned, restrictive root and
direct files, no group/world-writable ancestor (including sticky paths), and
one-link regular state/journal/lock files. Any mismatch is typed unavailable or
recovery-required, never a create/noop/recover-owned success.

The published JSON Schema validates closed structural shape and all
representable constraints. The exported runtime validator is the canonical
semantic admission authority for ordering, uniqueness, digest and relational
timing rules. B1-I acceptance requires both results, and the combined public
contract must match supervisor admission over one shared conformance corpus.
Runtime safety is never weakened to obtain standalone Schema parity.

**Order:**

1. ADR-authorized workspace/process adapter;
2. heartbeat lease, cancellation, timeout and proven-owner orphan cleanup;
3. same-host runner-native fan-out baseline;
4. correct `N+1` local-pool observation; and
5. local-pool benchmark observation.

**Stop:** missing declared assurance evidence, uncertain cleanup ownership,
exhausted reserved capacity or inability to preserve serial semantics.

### 2026-07-26 PO exception and bounded design phase

The normal Codex Host Advisor did not return a valid
`pipeline.host-advisor-status.v1`. The PO explicitly authorized one fresh,
read-only fallback subagent. Its answer is design advice only: it is not a
Pipeline Advisor receipt, a gate decision, selected-sandbox evidence, an
OS-isolation claim or model-identity evidence. The regular bootstrap controls
read back technically healthy. The in-progress ADR initially exposed only the
expected document-inventory and PRD/Spec-digest mismatches; the PO then
authorized exactly those two manifest corrections. This is an
Advisor-attestation exception, not a repair of or bypass around a failed
pipeline implementation.

The PO explicitly confirmed the main session as `gpt-5.6-sol / xhigh`, inserted
this bounded Epic design phase and authorized the sole active Codex session to
own the exact ADR-0048 20-path manifest directly. This is the recorded
EL-01/EL-16 exception. It grants no worker delegation, external execution,
broker, credential, network, merge, push or release authority.

The ordered goals for this phase are:

1. accept ADR-0048 and freeze its exact manifest;
2. implement real independent local Git clones and real child processes;
3. bind capacity, owner, lease, heartbeat, candidate, write set and result
   import fail closed;
4. prove no-hardlink overlap, explicit cancellation, timeout, source drift,
   ignored unauthorized output, crash recovery classification, restart and
   exact-owner cleanup with local fixture processes;
5. implement but do not activate the fixed Codex `exec` provider adapter;
6. run focused suites plus Full Verify and Security; and
7. leave live Goldfish `N+1 >= 2` capability activation and Issue `#21`
   closure for a separately accepted observation.

**Deferred live-provider/capability risk disposition (B1-I):** Accountable
owner: the Nova Product Owner. Expiry: **2026-08-09**. Until that owner renews
or replaces this disposition with a separately accepted observation, the Codex
provider adapter remains inactive, B1 capability remains unadvertised, and
Issue `#21` remains open. This disposition authorizes neither activation nor
implementation, credentials, network access, issue closure, push or release.

**Phase exit:** ADR-0048 alone does not activate a live worker. Nova B starts
only after the stable 0.4.7 rebase, refreshed 17-Issue bindings, exact accepted
Nova A receipt and explicit PO activation. Bounded pre-rebase Nova A Execution
is not a live worker capability claim.

## Slice B2-C — Async execution and credential-lease contracts

**Issues:** `#16`, `#18`

**Outcome:** implement pure async/paused/reconciliation and lease validators
with synthetic brokers/jobs only.

**Order:**

1. async states and reconciliation;
2. pause/resume/duplicate/out-of-order/cancellation-race fixtures;
3. credential lease schema;
4. denial canaries and secret/privacy tests; and
5. synthetic combined adapter.

## Slice B2-I — Remote execution and broker integration

**Entry:** D1 ADR approved with exact remote/broker path manifest and separate
live-pilot authority.

**Design status:** ADR-0049 accepts the exact local B2-I contract manifest in
`design/b2-i-gitlab-ci-pilot.md`. It supplies no credential, CI job, provider
mutation, project-setting, branch or live-pilot authority.

**Local contract status:** implemented and Verify-registered as a token-free,
network-free broker reducer. It is not a provider capability or pilot result.

**Outcome:** add external/asynchronous execution only through the accepted
execution-plane contract and short-lived bounded authority.

**Stop:** any need to persist secrets, expose private coordinates, let a worker
widen scope or treat provider attestation as Pipeline acceptance.

**Rollback:** before any separately authorized live pilot, a B2-I contract
regression is rolled back by reverting the bounded local broker commit and
rerunning Full Verify and Security. The contract owns no provider state,
credential, migration or feature flag, so there is no remote or persisted
state to unwind. A live-pilot rollback, if later authorized, must be specified
in that pilot's own exact preview.

## Slice B3-R — Antigravity with Gemini models research decision

**Issue:** `#15`

**Outcome:** pin one Google runtime surface: the current official Antigravity
contract. Gemini appears exclusively as the model selectors available inside
Antigravity. The decision binds structured result/usage/cancellation
semantics and the authentication boundary, then obtains a separately bound
compatibility/ADR decision.

**Order:**

1. official source/version/auth/output research;
2. post-V3 migration and credential-boundary proposal;
3. exact supported/unsupported capability target matrix; and
4. separate PO approval or explicit deferral.

**Stop:** unavailable official contract, identity ambiguity that would be
reported as attested, unsafe authentication boundary or required in-place V3
edit.

## Slice B3-A — Antigravity third-runner Alpha boundary

**Issue:** `#15`; direct AGY follow-up: `#69` (`sprint:NONE`).

**Outcome:** register Antigravity visibly as the third-runner Alpha boundary,
backed only by the reviewed documentation decision. It returns a typed
fail-closed non-selection and keeps Gemini as the model family inside that
runner.

**Allowed:** descriptor, capability matrix, Alpha documentation and hostile
tests proving no AGY discovery/install/auth/network/invocation primitive.

**Stop:** any active runner profile/mapping, AGY execution, auth, network
access, capability certification, or claim that the direct runner is shipped.
Those belong solely to #69's later dedicated AGY sprint.

## External B3-I follow-up

Direct Antigravity invocation, cancellation, result, usage and live
conformance are not a Nova slice. They are owned exclusively by Issue `#69`
with `sprint:NONE` and require their own future lifecycle and authority.

## Slice B4 — GitHub/GitLab transport and forge adapter

**Issue:** `#51`

**Outcome:** one dual-provider Git transport plus provider-neutral forge
contract for GitHub and GitLab.com / Self-Managed. Git remains the VCS; the
forge layer owns provider project, issue, merge, CI, release and governance
semantics.

**Dependency:** accepted B2-I leases or a separately approved operator-local
authentication boundary precedes live access or mutation.

**Order:**

1. exact remote/target resolution and transport capability contract;
2. GitHub and GitLab reference mappings;
3. GitHub and GitLab target/auth capability discovery;
4. fetch/ref readback and bounded new-branch publication;
5. project/issue/change-request/merge/CI/release read contracts;
6. exact preview, matching confirmation, idempotent mutation, partial outcome
   handling and exact readback;
7. governance/tier capability matrix; and
8. conformance/privacy/rate-limit/partial-success fixtures.

**Stop:** ambiguous host/project, token exposure, silent weaker control or
provider-specific field leakage into the core contract.

## External 0.4.7 rebase gate (`#63`)

Issue `#63` belongs to `hotfix:0.4.7`, not Nova. Nova waits for the stable
`main` 0.4.7 commit/tree, rebases onto it, resolves conflicts, regenerates
bindings and reruns the upstream recovery regressions. Historical B4R design
and evidence are retained only for conflict analysis. Nova makes no #63
implementation, comment, closure or delivery claim.

## Slice B5 — Nova-only candidate assembly and freeze

**Outcome:** assemble all accepted Nova A/B slices into one exact Nova-only
candidate before any native or final gate evidence.

**Checks:**

- complete 17-Issue acceptance mapping;
- no reverse dependency on unpublished Cyborg bytes;
- exact backlog reconciliation previews from the current canonical head;
- focused tests and candidate inventory; and
- candidate commit/tree freeze.

**Stop:** any remaining implementation mutation, missing issue criterion,
unresolved authority drift or required Cyborg input.

## Slice B6 — Native macOS transfer disposition

**Issue:** `#49`; native follow-up: `#72` (`sprint:NONE`)

**Outcome:** retain the honest synthetic macOS contract while transferring the
Apple Silicon native acceptance to its dedicated follow-up.

**Order:**

1. record the unavailable-device condition and exact transfer target;
2. retain synthetic/non-native contract coverage plus the B49-7/B49-8
   keep-awake and continuation contracts in Nova;
3. bind the original Issue and #72 with the material-scope transfer rule; and
4. exclude every native Apple-Silicon completion claim from Nova close.

**Stop:** any claim that synthetic, Intel or hosted CI evidence closes #72, or
any attempt to reopen native execution without a fresh follow-up authority.

The exact B5 candidate receives the applicable Nova Verify, Security,
independent high-risk Critic and PO acceptance without a native macOS claim.
The #72 follow-up independently owns native lifecycle and Apple-Silicon
candidate evidence. The close tail may add only append-only evidence that binds
the frozen candidate; any relevant byte change invalidates and reruns the
applicable gates.

Every one of the 17 issues receives its own evidence disposition. Any
incomplete criterion keeps the issue and Epic open unless the PO explicitly
changes scope. Canonical backlog transitions use the sanctioned ledger writer
only after exact closure evidence exists.

Nova/Cyborg reconciliation is not part of this close. It is a separate
post-Sprint integration lifecycle after both independently accepted Results.
