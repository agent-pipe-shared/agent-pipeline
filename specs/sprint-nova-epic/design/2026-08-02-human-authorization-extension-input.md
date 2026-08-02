# Nova human-authorization and Cyborg-handover extension — design input

**Captured:** 2026-08-02  
**Source:** Product-Owner direction, sanitised for repository use

## Context

Nova is rebased on the released `v0.5.0` baseline and has a local `0.5.1`
interim candidate. Cyborg has shipped a portable external human-proof adapter:
an encrypted Ed25519/SSH-style key held outside the checkout signs a public,
candidate-bound intent. The locally tested SSH path keeps the request with the
agent and the signing prompt on the human-operated hardened terminal.

Cyborg's handover also assigns Nova six candidate-bound backlog validations and
requires every resulting transition to use Nova's canonical writer.

## Requested outcome

1. Reuse the detached human-proof contract at the genuinely critical external
   effect gates: ordinary remote push approval, human-gated deployment approval,
   and publication authorization. Routine chat approval remains the authority
   for planning, implementation, review and other non-final decisions.
2. Add a remote-app provisional acknowledgement based on a short-lived,
   one-time code. It may permit only a bounded local continuation while the
   human is away from the hardened terminal. It is never identity proof and
   cannot authorize push, deployment, publication, override, release, merge,
   deletion or another irreversible action.
3. Validate Cyborg's six named items against Nova's selected candidate, retain
   `{ itemId, spec, candidateCommit, evidence }` tuples, and use the canonical
   Nova writer only for items whose acceptance remains current.

## Constraints and non-goals

- No private key, passphrase, recovery secret or remote code is accepted by an
  agent command, environment variable, repository file or Pipeline state.
- A remote code may be visible to the agent; therefore it is deliberately not
  authentication and cannot substitute for a detached final proof.
- Every critical-proof request binds the clean candidate commit/tree, bound
  plan and Spec digests, a closed action kind and a digest of the exact action
  subject. Replay, candidate drift, expired evidence and cross-kind use fail
  closed.
- The release path remains remote-free until its separate final authorization.
  This extension creates no remote app, credential, key, provider or release.
- Existing threat-model proof behavior remains compatible; the new critical
  action flow is a separate, generic request/verification path rather than a
  reinterpretation of `cyb-4`/`cyb-5` requests.

## Decisions

| Decision | Rationale |
| --- | --- |
| Bind final proof at the sanctioned state-writer actions, not in a chat-facing hook. | The writer owns durable authorization state and the publication executor consumes it immediately before the external effect. |
| Cover push, deploy and publication only. | They are the current critical external-effect boundaries; widening to every human interaction would turn ordinary work into unnecessary ceremony. |
| Model the remote code as a provisional acknowledgement receipt. | A value visible in agent chat cannot prove identity, but it can record an explicitly bounded continuation without weakening final gates. |
| Keep the Cyborg closure transition separate from code delivery. | Handover evidence must be rerun on Nova's actual candidate and closure must be canonical and append-only. |

## Open questions resolved for this increment

- The remote code has no privileged fallback mode. A valid code is one-time,
  candidate-and-scope-bound and expires within 30 minutes; it is consumed only
  by the local continuation check.
- A final proof remains required even after a provisional acknowledgement. The
  trusted-terminal Ed25519 path is the first supported final-proof adapter.
- A new candidate invalidates all prepared proofs and provisional receipts.

