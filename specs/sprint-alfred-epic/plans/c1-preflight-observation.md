# First live Critic preflight observer — closed contract

Implementation plan, 2026-09-08. Source projection is implemented at `125a2d160ac7b3c4d16979ed4cfbe305a98f8ed5`; this observer and store/controller remain pending. Full Verify candidate `96238c3c1b811dc69e5d5631de67f223a6853046` finished red at 499/508. No emission, review or baseline claim is made.

Scope is only the actual `plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs` operation. Its current direct invocation parses argv, calls `preflightCriticDispatch`, emits unchanged JSON, and exits. No other C1 source kind, new classifier, native child, guard, lifecycle writer or pure-core I/O is introduced.

## 1. Preserve the production command

Keep the existing first argument and return/throw semantics of:

```text
preflightCriticDispatch(request, observer = null)
```

`request` remains the existing producer API. `observer` is null or an internal synchronous function supplied by the trusted caller; it is not read from argv, stdin, environment JSON, receipt files or model-generated facts. No new CLI flag supplies scope, classification, expected gate, producer outcome or timestamps.

The original direct CLI remains read-only and uses the same producer without installing an observer. A separately named `observe-critic-preflight` controller is the dedicated observed CLI; it invokes the shared parser and producer, then performs local collection after the real producer call. Existing library callers that omit the second argument acquire no telemetry I/O. An internal callback is a provenance boundary within the program, not an OS sandbox or proof against arbitrary code execution.

At each completed producer operation call the observer once with the closed Source record below. Capture rejection before rethrowing the original error; never wrap it in a different producer error. Capture packet-ready immediately before returning the unchanged result. Move neither Git nor evidence checks relative to each other. An observer return, throw, invalid result or I/O failure cannot change admission, stdout, stderr, exit status, exception identity or spawn flags. Do not await arbitrary asynchronous callbacks: the contract is synchronous and bounded. Promise returns are invalid observer results.

Extract the existing CLI body into `runCriticDispatchPreflightCli(argv, ports)` only if necessary to test the same control flow. That controller is called by the actual `isDirectInvocation` branch; the production defaults are fixed code, not an injection protocol exposed to the model. Its stdout/stderr bytes and exits remain:

- success: original full packet-ready JSON plus newline on stdout; empty stderr; exit 0;
- rejection: exactly `{schema:"pipeline.critic-dispatch-preflight.v1",status:"rejected",code}` plus newline on stderr; empty stdout; exit 1.

A telemetry diagnostic goes to the private callback/store result channel, never a second CLI stdout/stderr line. If the store is unavailable, preserve command behavior and report unavailable collection through the collection/report layer when available. Do not turn telemetry availability into a gate.

## 2. Closed source callback

The callback receives exactly:

```text
Source = {
  schema, producer, observationRevision, stage,
  outcome, code, candidate, specSha256
}
```

All keys are required.

| Field | Exact value/type |
|---|---|
| schema | literal `pipeline.critic-preflight-observation.v1` |
| producer | literal `critic-dispatch-preflight` |
| observationRevision | literal integer `1` |
| stage | `arguments | request | candidate | paths | inventory | manifest | governance | candidate-files | evidence | prior-evidence | complete` |
| outcome | `rejected | packet-ready` |
| code | one of the 19 producer codes below for rejected; null for packet-ready |
| candidate | C1 Candidate `{commit,tree}` or null |
| specSha256 | lowercase SHA-256 of the actual candidate spec readback, or null |

This Source is a safe projection, not the raw request/result/error. It contains no root, paths, argv, error message, raw evidence, prior review body, native identifier or arbitrary label. Use descriptor-safe exact-key validation and detached copies; reject accessors, custom prototypes, symbols and extra fields without executing getters. The callback may not mutate producer-owned objects. An unknown future producer code fails observer validation and yields `C1O-SOURCE`; it does not silently extend this revision.

`outcome:packet-ready` requires `stage:complete,code:null`, nonnull valid candidate and nonnull specSha256. It is a successful preflight observation, **not** an interruption or permission to spawn, accept a candidate or declare an earlier interruption resolved.

`outcome:rejected` requires an allowed code/stage combination. An untyped error still follows the original public code `CDP-UNEXPECTED`. Its message/name/properties are not propagated; observe it at the actual stage. The callback receives only a closed code selected by the producer's own exception branch, not a regex over stderr.

### Candidate and stage capture

Keep a local candidate variable null until the producer has resolved and validated **both** `candidateCommit` and `candidateTree` using its existing Git calls and OID checks (source lines 180–184). Set it after those validations and before range validation. It is still null for partial resolution or invalid OIDs. Do not re-resolve the candidate ref after the operation, query HEAD, infer candidate from evidence or use a base tree as candidate.

