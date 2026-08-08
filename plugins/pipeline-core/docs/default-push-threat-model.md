# Default push threat model (plugin-shipped template)

**Status:** a TEMPLATE, not itself a bound artifact. `approve-push` never
reads this file directly — it cannot: the artifact a push proof binds must
live inside the project being pushed (`pipeline-state.mjs`, resolution-order
comment above `PUSH_THREAT_MODEL_ENV`), and the plugin's own install location
is outside that project. Run the `materialize-push-threat-model` subcommand
to copy this file's content into the project at `project/push-threat-model.md`
(the conventional default path) once, where `approve-push` can then bind it.
A project that instead configures `PIPELINE_PUSH_THREAT_MODEL_PATH` to a
document of its own — describing its own release process, branch rules and
residual risk — never needs this template at all; this one describes only
what the ceremony itself asserts, independent of any project.

After materializing, review and, if useful, edit the copy in the project
before the first `approve-push` — it is that project's own artifact from
that point on, and `materialize-push-threat-model` refuses to overwrite it a
second time precisely so an edited copy is never silently replaced.

## What signing under the materialized copy means

(The rest of this document speaks of "this document" for readability; once
materialized, that means the project's own `project/push-threat-model.md` —
the copy `approve-push` actually binds, not this template.)

`approve-push` is a fail-closed writer action (ADR-0055, ADR-0056, ADR-0061).
It requires a detached Ed25519 proof — a human decision, made once, over an
exact subject — unless the project has explicitly stood the gate down to
`chat` mode. The subject that proof covers binds together, as one digest:

- the exact commit and tree being pushed (the *candidate*);
- the exact remote and destination ref;
- the exact bytes of **this document**, by path and SHA-256, at the moment
  `approve-push` ran.

Signing under this document therefore attests: *"I reviewed the candidate
named in the approval command's own output, for the remote and destination
named there, and I am releasing exactly that — once."* It does not attest
review of any other commit, any other destination, or any action attempted
after the signature's stated expiry (ADR-0061, Decision 4).

## Threats and controls

| Threat | Control | Residual boundary |
| --- | --- | --- |
| An agent pushes without a human decision. | `signature` mode (the default) makes the agent cryptographically incapable of producing the proof; only a human holding the private key can. | A project that has explicitly configured `chat` mode records an attribution, not a proof — a deliberate, diffable choice, not a default. |
| A signed proof is replayed for a different commit, remote or ref. | The signed subject binds candidate commit/tree, remote and destination together; a push guard rejects any of them differing from what was signed. | A revert or follow-up push is a new candidate and needs its own signature. |
| A proof is consumed twice. | The writer records each consumed proof's digest in an additive ledger and refuses a repeat. | Ledger retention is local audit state, not a substitute for the remote's own history. |
| This document is edited after a proof was signed under it. | The push guard re-hashes the document's current bytes against the recorded hash and refuses on any mismatch. | The document is reviewed content the human read before signing, not a key or an external trust anchor — its accuracy is the signer's own judgment call. |
| This document does not describe the project's actual release process. | A project may configure its own artifact via `PIPELINE_PUSH_THREAT_MODEL_PATH`; this document exists so a project that configures nothing still has something resolvable to sign under, never a hardcoded path into an unrelated repository. | A generic document describes the ceremony, not project-specific residual risk (branch protection, deploy targets, rollback procedure) — a project carrying those risks should ship its own. |

## What this document is not

Not a release approval, not evidence a remote action occurred, and not a
substitute for a project's own understanding of what pushing to its own
remote entails. It is the artifact the signature is *over*, so that the
signature is over something concrete rather than nothing at all.
