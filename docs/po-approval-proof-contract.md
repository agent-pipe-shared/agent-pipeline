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

For Cyborg, the portable command is:

```sh
REPO="$HOME/src/agent-pipeline-share_cyborg"
PO_DIR="$HOME/agent-pipeline-po"
mkdir -p "$PO_DIR"

node "$REPO/plugins/pipeline-core/scripts/po-approval-request.mjs" prepare \
  --repo-root "$REPO" \
  --feature-id cyb-4 \
  --plan specs/2026-07-24-sprint-cyborg-epic/prd_cyborg-epic.md \
  --spec specs/2026-07-24-sprint-cyborg-epic/spec.md \
  --model specs/cyb-4/threat-model.json \
  > "$PO_DIR/request.json"
```

It requires a clean checkout and emits a public request for the exact current
commit/tree. `REPO` makes the command work from any directory; `PO_DIR` stays
outside the repository. Have the trusted signer inspect and sign
`approvalIntent.sha256`. Afterwards, verify the three public files from paths
outside the checkout:

```sh
node "$REPO/plugins/pipeline-core/scripts/po-approval-request.mjs" verify \
  --repo-root "$REPO" \
  --request "$PO_DIR/request.json" \
  --authority "$PO_DIR/trust-policy.json" \
  --proof "$PO_DIR/proof.json"
```

The command does not have a `sign` mode and refuses request/proof/trust-policy
paths within the repository. It is safe to call from Bash, PowerShell, or a
desktop terminal because no secret is accepted by either command.

## Adapter boundary

No IAM, passkey, desktop, or key-store adapter is embedded in the core. Each
adapter needs only two operations: resolve the configured public trust anchor,
then return a detached proof for `intentSha256`. This keeps initial setup light
for solo developers while allowing richer adapters later without changing the
receipt format or the PO approval process.

## Candidate-bound reference records

The checked-in CYB-4 threat-model and legacy receipt are immutable historical
reference fixtures, not a delivery authority. They bind their recorded
candidate only and have `authority: false` in the feature package manifest.
They cannot approve a later Git candidate: the delivery boundary receives the
candidate explicitly and requires a newly generated, externally signed proof
whose intent binds that exact commit and tree. A final PO gate therefore does
not rewrite or reuse a repository fixture; it imports and verifies detached
proof material created after the final candidate exists.
