# PO approval: one human action

For the full list of every human intent/gate this repository implements and
which ones sit on this shared contract versus a different mechanism, see
[`docs/human-authorization-inventory.md`](human-authorization-inventory.md).

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

Every signing command — `approve`, `approve-critical`, `approve-fork-disposition`,
`sign-intent`, and each signature `approve-all` performs on your behalf — first
prints a plain-language summary of what is about to be authorized and waits for
you to type the exact word `approve`. Anything else, including an empty line,
cancels: OpenSSL is never invoked and no proof artifact is written. The summary
names the approval kind and the candidate (plus the action subject digest and
expiry for a critical action), or the intent digest for `sign-intent`.

One exception to read carefully, because the line looks like a commit and is
not: for the `governance-fork-disposition` kind the `candidate commit` field is
a DERIVED binding value, not a Git commit that exists in this repository. A
governance-stream fork is not commit-scoped (ADR-0063), so the disposition binds
the repository fingerprint, stream, sequence and the content digests of the
conflicting entries instead. Check the `action subject sha256` line against the
digest the agent showed you; that is the value that identifies what you are
authorizing for this kind.

The confirmation is deliberately placed *before* the passphrase prompt, so the
question "should this be authorized, with this consequence?" is answered while
you can still read the terms, rather than being implied by having typed a
passphrase. `setup` creates key material and signs nothing, so it does not ask.

### The prompt speaks your language; the word you type does not

The three framing lines of that prompt — the heading, the sentence naming the
consequence, and the instruction to type the token — are printed in the
human-facing language this repository is configured for
(`continuity.runtime.humanFacingLanguage` in the project-state artifact;
`de` and `en` are the values that contract admits). A repository configured for
`de` therefore opens with `PO-FREIGABE BESTÄTIGEN` and closes with `Tippen Sie
exakt "approve" ...`.

English is the hard fallback, in every failure mode: an absent, unreadable or
malformed state file, a missing continuity block, a language value that is not a
recognised one, or a lookup that fails for any other reason all print the
complete English prompt. There is no path on which a locale problem produces a
shorter prompt, a partial prompt, or no prompt at all.

The word you type is **always the English `approve`**, in every language. It is
one stable, greppable constant shared by this document, the prompt and the code;
a translated token would be a second accepted input on a signing gate, and could
drift from the documentation. The localized prompt therefore quotes `approve`
verbatim rather than translating it, and no localized synonym is accepted —
typing `genehmigen` cancels exactly like any other non-matching answer.

The summary lines between the framing lines are data, not prose: digests,
candidate identifiers, expiry timestamps, and (for `sign-intent`) the recorded
request's own reason and scope. They are identical in every language. So is the
cancellation behaviour: any answer that is not exactly `approve` cancels before
OpenSSL runs and before any artifact exists.

## Which commands are yours

Every command in this document that reads the private key is yours and only
yours: `setup`, `approve`, `approve-all`, `approve-critical`,
`approve-fork-disposition`, `sign-intent`. `approve-fork-disposition` is on that
list for a reason that is easy to miss from its name: it re-checks the fork and
then hands the signing itself to the same `approve-critical` branch, so it opens
your private key exactly like the others.

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

## Signing a GMW/HGO reconcile request from `scratch/`

A GMW/HGO reconcile leaves its intent digest in a request file inside this
repository's own `scratch/` tree instead of handing you a bare digest string.
Point `sign-intent` at that file with `--request` instead of
`--intent-sha256` — the two are mutually exclusive: exactly one must be
supplied, and supplying both (even a malformed digest alongside `--request`)
is rejected outright:

```sh
node "$REPO/plugins/pipeline-core/scripts/po-human-approval.mjs" sign-intent \
  --repo-root "$REPO" --directory "$PO_DIR" \
  --request scratch/reconcile-request-42.json
```

The request path must resolve inside this repository's own `scratch/`
directory (never elsewhere in the repository, never outside it, and never
via a symlink that points outside `scratch/`), and its JSON content must
carry an `intentSha256` field — 64 lowercase hexadecimal characters. Its
basename must contain the literal word `request` (for example
`scratch/reconcile-request-42.json`), because that word is what gets
substituted to derive the sibling proof/signer filenames below.

