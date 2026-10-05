# Toolbox hard-crash recovery candidate (inert)

Status: design prototype only. No production file, private store, State, key, or
guard was changed. The two complete existing-source postimages and the native
observer/classifier module postimages are reviewable patch inputs, not installed
modules. `candidate.test.mjs` is retained fixture coverage. The attempted RED test was refused by
`GUARD-DEVPLAN-SHELL` because `sprint-alfred-epic` is draft; no execution result
is claimed. This package does not include a legacy recovery writer.

## Anchors and compatibility

Baseline HEAD `70e49364f7821e955c4f4458350f42f537180542`, tree
`faec4c2646acd4de0f076c400b6756b4aaf33125`.

| Owned source | Baseline SHA-256 |
| --- | --- |
| `plugins/pipeline-core/lib/worktree-lifecycle.mjs` | `fb5ff99aa50e4873990d6416dd7654fbc32fbf3a2eb96c5dfa012e48b3399454` |
| `plugins/pipeline-core/lib/worktree-lifecycle.test.mjs` | `b08d48c657fd659a75cf4b70dd2ed5b89567fffd43b87221c234e24f34df82b2` |
| `plugins/pipeline-core/lib/onboarding-continuity.mjs` | `913355d0f280d89c9354e29cde74d04de07bc84a2b4576c09460ca8627d1ff41` |
| `plugins/pipeline-core/lib/session-cleanup-recovery.mjs` | `f451e3120700a2631d7680f57a0b63df201be3dbc2544e73288e08fa0d939b79` |
| `plugins/pipeline-core/scripts/session-cleanup.mjs` | `5d5cd2d8ba19e4611b5acd9e265c1e6c09a1d5301e7a9a29373d816158402249` |

Exact compatibility rule: `pipeline.session-descriptor.v1` (seven keys) and
`.v2` (eight keys) remain accepted and byte-identical; old descriptors are
never rewritten to v3. V1 inspection stays `unobserved`; V2 `ownerRuntime:null`
stays `unavailable`. Existing v1 runtime `{schema,pid,processStartId}` remains
interpreted by its existing Linux path and cannot acquire retrospective boot
evidence. All descriptor digests continue to hash the persisted bytes, with no
normalization. Existing release receipts retain their v1 authenticated wire
shape and exact bytes. An interrupted replay keeps the existing authenticated
`by`, `reason`, and `releasedAt`; it does not synthesize a new timestamp.

## Proposed source integration

The concrete scratch postimages are `worktree-lifecycle.postimage.mjs`
(corresponds to the baseline file with only the owner v3 changes),
`worktree-lifecycle.test.postimage.mjs` (injected creation/inspection fixture),
`onboarding-continuity.postimage.mjs` (both receipt CAS sites),
`owner-native-v2.postimage.mjs` (install as
`plugins/pipeline-core/lib/session-owner-native-v2.mjs`), and
`session-owner-classifier-v2.postimage.mjs` (install as
`plugins/pipeline-core/lib/session-owner-classifier-v2.mjs`). The source diff
is obtained by `diff -u` of each baseline source and corresponding postimage;
the two new modules have no baseline. The tests import the scratch observer
directly and do not exercise the patched production callsite until admission.
`SOURCE.patch` is the unified source patch for seven target files, including
`legacy-null-owner-recovery.postimage.mjs` and its test postimage;
`git apply --check scratch/toolbox-crash-repair-proposal/SOURCE.patch` returned
exit 0 against the baseline working tree. This is a read-only applicability
check, not an application or an execution test.

1. Install the pure `validOwnerRuntimeV2` and `classifyOwner` module and the
   worktree lifecycle postimage. It introduces
   `pipeline.session-descriptor.v3` with the same outer keys as v2 and a closed
   `pipeline.session-owner-runtime.v2` value
   `{schema,hostIdSha256,bootId,pid,processStartId}`. A new descriptor is v3
   only when the full local observation succeeds. On failure retain a v3 null
   owner and an explicit `unavailable` result; never infer death. Add an
   injected `observeNativeOwner({pid,platform})` dependency for deterministic
   tests. The production observer must return a closed result with only
   `{status:'ok',hostIdSha256,bootId,process:{status:'present',startId}}`,
   `{status:'ok',...,process:{status:'absent'}}`, or a typed unavailable status.
2. The candidate Windows observation uses a fixed, bounded native command with
   `execFile` or `spawnSync`, `shell:false`, trusted absolute executable, fixed
   arguments, timeout, maximum output bytes, and closed JSON parsing. A fixed
   PowerShell command may query CIM `Win32_OperatingSystem.LastBootUpTime`,
   `Win32_Process.CreationDate`, and `Win32_ComputerSystemProduct.UUID`. Parse
   CIM dates strictly and canonicalize UTC; validate positive PID and a
   non-sentinel UUID (reject all-zero, all-`F`, missing, or malformed values),
   hash a domain-separated host identity, and expose only the SHA-256.
   Never interpolate a descriptor value into command text; pass a validated PID
   as a separate argument if supported. Do not use shell invocation or install
   packages. A failed command, missing CIM property, malformed/truncated
   output, access denial, or inconsistent two-read boot snapshot is
   `unavailable`. `Get-CimInstance` returning no process after successful boot
   and host observations is `absent`, never a generic command failure.
   The scratch runner requires the standard `C:\Windows` system root; a
   nonstandard installation fails closed until its executable trust check is
   specified. A cloned or firmware-default UUID is a residual same-host
   ambiguity; production admission needs a tested host identity policy.
   Microsoft class references:
   https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-operatingsystem
   https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-process
   https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-computersystemproduct
   These establish property semantics, not a host-tested implementation.
