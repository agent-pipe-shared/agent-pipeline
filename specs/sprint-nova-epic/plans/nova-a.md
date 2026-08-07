# Nova A plan — Foundation and Reliability

## Entry gate

- The prior PRD/Spec approval is revoked; revised 17-Issue authority and a new
  readiness/PO gate are required before implementation resumes.
- Branch remains `feat/sprint-nova-codex-v046` and has adopted released
  `v0.4.7` commit `89cb12b99e3fd86ac44878d0c23b278f00538921`, tree
  `b6537dcaa7bee526d9a393e2603b28648f4b0438`, through the reviewed R0 rebase
  record. A new Execution approval still requires the revised authority bytes.
- Issue `#98` is a P0 blocker and composes `#54`, `#56`, the released
  publication authority/executor and the one configured Verify command.
- The package has exact Nova write paths/resources and does not share a
  physical workspace or global runtime resource concurrently with Cyborg.
- Implementation is dispatched to a fresh Goldfish; the Elephant does not
  implement production code.

## Closed pre-rebase execution lane

The former bounded lane is closed by the 2026-08-01 plan revocation. Its local
commits and focused evidence are inputs to R0 impact analysis only. No new
implementation dispatch occurs until the revised design is approved and the
exact `v0.4.7` rebase is recorded.

Pre-rebase focused tests are useful implementation evidence but not final
increment evidence. The rebase impact review explicitly reruns or invalidates
them before Nova A acceptance.

## Standing TP authorization

The PO grants a reusable Nova-only authorization through formal Nova close for
temporary TP-1 through TP-5 lifts. Every use remains bound to one exact task
and write-set and creates its required audit record. No other guard is covered;
test/gate semantics may not be weakened; and the exact lifted protection is
restored before candidate gates, push/publication and Nova close. This removes
repeat approval prompts but does not leave the protections continuously disabled.

## Design D0 — Boundary freeze and test inventory

**Outcome:** before the technical Spec/readiness gate, turn the approved PRD
into exact package briefs, filenames, producers/consumers, state/projection
tables, path/resource ownership, schema names, digest rules, test commands and
ADR decisions.

**Deliverables:**

- source/test path manifest;
- schema/version registry;
- focused test inventory;
- Nova physical-resource check and later-integration collision inventory;
- ADR reservation for foundational decisions; and
- readiness report.

**Stop:** any unresolved frozen-schema edit, shared-path conflict or missing
acceptance mapping.

## Slice A1 — Canonical delivery/status reconciliation

**Issue:** `#57`

**Outcome:** one sanctioned, append-only, idempotent Spec-to-delivery-to-backlog
transition path and byte-bound parallel-runner snapshot.

**Order:**

1. delivery binding and generic item-initialization contracts;
2. preview/CAS/authority and collision checks;
3. atomic item/ledger/index/STATUS writer transaction;
4. interruption recovery and exact readback;
5. append-only evidence repair for events 39/40; and
6. create/read back the canonical #57 item through the new initializer.

**DoD:**

- NVA-A57 criteria pass;
- the default backlog checker is green;
- no prior ledger event byte changed; and
- Nova/Cyborg snapshots bind identical canonical content while authority
  remains singular.

## Slice A2 — Capability and selected-sandbox foundation

**Issues:** `#7`, `#29`

**Outcome:** one runner-capability report contract and one fingerprinted,
no-repeat selected-sandbox disposition used by deterministic fixtures. The
closed compatibility policy is semantic-class based; volatile Codex version
and binary identities are accepted only from the same fresh, integrity-bound
preflight receipt and are never static policy pins.

**Order:**

1. capability schema/validator and synthetic runner fixtures;
2. selected-sandbox fingerprint/disposition;
3. nonce-bound positive selected-child receipt plus no-child/wrong-child/
   replay negative corpus;
4. invalidation/force-reprobe and assurance projection;
5. integrate sandbox cases into conformance; and
6. focused privacy/fuzz tests.

**DoD:**

- NVA-A7 and NVA-A29 criteria pass;
- no native success is inferred from CAS health or fallback;
- usage, cost and actual assurance remain observed or typed unavailable, with
  #75 owning shared taxonomy, denominators and aggregation;
- terminal probe repeats are prevented per fingerprint; and
- no shared Verify registration yet.

## Slice A3 — Invocation reliability

**Issue:** `#38`

**Outcome:** closed invocation/preflight/attempt contracts plus session-scoped
one-probe resolution memory.

**Order:**

1. invocation contract registry;
2. request builder and chain validator;
3. attempt/failure taxonomy;
4. atomic session resolution memory;
5. recurrence summary and remediation candidate; and
6. privacy/cardinality/property tests.

**DoD:**

