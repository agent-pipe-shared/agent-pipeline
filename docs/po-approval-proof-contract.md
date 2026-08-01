# Reusable PO approval proof contract

This is a deliberately small, runner-neutral authorization primitive. Cyborg
uses it for a threat-model decision first; Phoenix, Nova and future manual
overrides can use the same proof flow without creating another approval UX.

## Boundary

The agent may create an `pipeline.po-approval-intent.v1` and later verify a
proof. It cannot produce the proof. The intent binds one closed decision to:

- approval kind and feature ID;
- approved plan and spec digests;
- candidate commit and tree;
- policy revision;
- digest of the feature-specific subject; and
- a decision string defined by that feature's own state machine.

The external authority signs the intent digest with its private key. The
detached proof carries only public key and signature material needed for
verification. A configured authority resolves the trusted public-key digest
outside the candidate and supplies it separately to verification; a key
advertised by the candidate or receipt is never trustworthy on its own. If
that authority is absent, unreachable, or the proof does not verify, the gate
fails closed.

## Cross-runner flow

1. The runner displays or exports the public intent digest.
2. A human uses a separate trusted device, terminal, passkey, IAM workflow, or
   signing tool to inspect and sign that exact digest.
3. The runner receives the resulting detached proof and verifies it against
   the externally configured trust anchor before consuming the decision.

The private key, password, passphrase, recovery code and raw signing prompt
must never be sent through agent chat, tool input, command arguments,
environment variables, stdin, repository files, or local pipeline state. A
plain CLI may implement steps 1 and 3 everywhere Node runs; it cannot itself
be the trusted signing boundary when the agent controls that CLI session.

## Adapter boundary

No IAM, passkey, desktop, or key-store adapter is embedded in the core. Each
adapter needs only two operations: resolve the configured public trust anchor,
then return a detached proof for `intentSha256`. This keeps initial setup light
for solo developers while allowing richer adapters later without changing the
receipt format or the PO approval process.
