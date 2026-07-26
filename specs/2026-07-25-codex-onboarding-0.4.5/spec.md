# Technical Spec — Deterministic fresh Codex onboarding (0.4.5)

## PO-approved scope amendment

The operator live-test sequence established a narrower, releasable boundary
than the original Issue #61 draft. The PO explicitly rescoped 0.4.5 to the
functional fresh-empty-folder flow supported by Codex's declared Bash, Edit,
Write, and `apply_patch` hook surface. Native interception for implementation,
Goldfish, and subagent-launch tool events that Codex does not expose through
that surface is deferred to the prepared P2 follow-up Issue with
`sprint:NONE`, owner `@skar667 (PO)`, and expiry `2026-08-31`.

Accordingly, references below to Advisor, implementation, Goldfish, or
subagent dispatch mean Pipeline-owned callers that are implemented in this
repository. They do not assert a native Codex launch hook. The result and
release-readiness documents preserve that residual boundary. Issue #25 owns
only installation ceremony and confirmation-count tuning.

## Status and authority

Status: formally approved implementation candidate at the operator live-test
gate. No commit, push, tag, publication, Issue closure, or release is approved.

This Spec implements the product outcome in
[`prd_codex-onboarding-0.4.5.md`](prd_codex-onboarding-0.4.5.md) and the
acceptance contract of GitHub Issue #61. The Issue remains the external defect
record; this repository pair is the implementation authority after explicit PO
approval.

## Design principles

1. One lifecycle owns fresh onboarding. `project-onboarding-v3` remains the
   classifier and public command; runner migration is an internal convergence
   primitive, not a second user journey.
2. Portable configuration applied is not operational readiness.
3. Every state and failure is closed, typed, machine-readable, and has at most
   one sanctioned next action.
4. Read-only observation precedes mutation. Mutations remain explicit,
   digest-bound, preimage-checked, transactional, and idempotent.
5. Generated projections are never repaired manually. The V3 source and
   lifecycle apply operations are the only writers.
6. Repository, runtime, restart, continuity, and App-Server capabilities remain
   separate dimensions. One successful dimension cannot mask another failure.

## Lifecycle state machine

The public status schema is `pipeline.project-onboarding.v4`. Every success,
progress, and terminal response contains exactly:

- `schema`
- `status`
- `root`
- `runner`
- `intent`
- `repository`
- `runtime`
- `continuity`
- `appServer`
- `nextAction`
- `diagnostics`

`intent` is exactly `onboarding|bootstrap|session|dispatch`. `inspect` defaults
to `onboarding`; every lifecycle consumer must supply its real intent rather
than interpreting a generic result.

The closed field contract is:

| Field | Type and requiredness |
| --- | --- |
| `schema` | required literal string `pipeline.project-onboarding.v4` |
| `status` | required string from the progress/terminal sets in this section |
| `root` | required canonical absolute string after root resolution; `null` only when root resolution itself failed |
| `runner` | required literal string `codex`; `null` only before a valid source/default runner can be resolved |
| `intent` | required string `onboarding|bootstrap|session|dispatch` |
| `repository` | required object with exactly `status`, `mode`, `gitVersion`, `initializesGit`, `rootWritable`, `sessionCapability`, and `worktreeCapability` |
| `runtime` | required object with exactly `status`, `sourceSha256`, `targetsSha256`, `barrierSha256`, and `readbackSha256` |
| `continuity` | required object with exactly `status`, `stateSha256`, `handoverSha256`, and `historySha256` |
| `appServer` | required object with exactly `required`, `status`, and `code` |
| `nextAction` | required; `null` or one of the closed action objects in Remediation contract |
| `diagnostics` | required array of zero or more closed diagnostic objects |

`repository.mode` is exactly `local|host-managed|unknown`.
`repository.gitVersion` is a normalized nonempty version string only after a
successful Git observation, otherwise `null`. `initializesGit` is boolean and
is true only for a reviewed `local-uninitialized` portable-seed plan.
`rootWritable` is `passed|failed|not-observed`.
`sessionCapability` and `worktreeCapability` are each
`passed|failed|not-required|not-observed`; a stronger intent never treats
`not-observed` as passed.

All digest fields are lowercase 64-hex strings when that authority exists and
has been observed, otherwise `null`. A runtime or continuity status that
claims the corresponding authority is current requires its digest fields to
be non-null. A non-current/unobserved component never carries a stale digest
forward as if it were current.

Each diagnostic object has exactly `path`, `code`, `message`, and `guidance`.
All four are strings; `path` is a JSONPath rooted at `$`, `message` is
sanitized single-line text, and `guidance` is sanitized single-line text or the
empty string when no safe guidance exists. `code` is exactly one of:

- `root_resolution_failed`
- `root_unreadable`
- `root_symlink_rejected`
- `project_root_read_only`
- `repository_control_path_read_only`
- `repository_control_path_invalid`
- `repository_mode_unsupported`
- `repository_observation_unavailable`
- `git_unavailable`
- `git_version_unsupported`
- `session_capability_unavailable`
- `worktree_capability_unavailable`
- `portable_seed_missing`
- `source_invalid`
- `migration_required`
- `adoption_required`
- `partial_authority`
- `manifest_invalid`
- `projection_drift`
- `runtime_missing`
- `runtime_target_read_only`
- `restart_required`
- `runtime_readback_unavailable`
- `continuity_absent_pristine`
- `continuity_damaged`
- `continuity_observation_unavailable`
- `app_server_execution_denied`
- `app_server_not_running`
- `app_server_unavailable`

One controlling failure may emit multiple diagnostics only when every entry has
the same controlling component and none exposes a second action. Unknown codes
make the whole response invalid. Diagnostics contain no raw tool output,
environment variables, tokens, user-home paths, or control-file bytes.

Even when `root` or `runner` is `null`, all component objects remain present
with their `unavailable|not-observed|not-requested` values. There is no shorter
error envelope and no exception-shaped stdout result. Schema-validation
failure is a process error on stderr/exit 2 and cannot be represented as a
successful lifecycle response.

