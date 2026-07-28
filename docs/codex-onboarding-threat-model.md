# Codex onboarding trust and restart threat model

Status: active for the `pipeline.project-onboarding.v4` lifecycle introduced by
Issue #61.

## Protected assets

- The portable `pipeline.user.v3` source and its selected Codex runtime
  projections.
- The effective runtime actually loaded by the fresh Codex process.
- Repository-private restart barriers, launch tickets, consumed-ticket
  records, and native readback receipts.
- The initial continuity transaction and its PRD, Spec, handover, state, and
  private history postimages.
- The host-repository-init transaction intent and the atomically published
  admission directory containing its intent, receipt, and receipt-digest
  marker.
- The readiness decision consumed by bootstrap, session, worktree, Advisor,
  Critic, implementation, Goldfish, and write guards.

Launch tokens are authentication material, not project configuration. They are
never committed, printed, included in lifecycle results, copied into evidence,
or accepted from a project file.

## Trust boundaries

1. A project checkout and its portable authority are untrusted until physical
   path, source, manifest, projection, and preimage validation pass.
2. The active Codex process is not trusted to claim that newly written project
   runtime is loaded. Only a separately launched fresh process may produce the
   native `config/read` observation.
3. The restart launcher, readback helper, selected Codex executable, barrier,
   ticket, and receipt are distinct identities. Every handoff binds their
   exact digests plus the repository fingerprint, source digest, complete
   runtime-target digest, transaction, and writer generation.
4. Repository-private state is outside portable project authority. It must use
   the physical Git common directory, or the explicitly classified
   host-managed private directory, with private ownership/mode assurance and
   no symlink traversal.
5. A shell command is a write-capable boundary. In a governed non-ready root,
   Bash, Edit, Write, and apply_patch remain blocked except for an exact
   plugin-local lifecycle/remediation command with closed arguments.
6. The separately confirmed host initializer is the sole issuer of the 0.4.5
   compatibility admission. The workspace process may consume that admission
   but cannot mint it, infer it from an empty control mount, or replace its
   exact root/plan/authority/history bindings.
7. A pre-release Codex candidate uses the isolated installed identity
   `pipeline-core@agent-pipeline-local`; released operation uses
   `pipeline-core@agent-pipeline`. The local identity is accepted only from an
   exact registered local marketplace root containing its plugin source. This
   prevents an older resumed session from reconciling the released identity
   over a candidate cache. The complete operator transition and remote return
   readback are defined in
   [`codex-local-plugin-development.md`](codex-local-plugin-development.md).
8. The restart launcher is an external-terminal boundary. It refuses an active
   Codex thread before ticket issuance; neither a Codex tool PTY nor a normal
   tokenless session restart is a valid substitute. The raw token exists only
   in the directly invoked readback-helper environment. That helper removes it
   before starting a separate strict Codex App Server, performs the bound
   `config/read`, and clears the barrier before the wrapper starts an ordinary
   token-free TUI. A failure before readback leaves one bounded ticket and
   publishes its retry-after time, so no immediate parallel ticket may be
   issued. A TUI-start failure after readback is reported separately and does
   not invalidate or repeat the consumed readback.
9. The start preflight selects one capability execution boundary for the whole
   bootstrap. On WSL, fixed read-only helpers that inspect or spawn Git, probe
   worktree/session capability, or observe the App-Server socket run directly
   at the host-authorized local boundary; remote freshness alone uses the
   network-open/read-only boundary. They are not first run in the known-
   incompatible workspace sandbox. This avoids false `EPERM`, invalid-layout,
   socket-unavailable, and DNS results without widening mutation authority,
   project access, Critic/Advisor isolation, or assurance.

## Attacker capabilities

The model assumes an attacker or concurrent process may alter project files,
replace a target between plan and commit, replay or duplicate a ticket, inject
a foreign private-state file, present a wrong executable/helper identity,
reuse the writer generation, race barrier publication, forge App-Server
availability, or invoke a write through Bash instead of a structured edit
tool. It also assumes project content may contain shell metacharacters and
paths with spaces.

The model does not treat a same-user fully compromised host as a secret-safe
execution environment. OS isolation is supplied by the selected host
transport, not invented by onboarding.

## Authentication and authorization controls

- Runtime projection apply and projection-current adoption both create a
  durable restart barrier before any operational-ready claim.
