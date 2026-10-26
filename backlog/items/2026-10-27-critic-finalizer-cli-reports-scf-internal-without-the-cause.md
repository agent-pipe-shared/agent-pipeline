---
schema: pipeline.backlog-item.v1
id: pipeline.critic-finalizer-cli-reports-scf-internal-without-the-cause
type: defect
owner: pipeline
status: open
created: 2026-10-27
priority: P1
release: 0.7.0
sprint: alfred
source: "Consumer finding relayed 2026-10-27 (Glossover, PF-80): the admit step printed only SCF-INTERNAL; the real cause was found only by calling the same function directly"
done_when: manual
---

# The Critic finalizer CLI prints SCF-INTERNAL and drops the real cause

## Evidence

`scripts/session-critic-finalizer.mjs` (`runSessionCriticFinalizerCli`, catch block, about line 746): every error that is
neither a `SessionCriticFinalizerError` nor a `GenericCriticBatchError` becomes `{ code: "SCF-INTERNAL" }` with no
message, no inner code and no hint. Other typed errors (the same code path through `admitSessionCriticReview`) carry a
code but no message either. The consumer needed a direct call of the same function to see the cause (PF-79).

## Wanted

1. The rejected output keeps `code` and adds a bounded, sanitised `detail`: the inner `error.code` when present
   (for example a `DRO-*` or `CPP-*` code from a called module) and the first line of the message, capped (about
   200 characters), no absolute paths, no stack.
2. `SCF-INTERNAL` itself names that it wraps an untyped error and gives one next step (rerun with the debug flag or
   see the named evidence), never a secret or machine path.
3. A test: an untyped throw inside admit yields `SCF-INTERNAL` plus detail; a typed error yields its own code plus its
   message; neither output contains the repository root.

## Boundaries

Custody path (`session-critic-finalizer.mjs`): the independent Critic review stays a parent-owned batch gate. The output
schema `SESSION_CRITIC_CLI_ERROR_SCHEMA` is closed: widen it deliberately and update its validator and consumers
together.