This 0.4.5 lifecycle is Codex-only. A valid source whose selected/default
runner is not `codex` returns terminal `invalid` with `runner: null`,
diagnostic `source_invalid`, and `nextAction: null`; it is not routed through
partially specified Claude behavior. Existing Claude onboarding remains
unchanged and outside Issue #61.

For a progress result, `status` is exactly one of:

| State | Meaning | Permitted next mutation |
| --- | --- | --- |
| `portable-seed-required` | No valid V3 source/calibration seed exists. | `apply-portable-seed --activate` |
| `runtime-initialization-required` | Portable source is valid; selected-runner runtime targets are absent. | `initialize-runtime --activate` |
| `runtime-attestation-required` | A project-local selected projection is current but no native effective-runtime readback authority exists yet. This state does not apply to the exact Codex plugin-managed control mount. | digest-bound `apply-readback --activate`, then restart |
| `restart-required` | Project-local Codex config/agent bytes changed after the active host loaded its project runtime. | typed `restart-process` action; it cannot execute inside the current process |
| `kickoff-required` | Runtime readback is current, repository capability is usable, but no valid initial continuity exists. | `kickoff plan`, then `kickoff apply --activate` |
| `host-repository-init-required` | Kickoff is valid in a fresh host-managed Codex root, but the reserved runtime mount has no durable host-init admission. | read-only `codex-host-repository-init.mjs plan`, then its separately confirmed host-bound apply |
| `ready` | All required dimensions passed for the current source/runtime/readback/continuity digests. | normal bootstrap |

The following are terminal non-ready classifications, not lifecycle progress:
`partial`, `invalid`, `unsafe`, `migration-required`, `adoption-required`,
`repository-mount-read-only`, `repository-control-path-invalid`,
`git-capability-unavailable`, `project-root-read-only`,
`repository-mode-unsupported`, `session-capability-unavailable`,
`worktree-capability-unavailable`, `runtime-target-read-only`,
`runtime-readback-unavailable`, `projection-drift`, `continuity-damaged`,
`repository-observation-unavailable`, `continuity-observation-unavailable`,
`app-server-execution-denied`, `app-server-not-running`, and
`app-server-unavailable`.

State precedence is fail-fast:

1. root/path safety;
2. repository control-path capability;
3. portable source/calibration validity;
4. selected-runner projection consistency;
5. restart/native runtime readback;
6. App-Server capability when required by the requested intent;
7. continuity validity;
8. `ready`.

Therefore, for `bootstrap|session|dispatch`, an App-Server failure controls the
top-level result even when continuity is also absent or damaged; the continuity
component still reports its independently observed status but exposes no
action until the earlier App-Server prerequisite passes. For `onboarding`,
App Server is `not-requested`, so continuity remains the controlling stage
after runtime readback. A result never exposes two competing `nextAction`
values.

The aggregate must never return `ready` when a component is non-ready.

Source/root classification is mutually exclusive and exact:

| Observation | Aggregate status |
| --- | --- |
| root cannot be resolved/read safely, is a symlink, or contains a symlink in an owned/control path | `unsafe` |
| no Pipeline source/runtime exists and root has no entries | `portable-seed-required` with repository `local-uninitialized` |
| no Pipeline source/runtime exists and entries are exactly the recognized host-owned `.git`, `.codex`, and optional `.agents` layout | `portable-seed-required` with repository `host-managed` |
| no Pipeline source/runtime exists, Git is locally valid, and only non-reserved user project entries exist | `adoption-required` |
| a valid V0/V1/V2 source is selected by `runner-profile-migration-v3.mjs inspect` | `migration-required` |
| a V3 source exists but fails `validatePipelineUserV3` | `invalid` |
| some Pipeline source/runtime/projection artifact exists but the set is neither a valid legacy source nor a complete valid V3 authority | `partial` |
| V3 source is valid and the selected projection is absent | `runtime-initialization-required` |
| V3 source and projection exist but owned bytes/preimages differ | `projection-drift` |
| V3 source/projection are current | continue to restart/readback; a reserved Codex mount is `plugin-managed-unattested` until the exact host-init admission promotes it to the closed `plugin-managed` form |

The classifier uses the existing safe-root, recognized-host-layout, legacy
source inspector, `validatePipelineUserV3`, and V3 projection planner from
`plugins/pipeline-core/lib/project-onboarding-v3.mjs`,
`runner-profile-migration-v3.mjs`, and `runtime-projection-v3.mjs`; it does not
create a second source parser. If observations satisfy more than one row due
to malformed mixed artifacts, the earlier row in this table wins, except that
any unsafe path observation always wins globally.

## Capability dimensions

### Repository

`repository.status` is one of:

- `local-valid-writable`
- `local-uninitialized`
- `host-managed`
- `control-path-read-only`
- `control-path-invalid`
- `git-unavailable`
- `root-read-only`
- `session-capability-unavailable`
- `worktree-capability-unavailable`
- `unavailable`

Its top-level mapping is exact:

| `repository.status` | Aggregate effect |
| --- | --- |
| `local-valid-writable` | repository prerequisite passed |
| `local-uninitialized` | permitted only with `portable-seed-required` as defined below |
| `host-managed` | repository prerequisite passed only for non-Git onboarding/bootstrap operations |
| `control-path-read-only` | `repository-mount-read-only` |
| `control-path-invalid` | `repository-control-path-invalid` |
| `git-unavailable` | `git-capability-unavailable` |
| `root-read-only` | `project-root-read-only` |
| `session-capability-unavailable` | `session-capability-unavailable` |
| `worktree-capability-unavailable` | `worktree-capability-unavailable` |
| `unavailable` | `repository-observation-unavailable` |

For `host-managed`, Git initialization is forbidden inside the workspace
sandbox and remote freshness is `not-applicable`. After portable seed and
kickoff are valid with the exact `plugin-managed-unattested` runtime form,
`codex-host-repository-init.mjs` may expose one separately confirmed,
digest-bound host action. That action initializes `main` without a commit,
migrates only private continuity into the Git control path, and requires one
ordinary session restart. The full onboarding inspector is never rerun at the
host boundary. No push, remote, merge, tag, publication, or release claim
follows. Only its exact durable admission can promote the runtime to
`plugin-managed` and the aggregate to `ready`.

