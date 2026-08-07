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

## Before any signature: one explicit confirmation

Every signing command — `approve`, `approve-critical`, `sign-intent`, and each
signature `approve-all` performs on your behalf — first prints a plain-language
summary of what is about to be authorized and waits for you to type the exact
word `approve`. Anything else, including an empty line, cancels: OpenSSL is
never invoked and no proof artifact is written. The summary names the approval
kind and the exact candidate commit (plus the action subject digest and expiry
for a critical action), or the intent digest for `sign-intent`.

The confirmation is deliberately placed *before* the passphrase prompt, so the
question "should this be authorized, with this consequence?" is answered while
you can still read the terms, rather than being implied by having typed a
passphrase. `setup` creates key material and signs nothing, so it does not ask.

## Which commands are yours

Every command in this document that reads the private key is yours and only
yours: `setup`, `approve`, `approve-all`, `approve-critical`, `sign-intent`.
Everything else — `prepare*`, `verify*`, and the guard-side consumers such as
`guard-maintenance-window.mjs install` and `guard-human-override.mjs` — reads
only public artifacts and is executed by the agent. If an agent asks you to run
one of those, it is doing extra work on your behalf that it should have done
itself.

`--repo-root` must be an ABSOLUTE path for `po-human-approval.mjs`; the usage
string does not currently say so and a relative path is rejected with the bare
usage text.

If more than one external directory exists on the machine, confirm you are
using the one whose key this repository pins: `trust-policy.json`'s
`publicKeySha256` must equal `trustAnchor.publicKeySha256` in
`project/critical-human-proof.json`. The `keyReference` field does not
discriminate — separate keys may both be called `local-po-key`, and signing
with the wrong one fails only afterwards, with `PO-APPROVAL-TRUST-MISMATCH`.

## Signing a bare intent digest

Guard lifts (`guard-lift`, `guard-override` — the Guard Maintenance Window and
the Human Guard Override) present an already-computed intent digest rather than
a request file. The human signs it directly:

```sh
node "$REPO/plugins/pipeline-core/scripts/po-human-approval.mjs" sign-intent \
  --repo-root "$REPO" --directory "$PO_DIR" --intent-sha256 "$INTENT_SHA256"
```

The proof lands at `$PO_DIR/proof-manual.json`, which the requesting guard
command then consumes. Because this command signs a digest and not a request,
it cannot describe the specific action any more precisely than the digest and
its consequence class; check the digest against the one the agent showed you
before confirming.

## Control-plane integration

Agents, runners, and desktop applications use this public-only command before
and after the human action. It has no `setup` or `approve` mode and cannot
read a private key or a passphrase. The agent executes these commands itself;
they are not user recipes.

```sh
node "$REPO/plugins/pipeline-core/scripts/po-approval-gate.mjs" prepare-all --repo-root "$REPO" --directory "$PO_DIR"
node "$REPO/plugins/pipeline-core/scripts/po-approval-gate.mjs" verify-all --repo-root "$REPO" --directory "$PO_DIR"
```

## Critical external effects

For a remote push, a human-gated deployment or a publication, the control
plane prepares a separate `critical-action` request. It binds the clean
candidate commit/tree, current plan and Spec, one closed action kind and the
digest of the exact writer-owned action subject. The human signs it on the
hardened terminal with `approve-critical`; the agent can prepare and verify,
but cannot sign.

The repository policy enables this check only for `push`, `deploy` and
`publication`. Planning, implementation, normal review and other chat-approved
decisions do not require the external signer. A proof is single-purpose: a
push proof cannot approve a deploy or publication, and candidate, subject or
expiry drift requires a new request.

```sh
# Agent/control plane: creates public external files only.
node "$REPO/plugins/pipeline-core/scripts/po-approval-gate.mjs" prepare-critical \
  --repo-root "$REPO" --directory "$PO_DIR" --feature-id sprint-nova-epic \
  --plan specs/sprint-nova-epic/prd_sprint-nova-epic.md --spec specs/sprint-nova-epic/spec.md \
  --kind publication --subject-sha256 "$SUBJECT_SHA256" --expires-at "$EXPIRES_AT"

# Human-operated hardened terminal: the sole signing step.
node "$REPO/plugins/pipeline-core/scripts/po-human-approval.mjs" approve-critical \
  --repo-root "$REPO" --directory "$PO_DIR" --kind publication
```

The subsequent State-writer transition verifies the same public request,
authority and proof before it writes durable approval. A chat message or an
attribution string is not a substitute at these three boundaries.

## Adapter boundary

This helper is the first adapter for one shared Human-Authorization contract,
not a CYB-4-only mechanism. The shipped 0.5.0 adapter is the external
encrypted Ed25519/SSH-style key path above. Passkey/WebAuthn, IAM,
hardware-key, and password-manager adapters may later produce the same
detached public proof; they are not bundled in 0.5.0.

## Remote work and provisional codes

The interim candidate adds a deliberately limited external-store helper for a
remote-app acknowledgement. Its code is hashed, one-time, candidate-and-scope
bound and expires within 30 minutes. It permits only the named local
continuation check. A code pasted into the same chat remains visible to the
agent and therefore is not a secret or identity proof.

The receipt is structurally rejected by push, deploy, publication, release,
override, merge and deletion flows. Final local detached proof remains
required even after a valid provisional acknowledgement. The helper does not
ship a remote provider, credential or app integration; a remote app can use it
only as an unprivileged acknowledgement store.

## Deutsche Kurzhilfe (nicht normativ)

Diese Zusammenfassung erklärt nur die englische Anleitung oben; bei einem
Widerspruch gilt der englische Text. Der Agent erzeugt und aktualisiert die
öffentlichen Requests und prüft die Proofs selbst. Der Mensch sieht weder
interne Rezepte noch muss er Dateien erzeugen: Nach dem einmaligen `setup`
führt er pro Freigabe nur `approve-all` in seinem eigenen Terminal aus. Der
Agent darf weder die lokale Passphrase noch den privaten Schlüssel sehen. Vor
jeder Signatur zeigt das Werkzeug in Klartext an, was genau freigegeben wird,
und verlangt die Eingabe des Wortes `approve`; alles andere bricht ab, bevor
OpenSSL überhaupt startet.
