# ADR-0056: the push gate stays; how a human clears it becomes a configured mode

> Agent-Pipeline · Sprint Nova · as of 2026-08-06

**Status:** accepted · **Basis:** PO instruction, 2026-08-06 — *"das push Gate
grundsätzlich ja aber die externe Signierung muss konfigurierbar sein also entweder
human gate per chat oder harte Freigabe extern mit Signatur und das per
pipeline.user.yaml oder so konfiguriert"*. **Refines** [ADR-0055](0055-critical-human-proof-waiver.md).

## Context

[ADR-0055](0055-critical-human-proof-waiver.md) gave the Ed25519 gate an off-switch,
but got two things wrong for what the PO actually wanted.

**It was a switch, not a mode.** `waivedKinds` reads as "the gate is off here", when
the real choice is *which kind of human clearance* is demanded. The gate is not being
turned off in either setting — a human still clears every push, bound to the exact
candidate commit. What changes is whether that clearance is a detached cryptographic
proof or an in-session act.

**It lived in the wrong file.** `project/critical-human-proof.json` is an internal
policy artifact. ADR-0055's own rejected-alternatives section argued against
`pipeline.user.yaml` on the grounds that projecting a single setting would need new
plumbing. That reasoning optimised for implementation cost over the operator, and the
PO overruled it: the setting belongs in the source of truth the operator actually
edits.

## Decision

### 1. `gates.push_approval` in `pipeline.user.yaml`

```yaml
gates:
  claude_md_max_lines: 200
  dev_plan: "blocking"
  push: "blocking"
  push_approval: "signature"   # or "chat"; optional, default "signature"
  security: "blocking"
```

`gates.push` decides **whether** the push gate blocks. `gates.push_approval` decides
**how a human clears it**. Two separate questions, two separate settings; conflating
them is what made ADR-0055 necessary in the first place.

- **`signature`** — a detached Ed25519 proof, private key outside the repository,
  verified against an externally configured trust anchor. The agent can construct the
  intent; it cannot produce the proof.
- **`chat`** — the human clears the gate in-session by recording the approval
  themselves. No key, no ceremony.

### 2. `signature` is the default, and every failure resolves to it

Absent file, absent key, unparseable YAML, an unrecognised value, a symlinked source:
all mean `signature`. A gate whose configuration cannot be read sits at its strongest
setting, never its weakest. The key is optional in the schema so a
`pipeline.user.yaml` written before this ADR stays valid and keeps the strong default.

### 3. What `chat` does NOT relax

The mode changes exactly one thing. Everything else holds identically:

- the approval is still bound to the **exact candidate commit** — it never carries to
  the next one;
- the approval is still **attributed** (`--by`);
- Verify and Security evidence must still be green and candidate-bound;
- the record still **says what backed it** (`criticalProofWaiver` with
  `mode: "chat"` and its source), so a chat-cleared push is never byte-identical to a
  proof-backed one.

### 4. What `chat` honestly is, stated plainly

**It is an attribution record, not proof of a human.** In `signature` mode the agent
is cryptographically incapable of producing the clearance. In `chat` mode it is not —
the only thing separating a genuine clearance from a fabricated one is that the human
runs the approval command. This is a real and deliberate weakening, chosen for
ergonomics, and it is written into the record rather than glossed. Anyone reading
`mode: "chat"` in the state should read it as "a human said yes here", not as "a human
was proven present".

### 5. For `push`, the source wins; a contradiction fails closed

`pipeline.user.yaml` is the operator-facing control for `push`. A policy-file waiver
for `push` alongside an explicit `signature` in the source is an ambiguous
configuration and is refused with `CRITICAL-PROOF-MODE-CONFLICT` rather than resolved
by precedence — two files disagreeing about a gate's strength is exactly the class of
defect ADR-0054 was written about, one level up.

`deploy` and `publication` keep ADR-0055's policy-file waiver: they have no
`pipeline.user.yaml` key, and inventing two more would widen the operator surface
without a request for it.

### 6. Read directly, not projected

The policy module reads `pipeline.user.yaml` itself. `gates` is **not** one of the V3
compiler's owned keys — the manifest's gate block is hand-maintained — so projecting
this one setting would mean extending the frozen owned-keys contract for it, and would
then need ADR-0054's tier-agreement treatment as well. Direct read, one source, no
second copy to drift.

## Consequences

**Positive.** The operator sets this where they already set everything else, in one
word, and both settings keep a real human gate. The strong default survives an
unconfigured, misconfigured or damaged source. The weaker mode is self-declaring in
the durable record.

**Negative.** `chat` is genuinely weaker and a reader must know what it means — hence
decision 4 being explicit rather than diplomatic. The setting is read directly rather
than compiled, so it is one more file the guard consults at runtime; that is accepted
because the alternative is a projected copy that can go stale, which is the failure
this sprint has already paid for twice.

## Rejected alternatives

- **Keep `waivedKinds` as the only control.** Rejected by the PO: it is an internal
  artifact, and "waiver" frames a mode choice as an exception.
- **Drop to `gates.push.approval: standing-approved` for the soft mode.** Rejected:
  that removes the human gate entirely. The PO asked for a *human gate per chat*, not
  for no gate.
- **Project the setting into the compiled manifest.** Rejected for now, per decision 6.
- **Let `chat` mean "the agent asks and records the answer".** Rejected: the agent
  would control both sides of its own gate, which is not a gate. The human must
  perform the recording act.

## Follow-up

- `deploy` and `publication` have no source-of-truth mode. If an operator ever asks
  for one, the shape is already proven here.
- The `chat` mode makes a session-level attestation plausible (a signed session
  transcript reference, say). Not built, not needed for the ask.