On success the durable proof still lands at `$PO_DIR/proof-manual.json` as
before, and this command additionally mirrors that proof and its signer
record back into `scratch/`, next to the request, under the request's own
basename with `request` replaced by `proof` and `signer` respectively —
`scratch/reconcile-proof-42.json` and `scratch/reconcile-signer-42.json` for
the example above. The requesting agent session finds both waiting in its own
repository root on its next turn: this collapses what used to be "sign, then
manually `cp` the request and proof files into place" into the one command
above.

## Control-plane integration

Agents, runners, and desktop applications use this public-only command before
and after the human action. It has no `setup` or `approve` mode and cannot
read a private key or a passphrase. The agent executes these commands itself;
they are not user recipes.

```sh
node "$REPO/plugins/pipeline-core/scripts/po-approval-gate.mjs" prepare-all --repo-root "$REPO" --directory "$PO_DIR"
node "$REPO/plugins/pipeline-core/scripts/po-approval-gate.mjs" verify-all --repo-root "$REPO" --directory "$PO_DIR"
```

The same script also carries the public half of the fork-disposition ceremony —
`prepare-fork-disposition` and `verify-fork-disposition`. `approve-fork-disposition`
is absent from it on purpose, exactly like `approve-critical`: it reads the
private key. Note the narrower separate limit inside this repository: the
lifecycle guard's agent allowlist admits only `prepare`, `prepare-all`, `verify`
and `verify-all` through this script, so the `-critical` and `-fork-disposition`
commands, though public, are run from an operator's terminal here until that
allowlist is widened.

## Critical external effects

For a remote push, a human-gated deployment or a publication, the control
plane prepares a separate `critical-action` request. It binds the clean
candidate commit/tree, current plan and Spec, one closed action kind and the
digest of the exact writer-owned action subject. The human signs it on the
hardened terminal with `approve-critical`; the agent can prepare and verify,
but cannot sign.

The policy field behind this is `requiredKinds` in
`project/critical-human-proof.json`. It is kind-scoped, it governs the State
writer and the push guard, and this repository lists exactly `push`, `deploy`
and `publication` in it. Removing a kind from that list does not stand the gate
down — the writer action rejects instead (ADR-0055); standing the proof down
takes an explicit, reasoned waiver.

A fourth kind exists and is deliberately outside that field's reach:
`governance-fork-disposition` (ADR-0063). The governance-event store never
consults `requiredKinds` for it — it demands a verified approval
unconditionally, reading only the `trustAnchor` from that same file, plus
`gates.push_approval` to decide whether a `chat` clearance is admissible at all.
So "add it to `requiredKinds`" is neither necessary nor sufficient for that
kind; the trust anchor is what makes it verifiable.

Planning, implementation, normal review and other chat-approved decisions do not
require the external signer. A proof is single-purpose: a push proof cannot
approve a deploy or publication, and candidate, subject or expiry drift requires
a new request.

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
not a CYB-4-only mechanism, and not the only one this contract will ever have.
The shipped adapter is the external encrypted Ed25519/SSH-style key path
documented above; it exists to prove the contract, not to close it.
Passkey/WebAuthn is the next expected **native** adapter — for a desktop
consumer, built where that consumer lives, not in this repository, which has
no desktop-app code. IAM, hardware-key, and password-manager adapters may
follow the same shape. This section is what a conforming adapter — Passkey/
WebAuthn or otherwise — is written against; it deliberately stops short of
prescribing a UI, a platform API, or a credential format, because none of
those are this repository's to decide.