`local-uninitialized` is permitted only while the aggregate state is
`portable-seed-required`. Its reviewed plan declares
`willInitializeGit: true`, requires a usable Git 2.28+ executable and writable
root, and includes `git init --initial-branch=main` inside the portable-seed
transaction. Successful apply must advance the repository observation to
`local-valid-writable`; otherwise the transaction rolls back and cannot
advance. `local-uninitialized` at any later lifecycle stage is
`repository-control-path-invalid`.

A missing, unexecutable, unrecognized, or older-than-2.28 Git is
`git-unavailable`/`git-capability-unavailable`. A root whose required create,
rename, fsync, or rollback probes cannot complete is
`root-read-only`/`project-root-read-only`. Both stop before `git init` or any
Pipeline target write. Diagnostics may carry a platform-specific install or
permission command as guidance, but the lifecycle exposes no automatic
mutation for either result.

Repository capability is observed before session cleanup, temporary worktree
creation, remote diagnosis, or dispatch. A failed repository prerequisite
stops the lifecycle at that earliest controlling failure.

Intent requirements are exact:

| Intent | Accepted repository mode | Additional capability |
| --- | --- | --- |
| `onboarding` | `local-uninitialized`, `local-valid-writable`, or `host-managed` | no session/worktree operation |
| `bootstrap` | `local-valid-writable` or `host-managed` | no cleanup/worktree; host-managed readiness is bootstrap-only |
| `session` | `local-valid-writable` only | session cleanup capability must pass |
| `dispatch` | `local-valid-writable` only | session cleanup and worktree capability must pass |

For `session|dispatch`, `host-managed` maps to
`repository-mode-unsupported`; it cannot create a branch, cleanup descriptor,
or implementation worktree and must not dispatch. A failed cleanup probe maps
to `session-capability-unavailable`; a failed worktree probe maps to
`worktree-capability-unavailable`. Bootstrap must run a separate
`inspect --intent session` immediately before creating cleanup, and every
implemented Pipeline-owned dispatch caller must run a separate
`inspect --intent dispatch` immediately before Advisor/implementation/Goldfish
dispatch. Earlier `onboarding|bootstrap` readiness cannot be reused as the
stronger intent result. Native Codex launch events outside the declared
shell/file hook surface remain the explicitly deferred boundary above.

### Runtime

`runtime.status` is one of:

- `not-observed`
- `missing`
- `projection-current`
- `projection-drift`
- `plugin-managed`
- `plugin-managed-unattested`
- `target-read-only`
- `restart-required`
- `readback-current`
- `readback-unavailable`

The selected Codex target set includes `.codex/config.toml` and every required
agent definition from the frozen V3 registry. Portable apply may either include
these targets or advance to `runtime-initialization-required`; it may not
report overall readiness while they are absent.

`not-observed` is required when an earlier root, repository, or source failure
prevented safe runtime observation; all runtime digests are then `null` and the
runtime component contributes no action. `target-read-only` is returned when
an otherwise safe target or its nearest existing parent fails the required
create/write/rename/fsync/rollback probe before the runtime plan or apply may
write. It maps exactly to aggregate `runtime-target-read-only`, carries
diagnostic code `runtime_target_read_only`, has all postimage/readback digests
`null`, and exposes `nextAction: null`. A permission error during the actual
transaction rolls back all prior target writes and returns the same mapping;
partial success is forbidden.

`plugin-managed` is accepted only when the reserved Codex runtime control path
is accompanied by the exact durable host-repository-init admission bound to
the current root, portable authority, kickoff state, handover, PRD, Spec, and
private history. An empty read-only `.codex` directory by itself is only
`plugin-managed-unattested`; after valid kickoff it maps to aggregate
`host-repository-init-required`, whose sole next action is the read-only,
plugin-local host-init planner. It never maps to `ready` and therefore cannot
admit guarded project writes.

Runtime initialization reuses the existing V3 migration planner/apply engine
with `initializeMissingRuntime: true`, but the public command is owned by
onboarding and emits no migration-only instructions.

### Restart and effective runtime readback

Creating or materially changing a selected Codex runtime target creates a
digest-bound restart barrier. The canonical JSON encoding used throughout this
section recursively sorts object keys, preserves array order, encodes UTF-8
without a trailing newline, and hashes those bytes with SHA-256.

`pipeline.codex-runtime-restart-barrier.v1` contains exactly:
`schema`, `revision`, `priorStateSha256`, `repositoryFingerprint`,
`sourceSha256`, `runtimeTargets`, `runtimeTargetsSha256`, `transactionId`,
`writerGenerationSha256`, `launcherSha256`, `helperSha256`,
`codexExecutableSha256`, and `state`.
`revision` is a nonnegative safe integer; `priorStateSha256` is `null` at
revision 0 and otherwise 64-hex; `transactionId` is a 1–80 character
`[A-Za-z0-9._-]` identifier; `state` is `restart-required|cleared`.
`runtimeTargets` is the complete frozen selected Codex target set sorted by
project-relative path, each entry containing exactly `path`, `beforeSha256`,
and `afterSha256`; an absent preimage uses `beforeSha256: null`. All other
digest fields are lowercase 64-hex.
`runtimeTargetsSha256` hashes the canonical `runtimeTargets` array. The writer
generation is `SHA-256(randomBytes(32))`, created before mutation; only the
digest is stored. `launcherSha256` hashes the exact
`codex-onboarding-launch.mjs` bytes, `helperSha256` hashes the exact readback
helper bytes, and
`codexExecutableSha256` hashes the exact resolved regular non-symlink
executable bytes used by the restart wrapper. The wrapper rechecks both before
launch, and the reader rechecks all three before receipt production. Clearing
increments the revision, binds the prior raw-state SHA through CAS, and changes
only `revision`, `priorStateSha256`, and `state`.