3. Linux v2 observes a stable host identifier plus `/proc/sys/kernel/random/boot_id`
   and `/proc/<pid>/stat` start ticks; re-read boot ID around the PID read. The
   older v1 Linux path stays unchanged. A host-ID source must be specified and
   tested before production adoption; a machine ID may be unavailable or copied
   into clones, so fail closed if absent or ambiguous. macOS receives a typed
   `unavailable` until a bounded host/boot/birth observer is implemented and
   tested. A changed boot only establishes death after the same host is proven.
4. Status `reused` means the recorded owner is dead, but the replacement PID
   may be live. No `process.kill` call is authorized by that status. The
   classifier exposes no PID or raw host identifier in a public result.
5. The continuity postimage adds `orphanReceiptCasDiagnostic` at the private
   cleanup read boundary. Before each existing
   `SESSION-CLEANUP-PRIVATE-CAS` conflict, derive an authenticated, sanitized
   diagnostic: receipt presence/validity, digest, schema, and booleans for
   feature, State digest, and binding digest equality. Include the diagnostic
   in bounded `KickoffError.message` text already printed by
   `session-cleanup.mjs`'s CLI error handler,
   without nonce, MAC/key, raw private path, or receipt free text. `invalid`
   never becomes `absent`; conflicting receipts are never deleted. Ensure the
   no-binding branch at current line 3674 has no independent old binding
   preimage, so it reports `matches.binding:null`, never an invented match.
   The bound branch compares the live private binding hash exactly. A separate
   authenticated archive is needed to prove the former binding in the
   no-binding branch; the candidate does not invent it.

## Separate legacy null-owner transaction: state machine candidate

The existing `release-orphan-binding` requires discarded State and is not a
safe answer for an active legacy Windows binding. The scratch source patch adds
`planLegacyNullOwnerSessionRecovery` and `applyLegacyNullOwnerSessionRecovery`
exports, with a separate `legacy-null-owner-recovery.mjs` plan/apply state
machine. Planning is read-only and returns a digest-bound request, not a
permission to mutate. The signed attended intent binds the plan digest,
physical Git repository/common-dir identity, descriptor and manifest byte
hashes and identities, binding byte hash and authenticated feature tuple,
release receipt status/schema/digest and match flags, portable State byte hash,
all resource path identities, and an explicit acknowledgement that old
Windows owner liveness cannot be proven and all affected sessions are closed.
The candidate must be an existing v2 descriptor whose ownerRuntime is exactly
null; v1 remains ineligible. A valid foreign/active owner, malformed descriptor,
unreadable manifest, unsafe path, or ambiguous physical identity refuses.

Apply requires a detached PO signature verified by the existing
`verifyAgainstTrustAnchors` path. Neither the agent nor the CLI can mint the
proof. The state machine requires a sealed custody adapter that rechecks
physical repo, State, resource digest and exact control preimages under an
authenticated lock. It archives exact descriptor, manifest, binding and old
receipt bytes, including invalid or stale receipt bytes only as explicitly
signed non-authoritative evidence. It journals `ready` before any retire and
`complete` after exact retire of receipt, descriptor, manifest and binding.
The adapter must make each archive/journal write durable and authenticated,
CAS each named removal, and return exact readback. A retry with a matching
authenticated journal can advance after a partial retirement, including after
the plan's start TTL expires. State, feature, proofs and resources remain
byte-identical. A crash after `ready` returns `committed:true` and never rolls
back over a later writer.

**Unsupported prerequisites before real activation:** the repository has no
exposed authenticated crash-recoverable lock for this namespace. Its local
`acquireLock` uses age-based reclamation, unsuitable for this transaction;
the robust HGO audit lock is private to another module. The sealed custody
adapter, exclusive authenticated archive and journal writer/readback, and
replay-time physical observation after control names disappear are specified
but not implemented. No CLI subcommand or lifecycle-guard allow rule is added,
so the exported apply wrapper cannot execute a real mutation. These gaps are
blocking, not implied tests or hidden fallbacks. Full admission also needs an
independent review of lock ordering and signed proof subject before activation.

## Required durable tests after admission

`candidate.test.mjs` covers the pure owner and CAS matrix. Integration tests
must add: v3 Windows changed-boot same-host; foreign/unknown boot; native
failure; live/absent/reused PID; v1 and v2-null unchanged bytes/digests;
missing/invalid/matching/conflicting receipt on each schema/feature/State/
binding axis and interrupted replay retaining metadata. Transaction fixtures
must prove plan performs zero writes; wrong-repository, forged, expired, and
stale proof refusal; live/ambiguous owner refusal; exact resource retention;
immutable archive plus fault injection after each durable boundary; replay
idempotence; State/feature/proofs byte equality; receipt conflict preservation.
Run the existing worktree, cleanup recovery, continuity, CLI binding, and guard
suites only after the relevant governed source is admitted. A Windows CI host
must exercise the native observer; Linux simulation is insufficient evidence.