**What a conforming adapter must implement.** Every adapter, regardless of
its key material or platform, produces a detached `proof` object with exactly
this shape (the shipped adapter's own output, unchanged):

```json
{
  "schema": "pipeline.po-approval-proof.v1",
  "intentSha256": "<sha256 hex of the approval-intent digest being signed>",
  "keyReference": "<the label the adapter's own trust-policy entry uses>",
  "publicKey": "<the adapter's public key, in whatever serialization its own trust policy hashes>",
  "signatureBase64": "<the signature over the intentSha256 bytes, base64-encoded>"
}
```

Three properties are non-negotiable, because the shared contract's callers —
the critical-action gate, the fork-disposition ceremony, the threat-model
gate — rely on all three without adapter-specific code of their own:

- **Candidate binding.** The `intentSha256` the adapter signs is not a bare
  message; it is the digest of an approval-intent object that already
  embeds the current candidate commit and tree, the action kind, and (for a
  critical action) the exact subject digest and expiry. An adapter never
  invents or shortens this digest — it signs exactly the digest the
  control plane already computed and showed to the human, unmodified. This
  is what makes a proof for one commit reject silently against any other.
- **Replay resistance.** Because the signed digest is candidate-bound, a
  proof captured for one candidate does not verify against a later one — a
  changed tree or commit forces a new digest, which forces a new signature.
  An adapter must not cache or reuse a prior signature across a candidate
  change, and must not accept a pre-computed signature offered by anything
  other than its own signing step for the exact digest under review.
- **The no-secret-agent boundary.** No private key material, passphrase,
  biometric template, hardware-token session, or platform credential
  handle may cross into agent context, chat transcript, repository content,
  CI environment, or Pipeline state at any point. The shipped adapter keeps
  the encrypted private key and its passphrase in an external directory the
  agent never reads and OpenSSL prompts for locally; a Passkey/WebAuthn
  adapter keeps the analogous boundary by never exporting the authenticator's
  private key material out of the platform's own secure enclave/OS
  credential store — the browser/OS `navigator.credentials` (or platform
  equivalent) ceremony runs on the human's device and only the resulting
  assertion, translated into the proof shape above, ever reaches the agent.
  An adapter that cannot state where its private key material lives and how
  it stays out of these four surfaces does not conform, independent of
  cryptographic correctness.

**What the verification surface actually checks — so a conforming adapter's
proof is accepted without touching the contract.** The consumer-side check
(`verifyPoApprovalProof` in `plugins/pipeline-core/lib/po-approval-proof.mjs`,
called from every kind-specific verifier: threat-model, critical-action,
fork-disposition) is adapter-agnostic on the fields above: it checks the
proof's `schema` tag, that `proof.intentSha256` equals the digest of the
rebuilt approval intent (so the proof cannot be replayed against a different
candidate/action/subject), that `sha256(proof.publicKey)` equals the
`publicKeySha256` pinned in the repository's own trust policy (so the proof
cannot substitute a different key than the one this repository was told to
trust), and finally that `proof.signatureBase64` is a valid signature over the
`intentSha256` bytes under `proof.publicKey`. None of those four checks name
Ed25519, OpenSSL, or any other adapter-specific detail — a Passkey/WebAuthn
adapter that emits the proof shape above, with a public key whose hash
matches its trust-policy entry and a signature that verifies over the same
digest bytes, is accepted exactly like the shipped adapter's proof, with no
change to `verifyPoApprovalProof` or its callers.

**One documented, narrower coupling, not a blocking one.** The signature
check itself currently calls Node's `crypto.verify(null, ...)` — the `null`
algorithm form that only Node's crypto library resolves without an explicit
digest algorithm for EdDSA-family keys (Ed25519/Ed448), which is exactly what
the shipped adapter's key is. Most WebAuthn/Passkey authenticators issue
ECDSA (P-256) credentials rather than Ed25519 ones; a future adapter whose
`publicKey` is such an ECDSA key would need `verifyPoApprovalProof` to pass
an explicit digest algorithm (or detect one from the key) rather than rely on
the `null` default, which is a small, well-scoped addition to that one
function, not a redesign of the contract. An Ed25519-issuing Passkey
authenticator (WebAuthn permits this credential type) would verify today
without any change. This document records the boundary precisely so a future
adapter implementer knows which side of it a code change is required on.

**What every human command below is not.** The setup/approve/authorize
commands documented above are one adapter's *implementation* of this
contract, not the contract itself; a Passkey/WebAuthn adapter has its own
one-time enrollment and its own per-approval user ceremony (a platform
prompt, not an OpenSSL passphrase entry), and is free to differ from every
CLI detail above as long as its output satisfies the proof shape and the
three non-negotiable properties stated here.

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