- corrected, unchanged-invalid, unavailable, denied, transient, malformed and
  internal-failure histories reconcile exactly;
- concurrent duplicate probes are prevented;
- no workaround becomes authority; and
- `pipeline.dispatch-provenance` is mapped but not closed without evidence.

## Slice A4 — Execution contract and scheduling lifecycle

**Issues:** `#14`, `#12`

**Outcome:** a versioned execution-plane companion and deterministic
planner-to-executor handoff without worker launch.

**Order:**

1. execution request/state/cancel/result schemas;
2. synthetic adapter and outcome normalization;
3. planner receipt binding and lifecycle replan;
4. immutable in-process fixture consumer from ADR-0044; and
5. stale/replay/cancel/failure tests.

**Threat model:** `docs/nova-execution-plane-threat-model.md` is updated with
every A4 subject, authority, state-chain and verifier trust-boundary change.

**DoD:**

- frozen exchange and planner algorithm stay unchanged;
- every handoff binds authority/candidate/dispatch;
- no execution/provider/state store is hidden in the planner; and
- all false-success negative cases pass.

## Slice A5 — Critic convergence

**Issue:** `#54`

**Dependencies:** accepted A2 and A3 contracts.

**Outcome:** preflight-valid Critic requests, complete first-pass coverage and
bounded delta review lineages.

**Order:**

1. read-only dispatch admission that binds candidate paths/evidence and derives
   required governance before a Critic slot is consumed;
2. request compiler/admission;
3. coverage and verdict contracts;
4. finding lineage;
5. delta/impact invalidation;
6. hard review/correction course budgets; and
7. reconciliation fixtures for the named backlog items.

**DoD:**

- valid `No findings` is distinct from every transport/failure class;
- fresh Critic independence remains unchanged;
- omitted governance, missing candidate paths and unbound fresh evidence fail
  before dispatch rather than consuming a Critic slot;
- broad rerun requires typed invalidation; and
- Nova supplies Critic request/convergence/delta inputs without claiming
  #75's cross-runner reporting scope; and
- budget exhaustion stops at a PO gate.

## Slice A6 — Benchmark and release preflight

**Issues:** `#8`, `#56`

**Outcome:** freeze reproducible scoring and detect deterministic release gaps
before final gates.

**Order:**

1. fixture/task/scoring schema;
2. serial and runner-native benchmark baselines;
3. stage/usage/intervention reporting;
4. release-preflight local contract;
5. GG-03, documentation, retention and version fixtures; and
6. Cyborg extension registration boundary.

**DoD:**

- unknown usage remains unknown;
- no universal performance claim is made;
- preflight `ready` is not a final gate pass; and
- Cyborg output is neither guessed nor imported.

**Compatibility and rollout:** `pipeline.multi-cli-benchmark.v1` is a new,
unmerged Nova-A contract. The in-repository compiler and its focused suite are
the only current consumers; no persisted or published v1 benchmark receipt is
admitted before the A7 PO gate. The schema and runtime validator ship
atomically in the same candidate and require the same ordered five-fixture
structural shape. JSON Schema protects the portable closed shape; the runtime
remains mandatory for cross-field, ordering and envelope semantics that JSON
Schema cannot express alone, before recommendation or persistence.
Existing serial execution remains the unchanged baseline and receives no
benchmark record. A later external consumer must bind all five fixtures and
use the closed v1 schema; a format change requires a new version, not a v1
relaxation. Rollback is the A6/A7 forward-revert path below.

## Slice A6R — Post-v0.4.7 delivery loop

**Issue:** `#98`

**Dependencies:** exact R0 adoption, accepted A5 lineage contract and accepted
A6 release-preflight contract.

**Outcome:** one supported, observable and convergent path from candidate
qualification through explicit publication authorization and exact remote
readback.

**Order:**

1. R0 exact baseline adoption record and evidence-impact disposition;
2. R1 remote/credential/ref/workflow/policy/executor capability preflight;
3. R2 fixed productive publication CLI around the existing authority;
4. R3 bounded Verify progress and candidate-bound resume journal;
5. R4 release-path Critic delta enforcement;
6. R5 public release-state projection and contradiction checker; and
7. R6 integrated disposable-remote, Verify-resume, Critic-lineage and
   release-state fixtures.

**DoD:**

- all NVA-A98 criteria pass;
- no raw push or improvised library invocation is needed as the normal path;
- capability unknown/unavailable/insufficient/rejected states remain distinct;
- resumed Verify covers the complete registered suite set on one candidate;
- normal correction reviews never restart from complete release history;
- publication closes only after fresh matching commit/tree readback; and
- public release state agrees with the published tag.