- Barrier absence is `runtime-attestation-required`, never readiness. Its sole
  writer is the explicit digest-bound `apply-readback --activate` lifecycle
  operation, which records the complete unchanged runtime target set and then
  requires restart.
- A pending barrier whose launcher, helper, or Codex executable binding no
  longer matches the loaded candidate is also `runtime-attestation-required`.
  The same reviewed `apply-readback` path replaces it; the inspector never
  reissues an action that the current launcher must reject.
- The launcher issues one random, expiring, single-live ticket for one exact
  barrier. Only the token digest is persisted; the raw token exists only in
  the directly invoked helper environment and is removed before that helper
  starts the strict Codex App Server child.
- Authentication rechecks the ticket ID, token digest, expiry, repository,
  source, runtime targets, barrier, writer generation, launcher, helper, and
  Codex executable. Missing, duplicate, expired, replayed, wrong-identity, or
  same-generation evidence fails closed.
- Ticket consumption, readback publication, and barrier clearing are one-use
  CAS transitions. A consumed ticket cannot authenticate another readback.
- Operational readiness requires the cleared barrier and its exact current
  native readback marker. A projection-only no-op is explicitly non-ready.
- Lifecycle admission is intent-bound. Stronger session and dispatch intents
  repeat their capability probes and cannot reuse onboarding/bootstrap
  readiness.
- Host initialization first durably publishes a private pending intent bound
  to the reviewed plan and root. It exclusively reserves `.git`, durably binds
  that directory's device/inode identity before `git init`, and records the
  closed initialized core-tree digest only after successful initialization.
  If the process ends before admission publication, the same digest-bound
  apply resumes only that exact reserved identity and tree. A partial,
  replaced, or unrelated physical `.git` cannot borrow the pending intent.
  The final admission retains the Git device/inode and initialized core-tree
  digest, so an already completed apply also revalidates its unchanged
  postimage before returning `restart-required`.
- The host admission is one mode-0700 directory published by a single atomic
  rename. It contains an exact intent, v2 receipt, and marker. The marker binds
  both intent and receipt digests; the receipt binds root, reviewed plan,
  portable authority, kickoff history, Git version, branch, Git identity, and
  initialized core-tree digest.
- Admission files are opened with `O_NOFOLLOW` and read through descriptors.
  Leaf device/inode/mode/link identity and every parent-directory identity are
  checked before and after the read. A raced replacement is invalid evidence,
  not bytes that can authorize guarded writes.
- Only the complete atomically published directory is authoritative. A
  malformed directory or any missing counterpart is terminal
  `projection-drift`; a pending intent is recovery authority only and never a
  readiness receipt.

## Failure and rollback behavior

Private-state writes use exclusive no-follow creation, file fsync, atomic
rename, directory fsync, exact descriptor-bound readback, and identity-bound
cleanup. Git-tree files are read through no-follow descriptors and their leaf
and parent identities are checked after the read; directory identities and
membership are checked before and after traversal. The host-init files
are assembled below the exact pending intent and
renamed as one directory, so the authoritative namespace exposes neither a
receipt-only nor marker-only crash state. A retry resumes the exact pending
intent, reserved Git identity/tree, and byte-identical partial files; a
mismatched pending intent, partial/replaced/foreign Git path, raced
parent/leaf, or changed postimage fails closed. Runtime and
kickoff writers verify every preimage, retain crash-recovery authority, and
roll back or clean up only files/directories whose device, inode, link count,
and digest still match identities captured at creation or validation, never
identities sampled immediately before deletion. Foreign or identity-drifted
pending paths are preserved and reported as `pending_cleanup_retained`.
Cleanup first atomically renames each recorded object to a fresh quarantine
name outside the active transaction namespace and revalidates its recorded
identity and bytes there. Validated captures are retained in that private,
non-authoritative quarantine instead of being passed to a final pathname
unlink that cannot be inode-bound by Node. Directory captures also require
unchanged empty membership before and after capture, so an added child is
preserved and reported rather than silently relocated as clean. Operational
persistence failures remain distinct from preimage drift and generic host
failure, and a retry repeats exact transaction-file fsync plus Git and
pending-directory fsync. It also repeats the pending parent-directory fsync
before Git preparation, so a visible but not durably published transaction
cannot authorize a new Git control. Directory fsync opens with no-follow
directory semantics and binds the descriptor's identity before and after
fsync to both the pre-open and final pathname identity, rejecting an ABA
replacement rather than syncing a foreign directory.
Disposable-worktree rollback first renames the exact
recorded tree into quarantine. Each recorded leaf is then atomically renamed
to a fresh cleanup name and revalidated there before unlink/rmdir; a
replacement between the first validation and atomic capture is restored and
retained rather than deleted.

