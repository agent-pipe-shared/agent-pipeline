# PHX-0 / PHX-1 governance threat model

Owner: Pipeline maintainers. Review this document with any PHX-0 transport,
source-observation, privacy-contract, project-authority, portable-event, or
restricted-store boundary change. The independent privacy review for a fixed
PHX-1 candidate is a separate pass/fail evidence artifact; this document
states the technical model that review must inspect.

## Assets and trust boundaries

| Asset | Trust boundary | Required control |
| --- | --- | --- |
| Selected Pipeline source identity | Codex registry and loaded-plugin observation | Typed source observation; no local path is published. |
| Public ruleset freshness | Public-Core `HEAD` only | A fixed, read-only `git ls-remote` action; private marketplace coordinates are never a freshness authority. |
| Host network capability | Workspace sandbox to selected host boundary | WSL/restricted preflight binds one network-open, read-only host action by boundary ID and request hash. |
| Consumer repository and private runtime | Project, HOME, plugin cache, credentials | Never include paths, cache roots, environment values, tokens, or private remotes in action/result diagnostics. |
| Freshness result | Host adapter back to bootstrap | Accept only a schema-valid receipt that binds the exact action, fixed Git completion, public object ID, and validated host-control identity digest. |
| Recovery Bridge authority | Existing repository-scoped PO gate to Phoenix lifecycle writer | New decisions bind the exact revalidated PO-gate approval digest plus active PRD/Spec paths and hashes; an attribution string is never authority. |
| Dev-Plan State authority | Runner-neutral project-authority resolver | The guard reads only the resolver-selected `pipeline.state.v0` projection; a neutral State remains authoritative after legacy State retirement. |
| Portable governance events | Repository-wide Git access and retention zone | Closed per-origin payload fields, default-deny capture policy, policy digest binding, physical repository fingerprint, canonical bytes, hash chain, and retained checkpoint. |
| Portable stream writer lock | Per-stream filesystem coordination | A live lock blocks writers; dead-lock recovery atomically renames the stale pathname to writer-owned quarantine before deletion, so recovery cannot unlink a replacement live lock. |
| Detached approval proof | Ledger grant/candidate/artifact binding versus external trust-policy provenance | The proof binds immutable ledger grant, candidate, and scoped plan/spec bytes. A caller-supplied trust policy proves a signature only and must not establish externally-attested human identity. |
| Portable recovery projection | Replaceable `heads.json` versus immutable canonical events | Recovery requires a terminal retained checkpoint, exact heads preimage/postimage, idempotency key, write-ahead journal, sanitized receipt, and readback; it never rewrites an event. |
| Restricted governance record | Separately protected owner-only machine-local root | No symlink ancestry, owner-only permissions, AES-256-GCM encrypted complete event, external 32-byte key, explicit expiry, and no portable counterpart or join handle. |
| Restricted key material | External local custody, distinct from Git and the restricted record root | Exact key-file preimage, operator proof, write-ahead destruction journal, absence readback, and a receipt that explicitly limits proof to the named active key file. |

## Abuse cases and mitigations

