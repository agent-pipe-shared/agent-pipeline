# Nova execution-plane threat model

**Status:** A4 pre-rebase contract boundary. This document does not claim a
worker launch, provider integration, final candidate acceptance or release.

| Threat | Control | Verification | Residual boundary |
| --- | --- | --- | --- |
| A subject is replayed for another repository or an unbounded attempt number. | The A4 subject fixes `repository` to literal `self`; `attempt` and `queueRevision` are non-negative integers and are covered by the subject digest. | `execution-plane-contract.test.mjs` checks schema/runtime parity and rejects foreign repositories and invalid attempts. | Git reachability and queue freshness are checked by the admitted caller; this contract does not fetch or rebase. |
| A stale candidate, queue or authority set reaches an adapter. | Admission recomputes the subject digest and compares candidate commit/tree, queue revision, frozen authorities and replay history before any launch boundary. | The admission corpus covers replay, stale subject, candidate and frozen-binding drift. | Real adapters remain out of scope until their separately accepted post-rebase package. |
| A fabricated `verified` record is accepted as execution success. | Only the exact genesis record may be validated without context. Every non-genesis record requires its exact predecessor digest, subject binding, monotonic revision and an allowed transition; `verified` additionally requires verifier status. | The state corpus rejects a revision-zero `verified` record, an unbound successor, wrong predecessor and direct non-verified result. | A caller that cannot retrieve the predecessor receives typed `UNAVAILABLE`, not a success claim. |
| A synthetic adapter result is confused with external execution or final acceptance. | Outcome normalization is closed, binds dispatch/attempt/candidate and represents success as `succeeded-unverified` until matching verifier evidence is supplied. | Success, verifier mismatch, duplicate, cancellation, timeout, lost-heartbeat and undelivered-result tests. | No selected-sandbox, OS isolation, provider identity or delivery acceptance is asserted by A4. |
| Undeclared writable paths or resource capability reaches a worker. | Request validation requires exact sorted write paths and resource units matching the admitted subject, with known capacity and a digest-bound frozen exchange. | Request parity and stale-admission tests. | The contract is intentionally launch-free; durable workers and consumers are owned by the named post-rebase risks below. |

Rollback is an ordinary revert of the bounded A4 contract commit followed by
fresh Verify, Security and Critic evidence. It does not contact a provider,
create a worker or mutate a remote system.