Set specSha256 only after `requiredCandidateReadback` has returned the actual spec readback (source line 214). A failure before then keeps it null. For scope correlation on earlier failures, the local adapter may independently read the **already captured exact candidate commit** and normalized requested spec via bounded, non-shell Git read operations; this is telemetry-side read-only correlation, not a repeated preflight or guard evaluation.

Stage is set by the actual branch being executed. It is not inferred from code suffixes, because the same code can arise at several stages.

## 3. Exhaustive existing producer code/stage matrix

| Stage | Rejection codes admitted at this revision | Source branch and observation limit |
|---|---|---|
| arguments | `CDP-ARGUMENT` | Missing flag values or unknown argv flag, lines 242–250. Root/spec may not be established; no filesystem telemetry write under an unvalidated root. |
| request | `CDP-INPUT` | Required root/base/candidate primitive check, line 177. |
| candidate | `CDP-GIT, CDP-REF, CDP-RANGE` | Base/candidate resolution, OID validation, equal base/candidate, lines 64–106 and 179–185. |
| paths | `CDP-PATH, CDP-PATHS, CDP-DUPLICATE-PATH, CDP-EVIDENCE-REQUIRED, CDP-PRIOR-ALIASED` | Requested paths/collections, empty fresh evidence and prior/fresh alias, lines 41–59 and 187–192. |
| inventory | `CDP-GIT, CDP-TREE, CDP-PATH` | Actual candidate inventory read/parse and normalized candidate paths, lines 109–120. |
| manifest | `CDP-MANIFEST` | Missing/unreadable candidate manifest or caught manifest-read/parse exception, lines 196–200. Preserve the original remapping: a caught candidate-read error here remains CDP-MANIFEST. |
| governance | `CDP-GIT, CDP-PATH` | Changed-path Git read and path normalization, lines 201–207. A foreign governance validator error follows existing CDP-UNEXPECTED handling; do not export a new code through C1. |
| candidate-files | `CDP-CANDIDATE-PATH, CDP-CANDIDATE-READ` | Spec/guardrail candidate readbacks, lines 124–132,160–166,214–215. |
| evidence | `CDP-EVIDENCE-PATH, CDP-EVIDENCE-FILE, CDP-EVIDENCE-JSON, CDP-EVIDENCE-BINDING` | Actual local fresh-evidence containment/type/bounds/JSON/candidate binding, lines 136–158,216. |
| prior-evidence | `CDP-EVIDENCE-PATH, CDP-EVIDENCE-FILE` | Prior evidence is separately read and hashed; its body is not required to be JSON or current-candidate evidence, line 217. Do not impose fresh-evidence rules on it. |
| Any stage before complete | `CDP-UNEXPECTED` | Existing catch behavior for untyped exceptions, including root realpath and file-read errors. Preserve the actual stage and any already valid captured candidate. |
| complete | none | Packet-ready only. |

Unique closed code enum: `CDP-ARGUMENT | CDP-INPUT | CDP-GIT | CDP-REF | CDP-RANGE | CDP-PATH | CDP-PATHS | CDP-DUPLICATE-PATH | CDP-EVIDENCE-REQUIRED | CDP-PRIOR-ALIASED | CDP-TREE | CDP-MANIFEST | CDP-CANDIDATE-PATH | CDP-CANDIDATE-READ | CDP-EVIDENCE-PATH | CDP-EVIDENCE-FILE | CDP-EVIDENCE-JSON | CDP-EVIDENCE-BINDING | CDP-UNEXPECTED`.

### Expected gate versus unexpected interruption

The current CLI request does not contain trusted planned-step/evidence-gate context, and its output does not prove whether missing evidence was an expected stop or an unexpected failure. Therefore **every admitted rejection in this first slice projects facts `[]`**, sourceKind `workflow-observer`, with the original code. The unchanged registry derives classification/category `unknown/unknown`, matchedRuleIds `[]`.

In particular, `CDP-EVIDENCE-REQUIRED` does not establish `expected-boundary` or `next-step-prevented` by itself. `CDP-EVIDENCE-BINDING`, `CDP-MANIFEST` and `CDP-UNEXPECTED` likewise are genuine observed preflight failures but not proofs of an unexpected interruption of a declared lifecycle step. Do not route missing evidence through a fake lifecycle-boundary fact. A future trusted orchestration path may provide those facts after its own concrete control-flow observation; that is outside this first slice.

## 4. Reconciled controller, capture and qualification

The producer boundary invokes only a trusted synchronous callback and ignores
its return without reading `then`, getters or assimilating a Promise. Synchronous
callback throws are isolated from the original producer result/error. Production
callbacks do not schedule asynchronous telemetry; this contract makes no claim
to contain independently scheduled rejection or arbitrary callback side effects.