Rollback of the shipped change is a source revert before release. A live local
candidate is removed by restoring the prior installed plugin selection and
starting a new Codex thread; it does not rewrite consumer authority. Existing
restart-required private state remains controlling until its exact readback or
an explicit, independently reviewed recovery handles it.

## PO authority rebind transaction

The narrow PO-authority rebind accepts only one stale authority shape: the
current physical PRD, the approved PO-gate PRD digest, and the Continuity PRD
authority must all name the same old PRD bytes, while their Spec binding equals
the one older PRD marker. A mismatched Continuity PRD authority is corruption,
not a repair candidate. This prevents the rebind command from becoming a
general State-authority editor.

Before replacing either authority file, apply durably publishes one private,
single-link transaction record below `.claude/`. It contains the exact
confirmed plan digest and the authenticated preimage bytes/digests/modes for
the PRD and State together with their intended postimage digests. PRD and
State replacements use same-directory temporary files, file fsync, atomic
rename, and directory fsync. The record remains authoritative until both
postimages pass PO-gate, Continuity, and V4 readback, after which it is removed
and the containing directory is synced.

If a process stops during the transaction, a replay of the same exact confirmed
action first authenticates the record and accepts only the recorded
preimage/postimage combinations. Two unchanged preimages are a prepared, not a
committed, transaction: replay durably clears the record, revalidates the
original closed plan, republishes the record, and performs the authorized
transition. A mixed pair is restored to both recorded preimages; the record is
removed only after verified rollback, and a newly observed plan and PO
confirmation are then required. Two exact postimages become a no-op only after
fresh PO-gate, Continuity, and V4 readback. An unknown, linked, hard-linked,
identity-drifted, malformed, wrong-plan, or unprovable record fails closed and
is preserved. On Windows the existing repository PO-profile receipt supplies
the native owner/DACL assurance before any transaction is admitted; POSIX
retains the private State/journal modes. No replay can widen authority,
silently accept stale preimages, force-close a feature, or convert a manual
State edit into a valid rebind.

The v2 host-init receipt is the first release candidate that carries the
physical Git postimage. The earlier v1 shape existed only in unpublished local
0.4.5 test candidates and is deliberately non-authoritative under this
candidate; it is terminal invalid rather than silently upgraded from an
unbound postimage. Released 0.4.4 issued no host-init receipt.

## Residual risk

| Residual | Owner | Expiry / mandatory review |
|---|---|---|
| Raw launch tokens necessarily exist in the directly invoked helper environment until consumed or expired. The helper removes them before starting the strict App Server child. Process inspection by the same fully compromised OS account is outside the protection offered here. | `pipeline-core` security maintainers | 2026-10-31 |
| Directory durability has platform-specific limits already represented by the private-state assurance layer; unsupported assurance never becomes a strong success claim. | `pipeline-core` runtime maintainers | 2026-10-31 |
| The Bash exemption recognizes only exact plugin-local remediation command shapes. Novel legitimate recovery commands remain blocked and require a reviewed lifecycle change or manual PO execution rather than a broad shell bypass. | `pipeline-core` guardrail maintainers | 2026-10-31 |
| The Push-Gate accepts the documented override prefix only when its assignment is a literal shell value. Dynamic Bash or PowerShell assignment forms remain part of the raw command and fail the one-standalone-command parser, preventing command substitution from piggybacking on an approved push. | `pipeline-core` guardrail maintainers | 2026-10-31 |
| One fresh host initialization retains five small writer-owned transaction captures below private `.claude/.runtime/agent-pipeline/.host-init-quarantine-*` directories. They are non-authoritative and avoid an ungrounded inode-safe deletion claim; bounded garbage collection requires a future native identity-bound host primitive. | `pipeline-core` runtime maintainers | 2026-10-31 |

These residuals add no credential store, network trust, or third-party
dependency. Any future widening of the token carrier, accepted executable
identity, shell exemption, repository-private location, or ready receipt must
update this threat model and receive a new security/Critic review.
