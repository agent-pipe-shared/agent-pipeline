# PO approval: the short human flow

This is for a person operating their own terminal. Do not run the approval
commands through an agent, CI worker, chat prompt, repository hook, or shared
shell. The encrypted private key and its passphrase live in an external
directory; they are never placed in the repository. The agent may see the
public request and public proof, but never the private key or passphrase.

## Start of every terminal session

Run these two lines again whenever you open a new terminal. They only name the
checkout and the external public-proof/key directory; they contain no secret.

```sh
REPO="$HOME/src/agent-pipeline-share_cyborg"
PO_DIR="$HOME/agent-pipeline-po"
```

## One-time setup

Choose an external directory and let the helper create an encrypted Ed25519
key. OpenSSL prompts locally for the passphrase. This is the CLI fallback; it
does not put a code word into chat, environment variables, or configuration.

```sh
node "$REPO/plugins/pipeline-core/scripts/po-human-approval.mjs" setup --repo-root "$REPO" --directory "$PO_DIR"
```

`setup` is idempotent. If an older attempt already left an encrypted private
key plus public key in `PO_DIR` but no `trust-policy.json`, it creates only
that missing public policy file; it never overwrites the existing key.

## Each approval: human action

The control plane prepares the public request and verifies the public proof.
When it presents a pending approval, the human runs only this command:

```sh
node "$REPO/plugins/pipeline-core/scripts/po-human-approval.mjs" approve --repo-root "$REPO" --directory "$PO_DIR"
```

`approve` is the only regular step that asks for the local passphrase. It signs the
exact current candidate-bound intent, writes only public request/trust/proof
files to `PO_DIR`, and never accepts a secret by argument, environment, stdin,
repository file, or pipeline state. A changed Git candidate requires a new
`prepare` and `approve` step. Every helper command resolves symlinks before
using `PO_DIR` and rejects a directory that reaches the repository.

## Control-plane integration

Agents, runners, and desktop applications use this public-only command before
and after the human action. It has no `setup` or `approve` mode and cannot
read a private key or a passphrase.

```sh
node "$REPO/plugins/pipeline-core/scripts/po-approval-gate.mjs" prepare --repo-root "$REPO" --directory "$PO_DIR"
# Ask the human to run the single approve command above.
node "$REPO/plugins/pipeline-core/scripts/po-approval-gate.mjs" verify --repo-root "$REPO" --directory "$PO_DIR"
```

## Product direction

This helper is the first adapter for one shared Human-Authorization contract,
not a CYB-4-only mechanism. Existing human intents/gates must migrate to that
contract and future sprints must use it from the start. Desktop applications
should prefer a native Passkey/WebAuthn adapter. CLI consoles keep the
external encrypted Ed25519/SSH-style key path as their portable fallback.
IAM, hardware-key, and password-manager adapters may also produce the same
detached public proof; `prepare` and `verify` remain unchanged.

## Deutsche Kurzhilfe (nicht normativ)

Diese Zusammenfassung erklärt nur die englische Anleitung oben; bei einem
Widerspruch gilt der englische Text. Die Befehle werden in einem eigenen,
vom Menschen bedienten Terminal ausgeführt. Der Agent darf weder die lokale
Passphrase noch den privaten Schlüssel sehen. Einmalig wird mit `setup` ein
verschlüsselter Ed25519-Schlüssel außerhalb des Repositories angelegt. Für
jede Freigabe folgen danach nur `prepare`, `approve` und `verify` in dieser
Reihenfolge. `approve` fragt lokal nach der Passphrase und erzeugt den
öffentlichen, an den aktuellen Kandidaten gebundenen Nachweis.