The direct CLI remains read-only and preserves the producer's stdout/stderr/exit
contract. A dedicated observe-critic-preflight create/run/status controller
invokes the shared parser and unchanged producer. Argument parsing precedes the
producer: because the producer function destructures its first request parameter,
preserve that original binding/getter order and thrown identity. The controller
may capture its own real parser/uncaught outcome as an arguments/request failure,
but never fabricates candidate or spec facts. Safe Source snapshots are detached
from producer packet objects. Callback invocation is synchronous and isolated;
Promise returns are invalid and cannot alter producer admission or output.

capture(Source) -> {ok,code} captures one Source and one observation time.
qualifyCriticPreflightObservation({source,observedAt,root,specPath}) -> {ok,code,observation}
returns the exact Observation with no observationSha256. A successful
qualification has `ok:true`, `code:null` and a non-null qualified observation;
a failed qualification has `ok:false`, a closed C1O code and
`observation:null`. Capture returns `ok:true,code:null` or `ok:false` with
`C1O-SOURCE` or `C1O-TIME`:

Observation = {schema,source,observedAt,scope,actor,ownerBinding}

The closed collection diagnostic enum is:

```text
C1O-SOURCE | C1O-ROOT | C1O-SCOPE-UNAVAILABLE | C1O-SCOPE-BINDING |
C1O-SCOPE-STALE | C1O-LINEAGE-UNAVAILABLE | C1O-LINEAGE-BINDING |
C1O-TIME | C1O-STORE
```

The exact observation literals and types are:

```text
schema = pipeline.critic-preflight-local-observation.v1
source = Source
observedAt = existing C1 Time
scope = existing C1 Scope
actor = {runner:null, role:null}
ownerBinding = {
  stateSha256, continuityRevision, specSha256, specPathSha256
}
```

All keys are required. `continuityRevision` is nonnegative safe integer
metadata, not a measurement. The public projection contains no raw owner state,
authority paths, model/thread/session/worker identity or arbitrary caller facts.
`observedAt` uses the actual adapter clock. Missing time is
`{value:null,status:"unknown"}`; unavailable source remains unavailable. A
malformed time or contradictory supplied history returns `C1O-TIME`. The cutoff
is when this result was observed, not when the condition began. The complete
canonical Observation bytes are bound by `artifactSha256`; the receipt artifact
uses `{id:eventId,sha256:artifactSha256}`.

ownerBinding is {stateSha256,continuityRevision,specSha256,specPathSha256}.
`specPathSha256` is the SHA-256 of normalized repository-relative spec path
UTF-8 bytes with no newline; state/spec digests are lowercase 64-character
SHA-256 values and continuityRevision is a safe integer.
A usable scope
requires at least one observed feature/package/dispatch ID; otherwise record a
closed collection diagnostic and unknown coverage without a receipt. Arguments
source capture happens in the actual controller branch, never inside the
producer. Keep all 19 Source codes/stages, candidate constraints and owner
correlation above unchanged.

### Concrete owner scope resolution, not schema-only trust

1. Resolve the exact actual root to a physical directory. Call `resolveProjectAuthorityPaths({rootDir:physicalRoot})` from `lib/project-authority.mjs:645`; require status ready. Do not use `resolveAuthorityArtifactPath`'s fallback behavior to silently accept an unresolved authority (683–707).
2. Read the actual owner-selected state file within that root with bounded regular-file/no-symlink containment checks. Do not accept a caller-supplied state object/path as authority. Parse through the existing owner read path where appropriate; `readState(root)` alone is insufficient because its root schema/portability checks do not prove episode or spec identity (`scripts/pipeline-state.mjs:753–779`).
3. Require a structurally valid active feature, and call the **existing** `validateContinuityState(state.continuity, state.activeFeature.id)` (`lib/continuity-state.mjs:388`). Require success. Continuity must remain under its existing byte budget; apply the C1 public-ID privacy screen to the projected feature/phase. Do not copy model/thread/session/worker identity.
4. Require continuity.authority.spec.path to equal the producer's normalized requested spec path under the same physical root. Read the actual bound spec bytes with containment checks and require SHA-256 equal to continuity.authority.spec.sha256. Also require the exact captured candidate's spec blob digest to equal that digest. This distinguishes a real repository-associated scope from merely well-shaped caller JSON or an unrelated active feature.
5. Capture state/spec bytes/digests before and after correlation. If root resolution, state digest, continuity revision, spec identity or digest changes, return C1O-SCOPE-STALE and no receipt. Do not fall back to another state, current HEAD or a neighboring spec.
6. Emit scope exactly `{featureId:state.continuity.featureId,packageId:null,dispatchId:null,phase:state.activeFeature.phase}`. Phase must be a safe C1 Id or become null; unsafe feature ID makes scope unavailable. Queue package/dispatch IDs are not copied: this CLI does not prove correlation to that queue operation. If any preceding prerequisite fails, no qualified scope/receipt exists.
7. This is observation provenance relative to the repository's existing owner authority, not a new human approval, signature requirement, native identity proof or resistance to arbitrary repository-owner edits. It does not repair state, grant execution or validate a model's expected/unexpected claim.


