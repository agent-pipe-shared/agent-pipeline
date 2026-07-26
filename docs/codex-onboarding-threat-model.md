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
- The launcher issues one random, expiring, single-live ticket for one exact
  barrier. Only the token digest is persisted; the raw token exists only in
  the fresh child environment.
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
- The host admission is one mode-0700 directory published by a single atomic
  rename. It contains an exact intent, receipt, and marker. The marker binds
  both intent and receipt digests; the receipt binds root, reviewed plan,
  portable authority, kickoff history, Git version, and branch.
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
cleanup. The host-init files are assembled below the exact pending intent and
renamed as one directory, so the authoritative namespace exposes neither a
receipt-only nor marker-only crash state. A retry resumes the exact pending
intent, reserved Git identity/tree, and byte-identical partial files; a
mismatched pending intent, partial/replaced/foreign Git path, raced
parent/leaf, or changed postimage fails closed. Runtime and
kickoff writers verify every preimage, retain crash-recovery authority, and
roll back only files/directories whose device, inode, link count, and digest
still match the writer's records. Foreign or identity-drifted paths are
preserved and the operation reports an unavailable/indeterminate result
instead of false success. Disposable-worktree rollback first renames the exact
recorded tree into quarantine. Each recorded leaf is then atomically renamed
to a fresh cleanup name and revalidated there before unlink/rmdir; a
replacement between the first validation and atomic capture is restored and
retained rather than deleted.

Rollback of the shipped change is a source revert before release. A live local
candidate is removed by restoring the prior installed plugin selection and
starting a new Codex thread; it does not rewrite consumer authority. Existing
restart-required private state remains controlling until its exact readback or
an explicit, independently reviewed recovery handles it.

## Residual risk

| Residual | Owner | Expiry / mandatory review |
|---|---|---|
| Raw launch tokens necessarily exist in one fresh child environment until consumed or expired. Process inspection by the same fully compromised OS account is outside the protection offered here. | `pipeline-core` security maintainers | 2026-10-31 |
| Directory durability has platform-specific limits already represented by the private-state assurance layer; unsupported assurance never becomes a strong success claim. | `pipeline-core` runtime maintainers | 2026-10-31 |
| The Bash exemption recognizes only exact plugin-local remediation command shapes. Novel legitimate recovery commands remain blocked and require a reviewed lifecycle change or manual PO execution rather than a broad shell bypass. | `pipeline-core` guardrail maintainers | 2026-10-31 |

These residuals add no credential store, network trust, or third-party
dependency. Any future widening of the token carrier, accepted executable
identity, shell exemption, repository-private location, or ready receipt must
update this threat model and receive a new security/Critic review.