| Abuse | Mitigation | Recovery |
| --- | --- | --- |
| Restricted sandbox attempts direct network access | No direct fallback after restricted preflight; use the selected host adapter only. | Return `host-transport-required` with the fixed bound action. |
| Copied, substituted, or stale host request | Boundary ID and request hash must match exactly. | Reject as `host-transport-unavailable`; obtain a fresh preflight plan. |
| Ambient `PATH`, repository context, or Git URL rewrite retargets the reviewed public read | The WSL adapter invokes only `/usr/bin/git` from `/` with a sterile environment that disables system/global/repository configuration and all inherited `GIT_*` state. | Return `unavailable`; do not resolve Git from PATH, inherit a Git directory, or retry an alternate URL. |
| Private source gains public-freshness authority | Only the reviewed Public-Core coordinate is selectable. | Return typed private/local source status; do not probe it. |
| Same-version substituted or stale daemon/control endpoint forges version-only host freshness | Canonically hash the complete validated host daemon observation into the Freshness receipt; the receipt excludes raw paths and the common consumer requires its 64-hex identity digest. | Treat a missing, malformed, or incomplete control identity binding as unavailable; no write permission follows. |
| Host output forges a success | Require result schema, exact request hash, completion state, valid Git ID, and the matching host-control identity digest. | Treat malformed output as unavailable; no write permission follows. |
| Local caller forges `approvedBy: PO` or reuses an old Recovery Bridge decision | The helper refuses issuance without a current revalidated repository-scoped PO gate. The writer revalidates that gate and compares its complete binding against the decision before plan, apply, or recovery. | Reject with a typed PO-authority drift result; create a fresh PO-gate approval and a new short-lived decision. |
| PRD, Spec, or PO approval changes after a Recovery Bridge decision | Decision digest binds the human-facing explanation, PO approval digest, and PRD/Spec hashes; the writer rereads all of them before mutation. | Reject as authority/artifact drift; no lifecycle manifest mutation occurs. |
| A stale lifecycle Result digest is used to conceal a rewritten historical Result | Result reconciliation requires authoritative `append-only`/`active` metadata, a current Continuity-State binding, and exact byte proof that the stale digest is the preserved historical prefix before the canonical reconciliation fence. | Refuse the preview before any manifest mutation; retain the stale binding for explicit recovery or human disposition. |
| Legacy State retirement makes the Dev-Plan guard read no active feature | Resolve State through `readProjectAuthority()` rather than a hard-coded `.claude/pipeline-state.json` path; the neutral projection is selected whenever its manifest is authoritative. | Restore a readable resolver-selected State with the sanctioned writer; do not use a legacy-path fallback. |
| Diagnostic leaks private topology | Output is limited to status, source class, hashes, counts, typed reason, and (when needed) fixed public action. | Stop publication, remove the leaking field, and rerun privacy tests. |
| A portable caller supplies identifying/free-form or unclassified fields under an allowed origin | The capture policy is loaded from the physical repository, defaults to deny, binds its canonical digest into the envelope, and admits only closed origin-specific payload shapes. | Reject before stream directory creation or durable event write; route the complete event only through the restricted profile when separately authorized. |
| A copied registry, symlinked ancestor, or mismatched checkout is queried as this repository | Every portable operation discovers the physical Git root, derives the fingerprint from its common directory/primary root, rejects symlink ancestry, and compares it to both request and registry. | Return a typed cross-repository/path failure; do not read, append, or project an event. |
| A checkpoint is used to claim appended history that it does not attest | A non-terminal checkpoint proves only a valid prefix and queries expose no events after that sequence. | Return `prefix-valid` with completeness `unknown`; require a terminal matching checkpoint for `verified`. |
| A crash or replay changes `heads.json` without an auditable recovery contract | Recovery persists the exact idempotency/preimage/postimage journal before projection write, validates postimage, stores a receipt, and replays only when that receipt and postimage remain exact. | Keep the journal as recovery-required evidence; refuse changed preimages, conflicting keys, or receipt/postimage drift. |
| Two writers recover the same dead lock while one has already acquired a replacement | A stale lock is atomically renamed into an ignored writer-owned quarantine before deletion; recovery never unlinks the shared `.lock` pathname after liveness observation. | The loser observes a live replacement lock and fails closed; only a later independent append may obtain the next lock. |
| A caller supplies its own detached-proof key and matching trust-policy hash | Detached proof verification reports only cryptographic proof validity under `caller-supplied-policy`; no result upgrades local ledger attribution to externally-attested human identity without an independently attested trust-policy source. | Treat the proof as insufficient for an identity-sensitive gate; obtain a separately proven external trust-policy source and a new integration decision. |
| An unprivileged caller erases a restricted record or forges authorization | Privileged operations require a timing-safe HMAC proof bound to the physical repository, operation, record ID, and exact encrypted preimage; erase also needs the external 32-byte key. | Reject before deletion; report only active-store outcome and the explicit unknown-backup limitation. |
| Key destruction is mistaken for deletion of backups or all copies | `destroy-key` binds one separately protected absolute key file, journals before unlink, verifies its absence, and emits a limited receipt. | Never claim legal erasure or deletion of backups, copies, process memory, or an external custodian; a missing receipt/journal is recovery-required. |