The record uses the private repository state mechanism already established by
`native-plugin-readback.mjs`. For a normal repository it lives below the
physical Git common directory. For a host-managed root, the fixed resolver
`resolveOnboardingPrivateState(root, repositoryCapability)` returns only
`<physical-root>/.claude/.runtime/agent-pipeline/onboarding`. It accepts that
path only when the already-classified root is `host-managed`, `.claude` and
every component are physical non-symlink directories, the runtime directory
can be created with private platform assurance (POSIX `0700` or the existing
Windows private-state check), and the resolved path cannot escape the root.
This directory is runtime-owned, never a generated projection or committed
authority, and contains digests/nonces only. Any unsafe, unavailable, or
non-private result is `runtime-readback-unavailable`; there is no fallback to
another tracked or host-control path.

A fresh process clears the barrier only through
`pipeline.codex-project-runtime-readback.v1`, containing exactly `schema`,
`barrierSha256`, `repositoryFingerprint`, `sourceSha256`,
`runtimeTargetsSha256`, `readerGenerationSha256`,
`effectiveConfigSha256`, `validatedAgentsSha256`, `ticketId`, and
`observedAtEpochMs`. `ticketId` follows the transaction identifier grammar;
`observedAtEpochMs` is a nonnegative safe integer; `barrierSha256`,
`repositoryFingerprint`, `sourceSha256`, `runtimeTargetsSha256`,
`readerGenerationSha256`, `effectiveConfigSha256`, and
`validatedAgentsSha256` are lowercase 64-hex. `effectiveConfigSha256` hashes the
canonical owned subset returned by Codex `config/read`.
`validatedAgentsSha256` hashes the ordered `{path,sha256,route}` records
produced by strict parsing of every frozen required agent definition.

The sole production producer/verifier is the plugin-local
`codex-project-runtime-readback-host.mjs`. The restart wrapper resolves and
hash-binds that file plus the exact Codex executable before creating the
barrier. In the launched process, before bootstrap confirmation, the helper:

1. authenticates the one-use launch ticket below without changing it;
2. creates a new 256-bit reader-generation nonce from `crypto.randomBytes`,
   retaining only its SHA-256;
3. starts the hash-bound Codex executable as
   `codex --strict-config app-server --listen stdio://`, completes
   `initialize`, and sends `config/read` with exactly
   `{cwd: root, includeLayers: true}`;
4. requires the returned origin/layer set to include the canonical
   `<root>/.codex/config.toml` and hashes only the owned effective config keys;
5. resolves the frozen agent target paths below the physical root, rejects
   symlinks/escape/duplicates, parses them with the production routing TOML
   parser, checks their postimage digests and closed route fields, and hashes
   the ordered validated records;
6. emits the receipt directly to the in-process verifier, never stdout, the
   model, or a repository file.

The helper is bounded to 30 seconds, starts no thread/model turn, accepts no
caller-supplied evidence object, and kills its child on timeout/protocol error.
Tests may inject only the random-byte source, clock, child transport, and
filesystem interface. Production dependency injection is rejected.
Repository file presence alone, mtime, PID/start time, a user statement,
`CAS-READY`, model output, ambient variables other than the ticket inherited
from the fixed wrapper, same-generation evidence, and replay never clear the
barrier. Any missing capability or mismatch returns
`runtime-readback-unavailable` without consuming the barrier.

The reader-generation digest is derived identically from a new
`randomBytes(32)` call inside the launched process. It must differ from the
barrier's writer digest. This inequality is freshness corroboration only; the
one-use hash-bound launch ticket is the process-boundary proof. Tests inject
equal nonces to require a fail-closed same-generation result.

The authenticated issuer/verifier contract is:

1. The restart action invokes only the plugin-local
   `codex-onboarding-launch.mjs`, resolved from the same loaded plugin root that
   produced the lifecycle result and byte-bound in the barrier.
2. With `--activate`, the wrapper acquires the private-state writer lock,
   creates a 256-bit random launch token, and atomically stores
   `pipeline.codex-onboarding-launch.v1` with exactly `schema`, `ticketId`,
   `revision`, `priorStateSha256`, `issuedAtEpochMs`, `expiresAtEpochMs`,
   `barrierSha256`, `repositoryFingerprint`,
   `expectedSourceSha256`, `expectedRuntimeTargetsSha256`,
   `writerGenerationSha256`, `tokenSha256`, `state`, and `consumedBy`.
   Initial `state` is `issued`; `consumedBy` is `null`.
3. The raw token is never printed or stored. It is passed only in the spawned
   Codex process environment together with the non-secret `ticketId`; the
   ticket stores only `tokenSha256`.
4. The wrapper spawns exactly
   `codex -C <root> pipeline-core:pipeline-start`. A strict-config/load failure
   prevents the first turn and leaves the ticket unconsumed.
   `expiresAtEpochMs` is exactly `issuedAtEpochMs + 300000` (five minutes).
   Both are safe nonnegative integer milliseconds from the local OS clock; the
   wrapper and verifier use the same injected clock interface in tests.
5. Before bootstrap confirmation, the plugin-local verifier reads the inherited
   token directly, hashes it, observes the matching `issued` ticket and its raw
   file digest without writing, and rejects missing, duplicate, expired, foreign-root,
   barrier-drifted, or previously consumed tickets. It also rejects a verifier
   time earlier than `issuedAtEpochMs` or at/after `expiresAtEpochMs`; clock
   ambiguity never extends the ticket.
6. The verifier calls only the fixed helper contract above and validates every
   exact receipt field against the current ticket, barrier, source, root, and
   postimage before either state changes.
7. After every receipt field and both CAS preimages validate, successful
   consumption writes `state: consumed` and `consumedBy` containing
   exactly `readerGenerationSha256`, `effectiveConfigSha256`, and
   `validatedAgentsSha256`. Ticket and barrier updates occur under one
   private-state lock: ticket CAS first, barrier CAS second; any failed
   precondition writes neither.