## 5. Store/controller composition

The sibling authority [C1 store/controller plan](c1-store-controller.md)
owns storage. Replace the obsolete handleProvider/publish/store.begin/store.resume
and receiptInput proposal with: controller create/run/status invokes the unchanged
producer, captures one Source/time, qualifies it, and flushes synchronously;
the store owns lineage, receipt construction and immutable publication while the
controller retains eventId for the actual run. Existing direct CLI remains
read-only. No new approval semantics, live emission, review or baseline claim is
made. A missing retained operation yields a closed diagnostic, never an invented
episode. Usage ingestion remains a later separate read-only I/O adapter.

## 6. Owned implementation files and behavioral acceptance

The first source increment owns the following bounded paths:

- Modify `plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs` only for
  the additive internal capture callback and unchanged producer behavior.
- Preserve its existing test for producer/parser/CLI parity and extend it only
  for the real retained selector and capture/qualification route.
- Add `plugins/pipeline-core/lib/critic-preflight-observer.mjs` for Source and
  Observation validation, owner correlation and safe projection.
- Add an explicit
  `plugins/pipeline-core/lib/critic-preflight-observer.test.mjs` for the new
  adapter; its registration must follow the repository's sanctioned test
  registration path.
- Store and controller files remain owned by the [C1 store/controller plan](c1-store-controller.md).
  No registry, source-validator, guard,
  hook, lifecycle writer, inventory, exclusion or protected Verify edit rides
  along.

Required behavioral fixtures, all in disposable local fixture repositories:

1. Spawn the actual script through Node with existing argv and compare full
   stdout, stderr and exit against preserved behavior for packet-ready, missing
   fresh evidence, stale evidence, prior alias, missing governance/spec,
   malformed path and bad candidate. Use the current fixture construction in
   `plugins/pipeline-core/scripts/critic-dispatch-preflight.test.mjs:17–45`; do not change old
   expectations or use a live working tree.
2. Assert packet-ready retains every original field and
   `dispatch.childCreated=false,packetCreated=false,stateMutated=false,
   spawnAuthorized=false,requiredNextGate="selected-runner-transport"`.
   No interruption receipt or automatic resolution is emitted for success.
3. Assert exact candidate capture survives a later failure; missing or partial
   resolution stays null, and ref or HEAD movement cannot rewrite it. Wrong
   candidate/spec-to-owner binding produces a collection diagnostic.
4. Exercise all 19 code/stage pairings and reject every wrong pairing. Real CLI
   fixtures cover naturally reachable branches; deterministic helper failures
   may cover exceptional Git/filesystem/parse branches and must be labelled
   injected, not reported as host observations.
5. Owner fixtures require actual authority resolution, bounded state/spec files
   and correct candidate spec bytes, never preassembled scope JSON. Wrong root,
   cross-root path, symlink, stale state, wrong feature ID, malformed
   continuity, unrelated spec and digest race yield no receipt. Fallback
   authority and current queue package/dispatch are never silently trusted.
6. A composed real observed controller uses one trusted retained operation:
   begin one episode on its first obstruction, resume for a second rejection,
   and verify two event IDs with one lineage. A separately created operation
   gets another lineage. A dedicated observed controller with a missing or
   unbound retained selector returns a collection failure while preserving the
   real producer outcome. The original bare direct CLI installs no observer and
   makes no lineage diagnostic.
7. Inspect stored qualified receipt/observation bytes from that composed caller:
   original CDP code, empty facts, unknown classification/category and state,
   null terminal/resolution, unknown join coverage, and exact candidate/source
   artifact binding. Invented elapsed duration, population coverage and
   causality are forbidden.
8. Observer callback/store throw, Promise return, source rejection or persistence
   failure leaves original CLI stdout/stderr/exit/exception behavior exact.
   Collection failures remain observable through the collection diagnostic
   channel when available; no silent measured coverage.
9. Descriptor/getter/private-payload traps reject without copying private data
   or invoking getters. No arbitrary caller facts, expected gate, scope,
   timestamps or source result enters the production adapter.
10. Assert no child, packet, worktree, guard evaluation or lifecycle mutation;
    only existing Git reads and bounded telemetry correlation/storage occur.
    Restore mocks synchronously and leave no live fault injection.
11. Run focused producer/observer suites, consumer-safe-path checks and
    whitespace checks. Parent owns any new suite registration, Full Verify and
    independent required review.

These are proposed tests, not executed results. First-slice delivery requires
the composed actual caller to write/read back a valid receipt or honest
collection diagnostic under the frozen store contract. Callback-only code
without caller/store composition is not full emission. This plan makes no
implementation, emission, review, baseline or approval claim.
