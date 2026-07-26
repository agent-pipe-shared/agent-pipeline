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

## Failure and rollback behavior

Private-state writes use exclusive creation, file fsync, rename, directory
fsync, exact readback, and identity-bound cleanup. Runtime and kickoff writers
verify every preimage, retain crash-recovery authority, and roll back only
files/directories whose device, inode, link count, and digest still match the
writer's records. Foreign or identity-drifted paths are preserved and the
operation reports an unavailable/indeterminate result instead of false
success.

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
