# Post-v0.4.7 delivery-loop design

**Owner:** Sprint Nova / Issue
[`#98`](https://github.com/agent-pipe-shared/agent-pipeline/issues/98)
**Priority / size:** P0 / L
**Design status:** proposed for the renewed PRD/Spec gate
**Released input:** `v0.4.7` commit
`89cb12b99e3fd86ac44878d0c23b278f00538921`, tree
`b6537dcaa7bee526d9a393e2603b28648f4b0438`

## 1. Outcome and ownership

One exact Nova candidate can move through capability preflight, qualification,
explicit authorization, publication and fresh remote readback using fixed
product commands. Full Verify exposes bounded progress and candidate-bound
resume. Normal Critic corrections remain delta/impact bounded. Public release
state agrees with the published tag.

This slice composes existing authorities:

- `#56` owns general release preflight;
- `#54` owns general Critic convergence;
- `publication-authority.mjs` owns publication approval/state;
- `publication-executor.mjs` owns the fixed exact-candidate mutation and
  readback boundary; and
- `harness/scripts/verify.mjs` remains the repository's one Verify command.

Issue `#98` owns their release-loop integration, productive CLI exposure and
candidate-bound evidence. It does not reopen the completed v0.4.7 Hotfix line
or create a generic Git/credential/guard bypass.

## 2. Slice order

### R0 — Exact baseline adoption

Before implementation, record a closed rebase receipt containing:

- previous Nova head and tree;
- released base commit and tree;
- resulting rebased head and tree;
- ordered replayed commits;
- per-conflict semantic disposition;
- changed-path impact closure; and
- every invalidated, reusable or rerun evidence record with a reason.

The released base is immutable. A different `main` head does not silently
retarget this adoption. No push occurs as part of R0.

### R1 — Publication capability preflight

Extend the existing release preflight with one fixed target adapter. Input is
only the exact candidate, configured remote name, complete destination ref and
executor identity. The adapter returns sanitized observations for:

- one unambiguous push endpoint fingerprint;
- exact remote preimage;
- usable credential class;
- repository/ref write capability;
- workflow-file update capability when the candidate changes
  `.github/workflows/**`;
- branch/repository policy disposition; and
- installed/callable publication executor digest.

The adapter never prints a URL, login, token, private path or raw provider
error. It performs no write probe. When a provider cannot authoritatively
report a permission, that cell is `unavailable`, not guessed from read access.
Candidate authorization cannot begin from a missing, insufficient, rejected,
stale, ambiguous or unavailable required cell.

### R2 — Productive publication CLI

Extend `publication-executor.mjs`; do not introduce a second approval family.
The released `pipeline.publication-channel.v1` contract has closed keys and
binds identity, Verify and Security evidence but not the new Critic and
release-preflight evidence. Preserve v1 byte-for-byte and introduce a
versioned v2 successor in the same publication-bundle/authority store and
transition family. There is no implicit v1-to-v2 upgrade: an unused v1
transaction remains v1, while the productive Nova release loop prepares a new
v2 transaction from current evidence. The v2 approval tuple includes the new
evidence bindings, so a v1 approval can never authorize a v2 execution.
The productive operations are:

1. `preflight` — read-only capability and exact remote-preimage observation;
2. `prepare` — creates the versioned candidate/remote/evidence-bound
   publication authority in the existing private authority store from a
   current successful preflight;
3. `authorize-plan` — read-only preview returning one digest-bound apply
   action;
4. `authorize-apply --activate` — consumes explicit Human confirmation and
   advances the existing authority;
5. `execute` — consumes authority before at most one mutation attempt; and
6. `readback` — converges an interrupted/already-published transaction through
   a fresh disposable repository with alternates disabled.

No operation accepts raw Git argv, URL, token or arbitrary refspec. The fixed
destination remains the authority's complete ref. Force, delete, wildcard,
multiple refspec, non-fast-forward and generic retry are rejected. A transport
exception after mutation is ambiguous and permits only fresh readback, never a
second push.

### R3 — Observable and resumable Full Verify

The Verify orchestrator creates one private run directory under the physical
Git common directory. It contains:

- a closed run manifest;
- one complete bounded log per suite;
- one terminal suite receipt per completed suite; and
- an append-only progress journal used only as observation input.

The interactive channel receives bounded JSON progress events at suite start
and terminal completion. It does not receive the complete buffered log.

A completed suite is reusable only when all bindings match:

- candidate commit and tree;
- suite ID and suite implementation digest;
- declared file and non-file test inputs;
- relevant environment-contract digest; and
- Verify policy/registration digest.

Partial/running/unknown suites rerun. Candidate, suite, input, environment or
policy drift invalidates only the affected receipts plus deterministic
dependents. The resume planner reports `reusable`, `rerun` and `invalidated`
sets; it never parses console prose or treats journal/file presence as PASS.
The final Verify evidence still represents the complete registered suite set
on one exact candidate.

### R4 — Critic correction enforcement

The first admitted release Critic is broad and stores its exact candidate as
the lineage parent. Each normal correction compiles:

```text
previous reviewed candidate..corrected candidate
  + deterministic integration-impact closure
```

Findings name a changed line or direct consequence of that delta. Unchanged
historical findings retain their existing disposition and are not rediscovered
as new findings. A broader rerun requires a closed invalidation code, evidence
and new lineage-parent binding. The existing four-review/three-correction
course limits remain unchanged.

### R5 — Release-state consistency

`docs/release-state.json` is a machine-readable public documentation
projection containing version, tag, published commit/tree and disposition.
`docs/state.md` renders the same identity. A deterministic checker fails when:

- the declared version/tag disagree;
- the declared commit/tree disagree with the locally observed published tag;
- a published release is described as an unpublished candidate; or
- either documentation surface omits or contradicts the projection.

This projection cannot authorize publication and contains no private remote or
credential information.

### R6 — Integrated candidate and evidence

The final Nova candidate must pass:

- exact v0.4.7 adoption validation;
- focused R1–R5 fixtures;
- Full Verify and Security;
- successful release preflight;
- delta-correct independent Critic review;
- explicit publication authorization;
- fixed executor completion; and
- exact fresh remote commit/tree readback.

Closure evidence names candidate, integration commit, publication transaction
and receipt, Verify progress/resume fixtures, Critic lineage and release-state
check. No evidence from the historical v0.4.7 Hotfix candidate is reused as a
Nova PASS without an exact unchanged binding.

## 3. Required negative matrix

| Boundary | Required failures |
| --- | --- |
| Baseline adoption | wrong release OID/tree, missing replayed commit, unrecorded semantic conflict, stale binding |
| Preflight | ambiguous endpoint, unavailable credentials, insufficient ref permission, missing workflow permission, policy rejection, stale preimage, executor unavailable |
| Publication | wrong candidate/tree/remote/ref/preimage/evidence/approval/expiry, replay, non-fast-forward, force/delete/broad refspec, ambiguous transport |
| Verify resume | partial suite, changed candidate, changed suite code, changed input, changed environment contract, changed policy, missing/corrupt log or receipt |
| Critic | whole-history correction request, changed-line-free finding, missing lineage parent, untyped broad rerun, exhausted course |
| Documentation | published tag marked candidate/unpublished, wrong commit/tree, missing projection, state/projection mismatch |

## 4. State and durability boundaries

- Publication authority remains in its existing private durable store.
- Released v1 state and receipts remain readable and valid under their frozen
  schema; only new v2 transactions can satisfy the #98 release-loop gate.
- Verify resume data is machine-local evidence under Git common state; it is
  not portable project State, plan approval or publication authority.
- Public candidate evidence stores only sanitized digests and terminal
  receipts after the corresponding operation is complete.
- Remote capability observations carry fingerprints/classes, never endpoint,
  account or credential bytes.
- Unknown and unavailable are distinct from denial and never become success.

A machine-local Verify run journal is a new durable recovery mechanism and
requires an ADR before implementation because it survives process
interruption. The ADR must define ownership, permissions, retention, cleanup,
cross-platform durability and stale-run recovery.

## 5. Standing guard-lift authorization

The PO grants a standing Nova-only authorization from 2026-08-01 until formal
Nova close for temporary TP-1, TP-3 and TP-5 lifts. Each actual lift remains
bound to one Nova task and exact protected write-set, is audit-recorded, and
does not cover another guard. The lifted rules must be restored before
candidate gates, push/publication and Nova close. This standing authorization
removes repeated approval prompts; it does not permit weakened tests, false
evidence or continuous unscoped disablement.

## 6. Stop conditions

Return to the PO/Spec gate when any of these occurs:

- the existing publication authority cannot support the productive CLI
  without a parallel approval format;
- permission observation requires a write probe or credential disclosure;
- Verify resume requires a second project State authority;
- a suite's complete relevant input closure cannot be determined;
- Critic impact closure becomes coordinator prose instead of deterministic
  evidence;
- the v0.4.7 rebase reveals a semantic conflict outside the 17-Issue scope; or
- an implementation path is needed outside the Spec's exact A6R manifest.