## Operating and recovery rules

The in-process plan builder is not an executor. A host integration may execute
only the returned action through its sanctioned read-only/network-open boundary
and must pass the matching host transport to the normal freshness entrypoint.
If that adapter is absent, unavailable, or mismatched, the CLI returns the
data-minimized action and exits non-successfully; it must not retry in the
workspace sandbox. A remote timeout without a restricted-boundary request
remains a typed offline observation, never proof of freshness.

The productive WSL adapter has no durable state, lockfile, repository mutation,
or fallback executor. It performs one public observation from the fixed host
directory and returns only a validated public object ID plus the privacy-safe
host-control identity digest. A platform, trust, or privacy regression therefore
rolls back the identity-digest pair together with the prior complete PHX-0B host
receipt package: `ruleset-freshness-host.mjs`, its binding in
`ruleset-freshness.mjs`, and its matching tests/spec inventory. A new local
compensating revert candidate must then carry fresh exact Verify, Security, and
independent Critic evidence; no reset, history rewrite, remote action, or stale
evidence can claim recovery.

The Recovery Bridge is a PHX-0 compatibility path, not a replacement human
ledger. It consumes only the existing repository-scoped PO-gate authority that
PHX-0 is explicitly permitted to use. PHX-2 replaces that compatibility source
with the sanctioned human-ledger writer and resolver; no local helper, mutable
state projection, chat transcript, or preview may mint authority on its own.

The Dev-Plan guard treats State-path selection as an authority decision. It
uses `readProjectAuthority()` and may read only the resolver-selected State
projection. An absent selected State means that no active feature is recorded;
an unavailable or unreadable selected authority is surfaced as a warning and
must be repaired through the sanctioned State writer, never by reviving a
legacy-path fallback.

PHX-1 portable event admission happens before any portable temporary or final
file: the registry, capture policy and physical repository identity are read
through non-symlinked ancestry; the policy is default-deny; and the event must
bind the policy's canonical digest and one closed safe payload shape. A
repository clone is intentionally not an access-control boundary. It can read
all portable bytes, so the portable profile never accepts personal attribution,
joinable pseudonyms, free-form rationale, finite-erasure obligations, private
coordinates, credentials, transcripts, or raw tool output.

The restricted profile is neither a sidecar for a portable event nor a
portable authority source. It stores only a complete restricted envelope in an
owner-only root outside the repository, with no event-ID mapping, digest, or
join handle written into Git. Restricted query, erase, and key destruction
require the external key and an operation-bound proof. `erase` proves only
that the exact ciphertext disappeared from the active store. `destroy-key`
proves only that the named separately protected active key file is unavailable
after readback. Both receipts state that backups, copies, and memory remnants
are outside this proof boundary.

The source-last portable `heads.json` file is an optimization, never an
integrity authority. Its rebuild is allowed only from a terminal retained
checkpoint and exact request preimage/postimage. A journal is written before
the projection mutation; after exact readback the receipt seals the replay
tuple. Replaying that tuple is a zero-write readback. Any fork, non-terminal
checkpoint, changed preimage, changed candidate checkpoint, conflicting
idempotency key, or receipt drift fails closed.

## Acceptance mapping

| Acceptance criterion | Evidence in this model |
| --- | --- |
| AC13 — transport binding | Fixed public action, boundary ID, request hash, no direct restricted-sandbox fallback, and fail-closed recovery. |
| AC14 — privacy/output | Asset inventory and diagnostic allowlist prohibit HOME, cache, credential, private remote, and consumer-coordinate disclosure. |
| K-AC-01 — portable admission | Physical repository binding, no-symlink ancestry, default-deny capture policy, closed payload shapes, and pre-durability rejection. |
| K-AC-06 — checkpoint query | Hash-chain prefix validation, terminal-checkpoint completeness, and prefix-only query projection. |
| K-AC-07 — recovery and restricted operations | Idempotent write-ahead recovery, exact receipts, HMAC-bound restricted operations, active-store erase proof, and limited key-file-destruction readback. |