The token authenticates the one-use launch; the helper's strict Codex
`config/read` authenticates effective project configuration; strict
postimage-bound agent parsing authenticates the complete agent routing inputs
that the fresh process will use. Neither the model nor a repository file may
issue or self-sign those facts.

### Continuity

`continuity.status` is one of:

- `absent-pristine`
- `valid`
- `damaged`
- `unavailable`

Only a root with no prior valid continuity history may be
`absent-pristine`/`kickoff-required`. Existing malformed or inconsistent
continuity is `damaged` and has a repair path, not kickoff.

The decision reuses, without redefining, the sanctioned state reader and
validator in `plugins/pipeline-core/scripts/continuity-status.mjs`,
`plugins/pipeline-core/lib/continuity-status.mjs`, and
`plugins/pipeline-core/lib/continuity-state.mjs`. It observes the physical
`<root>/.claude/pipeline-state.json`, the configured handover path from
`<root>/.claude/pipeline.json` (default `docs/state.md` only when that key is
absent), and fixed private history
`<private-onboarding-state>/continuity-history.json`. The handover is a human
projection, never sufficient continuity authority; private history contains
only sanctioned kickoff transaction/digest records.

- `absent-pristine` requires absent machine state, absent configured handover,
  and absent private history;
- `projectReadContinuityStatus` returning code `CS-STATUS-ACTIVE` with
  `continuity.status: valid` is `valid`; handover presence does not upgrade or
  downgrade this machine-valid result;
- any present state returning `CS-STATUS-ACTIVE-NO-CONTINUITY`,
  `CS-STATUS-CONTINUITY-INVALID`, `CS-STATUS-ORPHAN-CONTINUITY`, or an invalid
  active feature is `damaged`; absent machine state with present handover or
  private history is also `damaged`;
- malformed/unreadable machine state, unreadable calibration/handover/private
  history, unsafe path resolution, or any unrecognized reader code is
  `unavailable`.

A manually created or empty `docs/state.md` never establishes validity or
pristine absence. Kickoff eligibility therefore cannot be fabricated by
creating/deleting handover Markdown: without machine state, a present handover
makes the root damaged.

`kickoff-required` first returns a closed `collect-input` action for `goal`.
The goal is required UTF-8 text after trimming, 1–8192 bytes, contains no NUL,
and remains project intent rather than shell syntax. Once supplied, the
lifecycle constructs this exact read-only command action:

```json
{
  "kind": "command",
  "executable": "node",
  "argv": ["<absolute-plugin-script>", "kickoff", "plan", "--root", "<absolute-root>", "--goal", "<validated-goal>"],
  "mutation": false,
  "requiresConfirmation": false,
  "expected": {
    "schema": "pipeline.project-onboarding.v4",
    "statuses": ["kickoff-required"]
  }
}
```

The shared renderer shell-quotes the goal as one argv element. `kickoff plan`
renders a closed proposed continuity record without writing. Its result
contains the digest-bound apply action with exact argv
`kickoff apply --root <root> --goal <validated-goal> --plan-sha256 <sha256> --activate`,
`mutation: true`, `requiresConfirmation: true`, and expected status `ready` for
intent `onboarding`. The goal remains one argv element. Apply validates it again,
reconstructs the same closed plan without ambient state, authenticates the
unchanged plan digest, writes through the sanctioned state writer, and
immediately requires `continuity-status` to return valid. An arbitrary
`docs/state.md` does not satisfy kickoff.

### App Server

App-Server status remains the independent `CAS-*` family. At minimum:

- execution denied maps to `app-server-execution-denied`;
- daemon absent maps to `app-server-not-running`;
- other observation failure maps to `app-server-unavailable`;
- `CAS-READY` maps only to component status `running`.

The public `appServer` component has exactly `required`, `status`, and `code`.
`required` is boolean. `status` is exactly
`not-requested|running|execution-denied|not-running|unavailable`. `code` is
`null` only for `not-requested`; otherwise it is the sanitized observed
`CAS-*` code. Component-to-aggregate mapping is exact:

| `appServer.status` | Aggregate effect when required |
| --- | --- |
| `running` | App-Server prerequisite passed |
| `execution-denied` | `app-server-execution-denied` |
| `not-running` | `app-server-not-running` |
| `unavailable` | `app-server-unavailable` |
| `not-requested` | invalid result when `required: true` |

The code-to-status/action mapping is closed:

| Sanitized code | Component / aggregate | `nextAction` |
| --- | --- | --- |
| `CAS-READY` | `running` / prerequisite passed | `null` |
| `CAS-EXECUTION-UNAVAILABLE` with detail `EPERM|EACCES|EROFS` | `execution-denied` / `app-server-execution-denied` | `null`; the current execution boundary cannot repair it |
| `CAS-EXECUTION-UNAVAILABLE` with any other sanitized detail | `unavailable` / `app-server-unavailable` | `null` |
| `CAS-CODEX-UNAVAILABLE` | `unavailable` / `app-server-unavailable` | plugin `--doctor` wrapper |
| `CAS-DAEMON-UNREACHABLE` | `not-running` / `app-server-not-running` | plugin `--recover` wrapper |
| `CAS-DAEMON-INVALID-OBSERVATION` | `unavailable` / `app-server-unavailable` | plugin `--recover` wrapper |
| `CAS-DAEMON-VERSION-DRIFT` | `unavailable` / `app-server-unavailable` | plugin `--recover` wrapper |
| `CAS-DAEMON-RECOVERY-FAILED` | `unavailable` / `app-server-unavailable` | plugin `--doctor` wrapper |
| any unknown `CAS-*` code | `unavailable` / `app-server-unavailable` | `null` |

The `--doctor` wrapper runs the fixed attended `codex doctor` command once and
returns only `pipeline.codex-app-server-doctor.v1`; it does not reinterpret a
successful diagnostic run as App-Server readiness. The lifecycle requires a
fresh health observation afterward. App-Server health does not clear restart
or runtime-readback barriers.

App-Server requirement is intent-specific:

- `onboarding`: not required; report `appServer.status: not-requested`.
- `bootstrap`: required before bootstrap confirmation or any session component.
- `session`: required before session activation or cleanup.
- `dispatch`: required before every implemented Pipeline-owned Advisor,
  implementation, or subagent launch; native Codex launch events outside the
  declared shell/file hook surface are deferred.

For every required intent, a non-running/non-observable App Server becomes the
matching top-level terminal status. A result therefore never contains
top-level `ready` alongside a required App-Server failure.

## One convergence validator

`v3-bootstrap-authority.mjs` becomes the common convergence reader used by
onboarding, bootstrap, and root `setup.mjs`. It composes:

1. `pipeline.user.v3` source validation;
2. frozen runtime-projection validation;
3. canonical `.claude/pipeline.yaml` manifest validation;
4. generated-target preimage/drift validation;
5. repository-mode compatibility;
6. selected-runner runtime presence;
7. current restart/native readback binding.

The result distinguishes source-valid, projection-current, runtime-current,
and operational-ready. The current `runtimeProjection: noop` result alone is
not operational readiness.

For an upgraded repository whose selected projection is already byte-current
but predates the restart barrier, the common reader returns
`projection-current` and lifecycle V4 maps it to
`runtime-attestation-required`. The read-only `plan-readback` command binds
the complete unchanged runtime target set; only its digest-bound
`apply-readback --activate` may create the barrier. It writes no runtime target
and advances only to `restart-required`.

Existing drift protections remain unchanged:

- owned-key and source validation;
- explicit initialization of missing runtime;
- root/source/target-preimage binding;
- fail-closed non-noop runtime deltas;
- transactional rollback and post-apply readback.

## Remediation contract

Every command action has exactly these fields:

```json
{
  "kind": "command",
  "executable": "node",
  "argv": ["<absolute-plugin-script>", "<operation>", "--root", "<absolute-root>"],
  "mutation": true,
  "requiresConfirmation": true,
  "expected": {
    "schema": "pipeline.project-onboarding.v4",
    "statuses": ["restart-required"]
  }
}
```

`argv` is a nonempty array of strings; `expected.statuses` is a nonempty closed
list for the named schema. `nextAction` is either `null`, this command action,
the restart action below, or this closed input action:

```json
{
  "kind": "collect-input",
  "input": {
    "name": "goal",
    "encoding": "utf8",
    "trim": true,
    "minBytes": 1,
    "maxBytes": 8192,
    "rejectNul": true
  },
  "mutation": false,
  "requiresConfirmation": false,
  "expected": {
    "schema": "pipeline.project-onboarding.v4",
    "statuses": ["kickoff-required"]
  }
}
```

```json
{
  "kind": "restart-process",
  "requiresCurrentProcessExit": true,
  "launch": {
    "executable": "node",
    "argv": [
      "<absolute-plugin-codex-onboarding-launch-script>",
      "--root",
      "<absolute-root>",
      "--barrier-sha256",
      "<sha256>",
      "--activate"
    ]
  },
  "mutation": true,
  "requiresConfirmation": true,
  "expectedStatuses": [
    "portable-seed-required",
    "runtime-initialization-required",
    "kickoff-required",
    "ready",
    "partial",
    "invalid",
    "unsafe",
    "migration-required",
    "adoption-required",
    "repository-mount-read-only",
    "repository-control-path-invalid",
    "git-capability-unavailable",
    "project-root-read-only",
    "repository-mode-unsupported",
    "repository-observation-unavailable",
    "session-capability-unavailable",
    "worktree-capability-unavailable",
    "runtime-target-read-only",
    "runtime-readback-unavailable",
    "projection-drift",
    "continuity-damaged",
    "continuity-observation-unavailable",
    "app-server-execution-denied",
    "app-server-not-running",
    "app-server-unavailable"
  ]
}
```

The lifecycle never auto-executes `restart-process`: it renders the exact
confirmed launch-wrapper command and stops. The wrapper invokes Codex with the
`pipeline-start` prompt; its first onboarding
readback is `inspect --intent bootstrap`. The native host supplies the new
process-generation/runtime receipt to that readback, which clears the barrier
under private-state CAS before continuity and required App-Server checks run.
Absent/invalid host evidence becomes `runtime-readback-unavailable`; a
same-generation or replayed receipt remains rejected and cannot advance.
`expectedStatuses` is the exhaustive set of valid post-restart aggregate
outcomes. It deliberately includes later controlling failures rather than
promising `ready`.

The human rendering is one shell-escaped single line derived from the same
array. It must include every required flag and remain copy-safe when the root
contains spaces. No wrapped fragments, detached flag/value pairs, shell
chains, or instructions to edit generated projections are allowed.

The non-null command catalog is exact (`<onboarding>` is the absolute loaded
`project-onboarding-v3.mjs`; `<migration>` is the absolute loaded
`runner-profile-migration-v3.mjs`; `<app-health>` is the absolute loaded
`codex-app-server-health.mjs`):

| Trigger | `executable` and exact `argv` | Mutation / confirmation | Expected schema and statuses |
| --- | --- | --- | --- |
| `portable-seed-required` | `node [<onboarding>, "plan", "--root", root]` | false / false | `pipeline.project-onboarding.v4`: `portable-seed-required` |
| `runtime-initialization-required` | `node [<onboarding>, "plan-runtime", "--root", root]` | false / false | `pipeline.project-onboarding.v4`: `runtime-initialization-required` |
| `runtime-attestation-required` | `node [<onboarding>, "plan-readback", "--root", root]` | false / false | `pipeline.project-onboarding.v4`: `runtime-attestation-required` |
| `migration-required` | `node [<migration>, "inspect", "--root", root]` | false / false | `pipeline.runner-profile-migration-inspect.v3`: `ready|invalid-root|recovery-required|invalid-source` |
| `adoption-required` | `node [<onboarding>, "plan", "--root", root]` | false / false | `pipeline.project-onboarding.v4`: `adoption-required` |
| `projection-drift` | `node [<onboarding>, "plan-repair", "--root", root]` | false / false | `pipeline.project-onboarding.v4`: `projection-drift` |
| `continuity-damaged` | `node [<onboarding>, "continuity", "inspect", "--root", root]` | false / false | `pipeline.project-onboarding.v4`: `continuity-damaged|continuity-observation-unavailable` |
| `app-server-not-running` | `node [<app-health>, "--recover"]` | true / true | `pipeline.codex-app-server-health.v1`: `ready|unavailable|stale` |
| `app-server-unavailable` with `CAS-CODEX-UNAVAILABLE|CAS-DAEMON-RECOVERY-FAILED` | `node [<app-health>, "--doctor"]` | false / false | `pipeline.codex-app-server-doctor.v1`: `completed|failed` |
| `app-server-unavailable` with `CAS-DAEMON-INVALID-OBSERVATION|CAS-DAEMON-VERSION-DRIFT` | `node [<app-health>, "--recover"]` | true / true | `pipeline.codex-app-server-health.v1`: `ready|unavailable|stale` |

