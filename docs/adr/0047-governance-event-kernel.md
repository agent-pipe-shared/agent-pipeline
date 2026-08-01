# ADR 0047: Governance event kernel uses separate immutable stream records

## Status

Accepted for Phoenix PHX-1.

## Decision

Use one closed common envelope with separate human, agent, and lifecycle
streams.  Portable events are canonical individual files in repository history
with repository-bound genesis, monotonic sequence, previous digest, and an
event digest that omits its own field from the preimage.  One writer owns
policy admission, locking, idempotency, atomic publication, readback, and
source-last projection update.

The portable writer is paired with a separate restricted machine-local store.
Restricted events are encrypted, owner-only, expiry-bound and outside Git; no
portable sidecar, stable mapping, or projection connects the two stores.

## Consequences

- A chain verifies internal prefix integrity only.  Candidate-bound retained
  checkpoints are required to claim completeness.
- Heads and indexes are replaceable and cannot authenticate themselves.
- A same idempotency key either returns the existing exact event with zero
  write or fails closed; it never creates a second canonical record.
- A fork, truncation, reordering, malformed file, unsafe path, symlink, or
  cross-repository record blocks consumption.  Portable recovery can rebuild
  only a projection from a verified checkpoint; it cannot rewrite history.
- The Human Governance Decision Ledger, not this generic event kernel, remains
  the only historical source for human authority.

## Rejected alternatives

- One mutable NDJSON file: concurrent append and merge recovery would make
  canonical history ambiguous.
- A generic audit log: it would blur human authority, agent observations, and
  lifecycle facts while forcing an unsafe single-retention profile.
- Git history alone: commits lack the closed decision taxonomy, policy,
  assurance, candidate binding, and idempotency contract.
- An encrypted identity sidecar beside a portable record: it would create a
  durable cross-store correlation handle and violate the privacy boundary.
