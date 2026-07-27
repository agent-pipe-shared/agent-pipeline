# Nova B plan — Scale and Portability

## Entry gate

- Nova A has one exact accepted product commit/tree, immutable increment
  receipt, independent `E1` readback, structurally gate-only `E1`/`E2` tail,
  append-only Result, green Verify/Security, accepted fresh Critic disposition
  and explicit PO activation.
- Nova B uses that exact accepted product candidate as product base and the
  validated `E2` evidence descendant as branch continuation head.
- No unpublished Cyborg dependency is introduced.
- External hosts, credentials and mutations remain opt-in and separately
  authorized.
- **B0 exception (historical, superseded):** the temporary exception allowing
  a `0.4.3`-based branch while `0.4.4` was pending is complete. Nova is now
  adapted on the delivered and closed `v0.4.6` base. B1–B6 retain only their
  Nova integration gates; no `0.4.x` release, installation, or pipeline-start
  gate is reopened by this plan.

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

**Phase exit:** after ADR-0048 is durably present, implementation may resume
under this same PO instruction. The design phase is not a live worker
activation.

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

**Outcome:** add external/asynchronous execution only through the accepted
execution-plane contract and short-lived bounded authority.

**Stop:** any need to persist secrets, expose private coordinates, let a worker
widen scope or treat provider attestation as Pipeline acceptance.

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

## Slice B3-I — Antigravity with Gemini models implementation

**Entry:** B3-R is approved and either accepted B2-I leases or a separately
approved operator-local authentication boundary is available.

**Outcome:** one post-V3 runner adapter with only certified capability cells.

**Order:**

1. adapter invocation/cancel/result/usage contract;
2. synthetic fixtures;
3. `#7` conformance;
4. opt-in live capability observation; and
5. existing Claude/Codex regression.

## Slice B4 — GitLab forge adapter

**Issue:** `#51`

**Outcome:** provider-neutral forge contract, GitHub mapping and GitLab.com /
Self-Managed adapter while Git remains the VCS.

**Dependency:** accepted B2-I leases or a separately approved operator-local
authentication boundary precedes live access or mutation.

**Order:**

1. forge capability and neutral vocabulary;
2. GitHub reference mapping;
3. GitLab target/auth capability discovery;
4. issue/change-request/CI read contracts;
5. exact preview, matching confirmation, idempotent mutation, partial outcome
   handling and exact readback;
6. governance/tier capability matrix; and
7. conformance/privacy/rate-limit/partial-success fixtures.

**Stop:** ambiguous host/project, token exposure, silent weaker control or
provider-specific field leakage into the core contract.

## Slice B4R — V4 recovery deadlock correction

**Issue:** `#63`

**Risk:** P0/M release blocker

**Entry:** delivered/closed `v0.4.6` basis and completed B4 local contract work

**Exit:** complete closed recovery actions plus exact-candidate gate evidence

1. bind Issue `#63` into PRD, Spec, Acceptance, backlog binding and lifecycle;
2. add a read-only source recovery planner that distinguishes invalid
   authority, recognized stale projection, unsupported transition and
   unavailable evidence;
3. add an absent-manifest-only repair plan bound to current raw source,
   preimage, postimage and canonical plan digests;
4. require explicit confirmation, atomic no-replace publication,
   publication-boundary drift quarantine and V4 readback for the sole manifest
   writer; retain every existing manifest byte under its owning workflow;
5. authorize only the exact read-only V3 validator and new planner argv before
   readiness, plus the exact digest-bound manifest apply;
6. retain arbitrary pre-ready write denial and add hostile root/argv/chaining
   fixtures in both lifecycle guard and outer Codex adapter;
7. prove process-level `ready -> recovery -> ready` flows through shipped CLIs;
8. run focused tests, Full Verify, blocking Security and fresh independent
   Critic on the exact candidate; and
9. only after a real delivery merge commit exists, comment `#63` with that
   commit and the relevant exact-candidate verification readback.

The broader onboarding/documentation/installer program from `#61` is outside
B4R and remains in its separate Nightwing scope. B4R performs no push, merge,
release, Issue closure or external comment before its actual references exist.

## Slice B5 — Nova-only candidate assembly and freeze

**Outcome:** assemble all accepted Nova A/B slices into one exact Nova-only
candidate before any native or final gate evidence.

**Checks:**

- complete 17-issue acceptance mapping;
- no reverse dependency on unpublished Cyborg bytes;
- exact backlog reconciliation previews from the current canonical head;
- focused tests and candidate inventory; and
- candidate commit/tree freeze.

**Stop:** any remaining implementation mutation, missing issue criterion,
unresolved authority drift or required Cyborg input.

## Slice B6 — Native macOS acceptance and Epic close

**Issue:** `#49`

**Outcome:** Apple Silicon native acceptance for the exact frozen Nova-only
candidate.

**Order:**

1. support matrix and clean-host procedure;
2. deterministic native fixtures;
3. bootstrap/setup/idempotent re-entry;
4. full lifecycle with supported runners;
5. Full Verify, Security, Critic/Close;
6. interruption/cancel/recovery/cleanup;
7. evidence sanitization and candidate binding; and
8. public support/limitations documentation.

**Stop:** undocumented repair, secret/private data in evidence, candidate drift
or substitution of hosted CI for native evidence.

The exact B5 candidate receives native lifecycle, Full Verify, Security,
independent high-risk Critic and PO acceptance without a gate- or
runtime-affecting byte change. The close tail may add only append-only evidence
that binds the frozen candidate; any relevant byte change invalidates and
reruns the applicable gates.

Every one of the 17 issues receives its own evidence disposition. Any
incomplete criterion keeps the issue and Epic open unless the PO explicitly
changes scope. Canonical backlog transitions use the sanctioned ledger writer
only after exact closure evidence exists.

Nova/Cyborg reconciliation is not part of this close. It is a separate
post-Sprint integration lifecycle after both independently accepted Results.
