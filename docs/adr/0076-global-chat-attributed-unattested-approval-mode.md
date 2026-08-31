# ADR-0076: a global chat approval is deliberately attributed but unattested

> Agent-Pipeline · 0.6.0 candidate · as of 2026-08-30

**Status:** accepted (2026-08-30, explicit PO decision). **Refines**
[ADR-0056](0056-push-approval-mode.md): its action-local `chat` mode remains
the legacy compatibility route; this record defines the common policy where a
repository deliberately chooses one approval posture for every participating
human gate. It does not rewrite ADR-0056's historical account of the old
route.

**Governs:** pipeline.user.yaml, README.md, docs/usage.md, docs/operating-model.md

This covers the global `gates.human_approval` choice in `pipeline.user.yaml`,
plus the language used for approval records and the user-facing approval
guidance carried in those three docs. It does **not** claim that every
installed plugin version or every gate has already implemented that selector.

## Context

The existing per-action choice in ADR-0056 lets a repository use `signature`
or `chat` for a push (and later selected action-local gates). It correctly
states that chat is attribution rather than proof, but its original interaction
still assumed a human-operated recording command. That is unsuitable for the
intended low-consequence use case: a PO should be able to approve in the chat
where the work is being discussed, without creating a key, trust anchor,
external signing directory, attended terminal, UI/host attestation, or a
copy-paste ceremony.

The convenience must not be described as stronger than it is. A chat system
cannot prove that a displayed reply came from a particular human, and an agent
which writes the durable record cannot thereby create an independent proof of
human presence. The policy must make that limitation visible rather than hide
it behind a gate-shaped UI.

## Decision

### 1. One explicit repository-wide selector

`pipeline.user.yaml` may carry the following V3 gate setting:

```yaml
gates:
  human_approval: "signature" # or "chat"; absent/invalid remains signature
```

`signature` remains the default. It is the only approval option intended to
provide a strong, cryptographically attested human authorization, subject to
the active verifier and trust-policy configuration. A repository must select
`chat` explicitly; a missing, unreadable, invalid, or unsupported setting must
not silently become chat.

### 2. The global `chat` posture is `chat-attributed-unattested`

Where a participating gate resolves to `chat`, an explicit PO answer in the
chat is enough for the agent to attribute and record the approval itself. No
human terminal command, copied command, TTY/UI/host presence signal,
cryptographic proof, trust anchor, key material, or external signing directory
is required for that route.

The persisted basis is named **`chat-attributed-unattested`**. That name is a
limit, not a marketing label:

- it records what the agent attributes to the chat and, where the gate keeps
  them, the ordinary action/candidate bindings;
- it is **not** evidence that a human was present, that a particular account or
  device produced the message, or that a host/UI/terminal attested anything;
- an agent may convert an observed chat answer into the record, so the record
  alone cannot distinguish a genuine answer from an agent-fabricated one.

Normal deterministic checks, action-specific bindings, and non-approval safety
rules are not made optional by this selection. They are separate controls and
must not be reported as an attestation of the chat approval either.

### 3. Scope is deliberately low-consequence only

`chat` is allowed only for repositories the PO has deliberately classified as
low-consequence and non-critical. It is not an appropriate posture for a
security-sensitive, regulated, production-critical, financially consequential,
or otherwise valuable repository, nor for a repository that needs evidence of
who approved an action. The software cannot infer that classification from a
repository; this is an explicit operator responsibility, not an enforcement
claim.

### 4. Legacy and migration boundary

ADR-0056's existing action-local keys — notably `gates.push_approval` and the
later `gates.reconcile_approval` — remain the compatibility behavior while
`gates.human_approval` is absent. Their documented default is still
`signature`.

An implementation that recognizes the global selector resolves a committed
`gates.human_approval` before those action-local choices for gates that opt in
to the common policy. It must persist the `chat-attributed-unattested` basis
rather than relabel it as a signature, a terminal confirmation, or a proof.
The precise list of participating gates is an implementation contract and must
be evidenced by that implementation's tests; this ADR does not infer support
for a gate merely because it has a human step.

Older installed plugins may reject or ignore the new key. Do not add it and
assume a global effect until the installed version's config validation and
runtime readback recognize it. No migration deletes trust anchors, keys, or
legacy action-local settings: they remain necessary whenever `signature` is in
effect.

## Consequences

**Positive.** A genuinely low-consequence repository can use a single direct
chat answer for a human gate without forcing a key/bootstrap/terminal ceremony
that exceeds its stakes. The durable record makes the weaker basis legible to a
later reader instead of presenting it as equivalent to an Ed25519 proof.

**Negative.** `chat` deliberately removes independent proof of human intent.
It therefore cannot satisfy a requirement for identity, non-repudiation,
hardware/host/TTY presence, or cryptographic candidate authorization. The
global selector is also broader than ADR-0056's action-local settings, so an
operator must consider its low-consequence classification for the whole
repository rather than one convenient operation.

**No release claim.** This is a policy decision and documentation contract. It
does not declare Nova complete, does not retroactively change any recorded
approval, and does not claim that a particular 0.6.0 candidate has implemented
every participating-gate path. Runtime support and regression evidence remain
separate delivery work.

## Alternatives considered

- **Keep a terminal command for every chat approval.** Rejected. It makes the
  terminal, rather than the chat answer, the effective human interaction while
  still failing to produce cryptographic proof. It adds friction without
  delivering the property signature mode is for.
- **Call chat approval "attested" after a UI, TTY, or host check.** Rejected.
  Those signals do not establish that the approving chat message was human
  authored, and calling them proof would be a false security claim.
- **Remove signature mode once chat is easier.** Rejected. Signature remains
  the only strong attested option and is required whenever the repository's
  stakes demand that property.
- **Silently translate legacy `push_approval: chat` into a global policy.**
  Rejected. Legacy configuration remains action-local until an operator makes
  the new global choice explicitly.

## Follow-up

- Each implementation that adopts `gates.human_approval` must test its
  fail-closed default, precedence over the applicable legacy key, exact
  `chat-attributed-unattested` record, terminal-free chat route, and unchanged
  signature route.
- User documentation must continue to distinguish the installed runtime's
  capabilities from this policy. A new selector must never be advertised as
  effective before the installed version reads it.
- Reassess this decision before using `chat` on any repository whose stakes no
  longer satisfy Decision 3; changing the repository's consequence class is a
  new PO decision, not an automatic migration.
