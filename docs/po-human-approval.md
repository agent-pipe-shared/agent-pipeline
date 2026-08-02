# PO approval: one human action

The agent owns every public preparation step: it creates the candidate-bound
request, refreshes it after a candidate change, and verifies the public proof.
The person owns only key setup (once) and approval. The encrypted private key
and its passphrase live in an external directory; they are never placed in the
repository. The agent may see the public request and public proof, but never
the private key or passphrase.

## One-time setup

Choose an external directory and let the helper create an encrypted Ed25519
key. OpenSSL prompts locally for the passphrase. This is the CLI fallback; it
does not put a code word into chat, environment variables, or configuration.

```sh
node "$HOME/src/agent-pipeline-share_cyborg/plugins/pipeline-core/scripts/po-human-approval.mjs" setup --repo-root "$HOME/src/agent-pipeline-share_cyborg" --directory "$HOME/agent-pipeline-po"
```

`setup` is idempotent. If an older attempt already left an encrypted private
key plus public key in `PO_DIR` but no `trust-policy.json`, it creates only
that missing public policy file; it never overwrites the existing key.

## Each approval: one human action

The control plane automatically prepares the current public request and later
verifies the public proof. When it presents a pending approval, the human runs
only this command:

```sh
node "$HOME/src/agent-pipeline-share_cyborg/plugins/pipeline-core/scripts/po-human-approval.mjs" approve-all --repo-root "$HOME/src/agent-pipeline-share_cyborg" --directory "$HOME/agent-pipeline-po"
```

`approve-all` is the only regular human step. It signs each already-prepared,
exact candidate-bound intent (one local passphrase prompt per proof) and never
accepts a secret by argument, environment, stdin, repository file, or pipeline
state. A changed Git candidate causes the agent to refresh the request before
it asks again. Every helper command resolves symlinks before using the external
directory and rejects a directory that reaches the repository.

## Control-plane integration

Agents, runners, and desktop applications use this public-only command before
and after the human action. It has no `setup` or `approve` mode and cannot
read a private key or a passphrase. The agent executes these commands itself;
they are not user recipes.

```sh
node "$REPO/plugins/pipeline-core/scripts/po-approval-gate.mjs" prepare-all --repo-root "$REPO" --directory "$PO_DIR"
node "$REPO/plugins/pipeline-core/scripts/po-approval-gate.mjs" verify-all --repo-root "$REPO" --directory "$PO_DIR"
```

## Adapter boundary

This helper is the first adapter for one shared Human-Authorization contract,
not a CYB-4-only mechanism. The shipped 0.5.0 adapter is the external
encrypted Ed25519/SSH-style key path above. Passkey/WebAuthn, IAM,
hardware-key, and password-manager adapters may later produce the same
detached public proof; they are not bundled in 0.5.0.

## Remote work and provisional codes

0.5.0 intentionally ships no remote-code mechanism. A code pasted into the
same chat as the agent is visible to that agent, so it is not a secret and
cannot safely act as final authorization. A future remote adapter may record
a one-time provisional acknowledgement, but it must not authorize push,
release, override, or another irreversible action. Final local proof remains
required.

## Deutsche Kurzhilfe (nicht normativ)

Diese Zusammenfassung erklärt nur die englische Anleitung oben; bei einem
Widerspruch gilt der englische Text. Der Agent erzeugt und aktualisiert die
öffentlichen Requests und prüft die Proofs selbst. Der Mensch sieht weder
interne Rezepte noch muss er Dateien erzeugen: Nach dem einmaligen `setup`
führt er pro Freigabe nur `approve-all` in seinem eigenen Terminal aus. Der
Agent darf weder die lokale Passphrase noch den privaten Schlüssel sehen.
