# ADR-0035: Codex normal Critic through a native host boundary

> Agent-Pipeline v0.3 candidate · 2026-07-15

**Status:** accepted (PO-approved Phase-2 close design, 2026-07-15)

## Context

The existing Critic contract assumes a fresh read-only reviewer and requires a
stronger isolated run for architecture, guardrail, and security changes. Codex
CLI isolation research produced useful fail-closed controls, but the external
review process repeatedly stalled after its turn began and returned no verdict.
That research must remain available without making the normal review path
depend on a non-working nested CLI lifecycle.

Codex also needs an explicit review duty. The prior runner mapping proved only
the alias `Fable -> gpt-5.6-sol` at an unchanged effort; it intentionally made
no complete Codex duty claim.

## Decision

Add the provider-neutral host duty `criticNormal` and map it for Codex to
`gpt-5.6-sol/xhigh`. Existing Claude Critic assignments stay unchanged.

The v0.3 implementation is deliberately a maintainer/self-application gate.
Both prepare and finalize require an explicit clean, full Shared ruleset Git
checkout that is physically separate from the candidate source and at the same
exact commit. The executing harness, routing projection, configurations, and
validator schemas must be byte-identical to that pinned checkout. Hidden index
flags are rejected. An installed plugin cache is not silently treated as
equivalent provenance; a future cache-native projection needs its own
manifest/cache-evidence contract.

The normal Codex path is split across a deterministic coordinator harness and
the native host agent surface:

1. `codex-critic-host.mjs prepare` validates an exact full-SHA candidate,
   creates an independent disposable checkout, removes every Git remote, runs
   the calibrated verify command under a stripped environment, binds
   source-qualified references and content fingerprints, and writes a `0600`
   dispatch packet plus an undisclosed consumption record below a private,
   symlink-safe coordinator control directory. The candidate, ruleset, and the
   mandatory `private` and `shared` observers are captured before and checked
   after every candidate-controlled subprocess.
2. The Elephant starts exactly one fresh native host Critic with no chat
   history. The host owns dispatch, progress observations, interrupt, and at
   most one recovery. Repository code never starts an agent process.
3. The Elephant captures exactly one structured result. Only
   `codex-critic-host.mjs finalize` may validate it and create the sanitized
   receipt after checking route, nonce, candidate, liveness, verdict,
   references, ignored/untracked content, Git-administration and object
   inventories, and after-fingerprints.
   Finalization uses an exclusive, crash-recoverable single-use publication
   transaction with atomic no-overwrite publication and durable markers. PASS
   and FAIL both produce a disposition receipt; free-form finding text remains in the private host
   return, while the receipt keeps only closed citations, severities, IDs, and
   hashes.

The receipt states the achieved level verbatim:

`normal-contractual-read-only; OS isolation not asserted`

The host currently provides no cryptographic attestation of model identity or
tool use. The receipt distinguishes the requested/coordinator-confirmed route
from provider attestation and keeps the latter false.

## Consequences

- A working Codex normal-review gate no longer depends on nested CLI process
  completion.
- Hash binding, no-remote review material, mandatory identity-bound observers,
  strict schemas, recoverable single-use publication, evidence-bound liveness,
  and content-aware worktree plus Git-administration mutation detection fail
  closed.
- The controls do not prove absence of private reads, write-then-restore,
  writes outside observed roots, hidden tools, network effects, prompt
  injection, provider fallback, or escaped processes.
- Final fingerprints are sequential point-in-time snapshots. An escaped process
  can make them stale after capture; the receipt does not claim a transactional
  cross-repository snapshot.
- Review-checkout cleanup is a separate best-effort hygiene step after the
  receipt is durable; cleanup success is not part of the review verdict.
- This lane does **not** satisfy the mandatory isolated T1 path. Using it in
  place of T1 requires a named, scope-bounded PO risk waiver. It never creates
  an isolation or Codex-conformance claim.
- The deferred sandbox implementation remains separate research and may be
  resumed only through its explicit backlog re-entry triggers.

## Rejected alternatives

- Keep retrying the nested sandbox Critic: rejected for the v0.3 close after
  repeated bounded runs produced no verdict.
- Relabel net-state checks as isolation: rejected because detection is not
  confinement.
- Remove independent review: rejected because the native host Critic remains a
  useful and functioning semantic gate.
- Change the existing Claude Critic route: rejected; this decision adds one
  Codex host duty and leaves Claude assignments intact.

## Revisit

Re-evaluate when Codex exposes stable structured lifecycle/tool telemetry, a
separately approved OS isolation adapter exists, or a newer CLI demonstrably
fixes the archived post-turn stall.