Every plan result returns exactly one digest-bound apply command using the same
command schema:

- portable/adoption:
  `[<onboarding>, "apply-portable-seed", "--root", root, "--plan-sha256", digest, "--activate"]`,
  expected `runtime-initialization-required|restart-required`;
- runtime:
  `[<onboarding>, "initialize-runtime", "--root", root, "--plan-sha256", digest, "--activate"]`,
  expected `restart-required`;
- projection-current readback bootstrap:
  `[<onboarding>, "apply-readback", "--root", root, "--plan-sha256", digest, "--activate"]`,
  expected `restart-required`, with no runtime-target write;
- projection repair:
  `[<onboarding>, "apply-repair", "--root", root, "--plan-sha256", digest, "--activate"]`,
  expected `restart-required|kickoff-required|ready`;
- migration uses the existing complete V3 plan/apply preview and activation
  contract; onboarding never renders a partial migration command.

Terminal status recovery is closed:

| Terminal status | `nextAction` |
| --- | --- |
| `migration-required` | structured migration `inspect`; its closed result may expose a later confirmed plan/apply action |
| `adoption-required` | structured onboarding `plan`; apply is a later confirmed action |
| `partial`, `invalid`, `unsafe` | `null`; diagnostics name the bounded inspection/repair owner |
| `repository-mount-read-only` | `null`; current environment cannot repair it |
| `repository-control-path-invalid` | `null`; diagnostics distinguish missing, empty, malformed, and foreign controls |
| `git-capability-unavailable` | `null`; diagnostics may name the exact platform install/upgrade command, but never execute it |
| `project-root-read-only` | `null`; the current root cannot safely host the transaction |
| `repository-mode-unsupported` | `null`; this repository mode cannot satisfy the requested session/dispatch intent |
| `repository-observation-unavailable` | `null`; repository capability was not observed and no later stage may run |
| `session-capability-unavailable` | `null`; cleanup/session prerequisites failed before side effects |
| `worktree-capability-unavailable` | `null`; diagnostics identify the failed capability, but 0.4.5 defines no automatic retry |
| `runtime-target-read-only` | `null`; current environment cannot initialize runtime |
| `runtime-readback-unavailable` | `null`; restart/readback capability is unsupported here |
| `projection-drift` | structured onboarding `plan-repair`; it identifies the V3 source and proposed generated-target replacements without writing; only the returned digest-bound `apply-repair --activate` may mutate |
| `continuity-damaged` | structured continuity `inspect`; never kickoff apply |
| `continuity-observation-unavailable` | `null`; continuity authority could not be read and kickoff/session/dispatch remain blocked |
| `app-server-execution-denied` | `null` plus environment-specific guidance; no generic doctor claim |
| `app-server-not-running` | structured bounded `codex app-server daemon restart` action |
| `app-server-unavailable` | exact `--recover`, `--doctor`, or `null` from the closed `CAS-*` mapping above |

Every row is covered by exact-schema and rendered-command tests. `null` means
the current environment has no sanctioned automatic repair, not that an agent
may improvise one.

## Enforcement

Bootstrap, session activation, every implemented Pipeline-owned Advisor,
implementation/Goldfish dispatch caller, cleanup creation, worktree creation,
and every declared Codex shell/file mutation hook consume the lifecycle
readback appropriate to their intent.

- Before `ready`, bootstrap prints no success confirmation.
- Before repository capability passes, no cleanup/worktree/remote action starts.
- Before runtime readback passes, no session activation or model duty starts.
- Before valid continuity passes, no implemented Pipeline-owned implementation
  or Goldfish dispatch starts.
- Guards fail closed when lifecycle authority is missing, malformed, stale, or
  non-ready.
- Bash is a write-capable implementation boundary: governed non-ready roots
  block arbitrary shell commands and allow only exact plugin-local lifecycle,
  migration, restart/readback, or App-Server remediation argv shapes.

The implementation must cover each in-scope command caller and every declared
hook; prose alone is not enforcement. Native launch events that Codex does not
expose through the declared hook surface are the explicit follow-up boundary,
not an inferred 0.4.5 assurance. Existing `guard-devplan` fail-open behavior
for absent state is not reused for this readiness barrier.

## Implementation packages

### Package A — lifecycle kernel and convergence

- Extend `lib/project-onboarding-v3.mjs` and its CLI.
- Add the closed lifecycle schema and transition-table tests.
- Reuse runner-profile migration internally for missing Codex runtime.
- Add manifest validation to the common authority readback.
- Route root `setup.mjs` through the classifier.

### Package B — capabilities, restart, and kickoff

- Add early repository/worktree/runtime capability observation.
- Extend repository freshness for the narrow host-managed result.
- Add project-runtime native readback and restart barrier.
- Document the one-use ticket authentication/trust boundary in
  `docs/codex-onboarding-threat-model.md`.
- Add sanctioned kickoff plan/apply plus continuity readback.
- Refine App-Server result mapping and recovery.

### Package C — session and dispatch enforcement

- Gate `pipeline-start`, main-session route alignment, session cleanup,
  worktree creation, implemented Pipeline-owned Advisor and
  implementation/Goldfish dispatch callers, and the declared Codex shell/file
  mutation hooks on the lifecycle state appropriate to each stage.