**ADR gate:** the machine-local Verify run journal requires an accepted ADR
covering ownership, permissions, durability, retention, cleanup and stale-run
recovery before R3 implementation.

The exact contracts, path manifest and negative matrix are in
`specs/sprint-nova-epic/design/post-v0.4.7-delivery-loop.md`.

## Slice A6S — Atomic plan revocation and recovery

**Issue:** `#98`

**Dependencies:** the existing V2 plan/Spec writer and current onboarding
state admission.

**Outcome:** no writer can create a revoked implementation phase; a previously
created legacy mixed state has one evidence-bound recovery route or an honest
typed unavailable result.

**Order:**

1. make the pure V2 reducer express the atomic Design postimage;
2. define the closed attended plan/apply payload for the sole legacy V2 mixed
   shape;
3. bind preimage/postimage, actor, timestamp, recovery class and `--activate`
   under the existing writer lock, while requiring a fresh one-time attended
   Human Guard Override for the exact non-ready apply tool input;
4. retain unchanged Continuity, clear spent V2 approval/revocation into a
   durable receipt and accept only zero-write replay;
5. reject mixed postimages in onboarding, permit only the read-only recovery
   plan while lifecycle is non-ready, and route the exact apply through the
   consumed Human capability; and
6. run normal, malformed, stale, replay and legacy-writer regressions.

**DoD:** all NVA-A98-4b/4c cases pass; no manual JSON edit, remote action,
cache patch, cross-root input/output or general State override appears in the
implementation; every mutation is revalidated under the existing writer lock
and the legacy apply is admitted only through the exact one-use Human
capability.

## Slice A7 — Nova A integration and gate

**Outcome:** one candidate-bound Nova A Result.

**Entry:** A1–A6S are complete, the exact v0.4.7 adoption record is valid and
Issue `#98` has no remaining blocker criterion.

**Shared later-integration resources:** central Verify registration, ADR
register, state/history and any post-V3 generated projections. Nova may change
its own branch; possible Cyborg merge collisions are recorded for the separate
post-Sprint integration lifecycle.

**Checks:**

- focused suites;
- `git diff --check`;
- one configured Full Verify;
- Security;
- fresh high-risk Critic;
- default-green backlog readback and per-item reconciliation preview; and
- exact tested product candidate/tree and evidence-manifest Result;
- gate-only `E1` increment receipt and independent readback; and
- gate-only `E2` PO activation record with structurally validated ancestry.

**Stop:** any missing criterion, unresolved Critic finding, shared-path drift,
or candidate mismatch. Nova B does not start until the PO accepts this Result.
The receipt never binds its own file or enclosing commit; the readback binds
`E1`, and Nova B separates the accepted product candidate from the validated
gate-only continuation head.

**Rollback:** Before PO acceptance, abandon the candidate and create an
ordinary forward revert commit for the affected Nova slice; do not rewrite the
branch or ledger history. If an `E1` evidence commit already exists, invalidate
its receipt through a new gate-only evidence record before reverting code.
`E2`/PO activation is never manufactured as rollback. The TP-3 registration,
capability inventory and operational-state exception revert together with the
associated Nova contract commit; a subsequent candidate reruns Verify,
Security and Critic from the new exact tree. No production flag, migration or
remote state is introduced by Nova A.

### PO-directed A7 integration exception — 2026-07-25

The Product Owner explicitly directed that the repository operational state
remain current during Nova implementation and authorized the one-time TP-3
Verify registration. Registering the completed focused suites makes
`docs/product-capability-inventory.json` fail closed unless it inventories the
same 13 Verify surfaces. The operational handover in `docs/state.md` must then
record the actual A7/gate status rather than leave an obsolete unregistered
state.

These two documentation updates are therefore a narrow, reviewed integration
exception to the A7 exact-path table: they neither alter a Nova contract nor
claim gate/PO completion. They are limited to the exact Verify surfaces and
the Nova handover paragraph, were added only after the TP-3 action, and require
the complete candidate Verify/Security/Critic tail. They are recorded here for
the separate Spec-gate collision review; no Nova B activation or Result
acceptance is implied.

### PO-directed A7 Gitleaks scope reconciliation — 2026-07-25

The Product Owner authorized the already-required remediation of the fourteen
candidate-tree Gitleaks false positives only on `.gitleaksignore`,
`harness/scripts/security-adapters/gitleaks.mjs`, and
`harness/scripts/security-scan.test.mjs`. This records the narrow
cross-Sprint collision reconciliation for the historical scanner surface: it
does not weaken scanner semantics, skip Security, add a path/rule-wide
allowance, or authorize further security files. The resulting repair remains
part of the product candidate and requires a fresh Verify/Security/Critic tail
before any A7 receipt or Nova B activation.