- Update hook wiring and tests so missing/stale/non-ready authority cannot
  silently pass.
- Record native Codex implementation, Goldfish, and subagent-launch event
  interception as deferred rather than inventing unsupported hook wiring.

### Package D — local candidate acceptance

- Register every focused suite in the single Verify gate.
- Update user-facing onboarding documentation and complete examples.
- Run focused tests, Full Verify, blocking Security, and the high-risk Critic
  before any local installation.
- Install the exact tested worktree into the local Codex plugin cache through
  the sanctioned development cachebuster flow, without first editing committed
  version surfaces.
- Read back the active plugin root and candidate digests, then stop for the
  operator's live onboarding test and explicit acceptance.

### Package E — finalized 0.4.5 surface

- Only after live acceptance, set `VERSION`, the Claude plugin manifest, and
  the Codex plugin manifest to `0.4.5` and add the 0.4.5 changelog entry.
- Re-run the required candidate checks after those release-surface changes.
- Create the final commit and push only when separately authorized.
- Do not tag, publish, merge, push, close Issue #61, or claim release without
  their separate gates and authorization.

## Test matrix

The required fixture outcomes are exact:

| Fixture / intent | Aggregate status | Controlling component | `nextAction` |
| --- | --- | --- | --- |
| empty local root / onboarding | `portable-seed-required` | repository `local-uninitialized` | portable seed plan |
| recognized read-only host controls / onboarding | `portable-seed-required` | repository `host-managed` | portable seed plan with no Git/`.codex` write |
| host-managed Codex root after portable seed | `kickoff-required` | runtime `plugin-managed-unattested` | collect goal; no runtime initialization/readback restart |
| host-managed Codex root after kickoff | `host-repository-init-required` | repository `host-managed`, runtime `plugin-managed-unattested` | digest-bound host repository-init planner |
| confirmed host repository init | `restart-required` from the host helper | physical Git initialized, private continuity migrated | exactly one ordinary project-session restart |
| fresh session after host repository init | `ready` | repository `local-valid-writable`, runtime receipt-bound `plugin-managed` | normal session bootstrap; no runtime init/readback or second restart |
| recognized host controls / session or dispatch | `repository-mode-unsupported` | repository `host-managed` | `null` |
| existing unmanaged local Git root | `adoption-required` | source | adoption plan |
| valid V0/V1/V2 source | `migration-required` | source | migration inspect |
| valid V3 source, Codex runtime absent | `runtime-initialization-required` | runtime `missing` | runtime plan |
| valid V3 source/projection, no historical restart/readback authority | `runtime-attestation-required` | runtime `projection-current` | readback bootstrap plan |
| generated manifest/schema invalid | `partial` | source/projection with diagnostic `manifest_invalid` | `null` |
| owned generated bytes drift | `projection-drift` | runtime `projection-drift` | plan-repair |
| runtime target probe fails | `runtime-target-read-only` | runtime `target-read-only` | `null` |
| runtime apply succeeds | `restart-required` | runtime `restart-required` | restart-process |
| readback bootstrap apply succeeds without target writes | `restart-required` | runtime `restart-required` | restart-process |
| runtime apply replay, unchanged postimage | `restart-required` | existing barrier | same restart-process action, zero target writes |
| runtime apply preimage drift or transactional failure | `projection-drift` or `runtime-target-read-only` according to the observed cause | runtime | exact mapped action; complete rollback |
| same process presents barrier | `restart-required` | runtime `restart-required` | restart-process |
| fresh ticket plus valid host receipt | `kickoff-required` when pristine; otherwise the next controlling row | runtime `readback-current` | collect goal when pristine |
| host receipt unavailable/invalid/replayed | `runtime-readback-unavailable` | runtime `readback-unavailable` | `null` |
| absent sanctioned state | `kickoff-required` | continuity `absent-pristine` | collect goal |
| malformed/orphan/incomplete sanctioned state | `continuity-damaged` | continuity `damaged` | continuity inspect |
| read-only/invalid Git controls | `repository-mount-read-only` or `repository-control-path-invalid` according to the exact repository mapping | repository | `null` |
| failed dispatch worktree probe | `worktree-capability-unavailable` | repository `worktree-capability-unavailable` | `null` |
| required App Server `EPERM|EACCES|EROFS` | `app-server-execution-denied` | App Server | `null` |
| required App Server daemon absent | `app-server-not-running` | App Server | recover wrapper |
| required App Server other unavailable code | `app-server-unavailable` | App Server | exact closed CAS mapping |
| all required dimensions valid | `ready` | none | `null` |

Every row runs with a root containing spaces and asserts the exact component
object, diagnostic code, structured argv, and single-line rendering. Compound
fixtures combine App-Server plus continuity/runtime failures and assert the
global precedence table. Bootstrap, session, cleanup, every implemented
Pipeline-owned Advisor/implementation/Critic/Goldfish caller, and every
declared Codex shell/file mutation entry point have denial coverage for their
controlling non-ready classes plus a `ready` allow fixture. The tests also
assert that the hook manifest makes no unsupported native agent-launch claim.
Completed-stage replay asserts zero unintended writes and an identical
canonical response.

Each fixture asserts both zero unintended writes and the exact typed next
action where applicable.

## Verification and review

- Focused unit and process-level E2E suites for all four packages.
- `node harness/scripts/verify.mjs` on the exact candidate.
- Blocking security gate.
- Independent high-risk Critic because lifecycle, hooks, runtime authority,
  and generated projections are guardrail surfaces.
- Exact local-install source/digest readback before the operator's live test.
- Explicit operator live acceptance before version, final commit, or push.
- Exact finalized candidate/version readback before any release action.

## Rollback

Code rollback is an ordinary revert of the 0.4.5 candidate. Runtime apply
retains transactional preimages and rolls back a failed stage in place.
Completed consumer stages are never silently downgraded; an older plugin that
cannot validate the newer lifecycle reports migration/authority unavailable
rather than rewriting state.
