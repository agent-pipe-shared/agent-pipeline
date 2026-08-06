# ADR-0055: the Ed25519 human hard gate gets a sanctioned off-switch

> Agent-Pipeline · Sprint Nova · as of 2026-08-06

**Status:** accepted · **Basis:** PO instruction, 2026-08-06 — *"was man auch
konfigurieren können muss ist das human hard gate mit dem private key ausserhalb des
repos. wir lassen es hier im default an aber das sollte man abschalten können wenn es
einen nervt."*

## Context

Two different controls sit on top of a push, and they were being conflated.

**Control 1 — is there a human push gate at all?** `gates.push.approval` in the
project manifest: `standing-approved` auto-passes, `required` demands a recorded,
commit-bound approval. This was already configurable. As of 2026-08-06 this repository
sets it to `required` by PO decision (see
[ADR-0054](0054-arbitheon-authority-directory-and-precedence-chain.md) — the value had
been decided on 2026-08-02 in commit `fb0e9ac` but written only to the tier the
resolver does not serve, so it had never taken effect).

**Control 2 — must that approval be backed by a detached Ed25519 proof?**
`project/critical-human-proof.json` (`pipeline.critical-human-proof-policy.v1`) lists
`requiredKinds: ["push", "deploy", "publication"]`. This one had **no off-switch at
all**, and the only thing that looked like one was a trap: deleting `push` from
`requiredKinds` does not relax the gate, it makes `approve-push` *reject* with
`CRITICAL-PROOF-POLICY-KIND-REQUIRED`. An operator who found the proof step annoying
and tried the obvious thing locked themselves out instead.

That trap is good design for what it defends against — nobody should be able to
disarm a cryptographic gate by quietly trimming a list — but it leaves no legitimate
path at all, which is what the PO is asking for.

A second, smaller problem: the policy reader lived inside
`scripts/pipeline-state.mjs`, so `hooks/guard-push.mjs` could not see the policy and
simply assumed it. Any switch added to one would have been invisible to the other.

## Decision

1. **`pipeline.critical-human-proof-policy.v2`** adds `waivedKinds`. A waiver names
   its kind and carries a `reason` (8–500 characters). `.v1` keeps parsing unchanged
   and waives nothing.

   ```json
   {
     "schema": "pipeline.critical-human-proof-policy.v2",
     "requiredKinds": ["push", "deploy", "publication"],
     "waivedKinds": [{ "kind": "push", "reason": "<why, in the operator's words>" }]
   }
   ```

2. **A waived kind stays in `requiredKinds`.** The action remains gated; only the
   private-key proof is stood down. Deletion still rejects — waiving and removing are
   deliberately different acts with deliberately different outcomes.

3. **A waiver is never inferred.** No policy file is not a waiver. An unreadable
   policy is not a waiver. A kind simply missing from `requiredKinds` is not a waiver.
   Only an explicit, reasoned `.v2` entry is, so "nothing configured" can never
   silently become "gate off".

4. **The recorded approval says what backed it.** `approve-push` writes
   `criticalProof: null` plus `criticalProofWaiver: { kind, reason }`. `guard-push.mjs`
   refuses an approval recorded *before* the waiver existed, because such a record
   claims a proof-backed authority it does not have. There is no third, unlabelled
   state.

5. **One reader, two consumers.** The policy reader moves to
   `plugins/pipeline-core/lib/critical-human-proof-policy.mjs`. The State writer and
   the push guard now read the same implementation, so the switch is visible to both.

6. **Default on, here and everywhere.** This repository ships no waiver, and a test
   asserts that (`CHP13`): a committed waiver in the Pipeline's own repository is a
   test failure, not a configuration choice.

## What each setting actually does

| `gates.push.approval` | waiver for `push` | Effect |
| --- | --- | --- |
| `standing-approved` | (irrelevant) | Auto-pass. No approval recorded, no proof. |
| `required` | none | Approval bound to the exact commit **and** a detached Ed25519 proof. Raw `git push` is refused; the fixed publication executor carries the push. |
| `required` | present | Approval bound to the exact commit. No proof, no key, no executor — raw `git push` passes once the approval is recorded. |

The middle row is this repository's setting. The bottom row is the answer to *"wenn
es einen nervt"*: you still consciously approve each push commit, you just do not
need the key on that machine.

## Consequences

**Positive.** There is now a legitimate way to stand the proof down, and it is
committed, diffable and attributable rather than a deletion that fails closed.
Turning it off does not collapse to `standing-approved` — the human gate survives the
waiver, which is the setting most operators actually want. The guard and the writer
can no longer disagree about the policy, because there is one reader.

**Negative / residual.** `waivedKinds` is a second place where the gate's strength is
decided, and a reviewer now has to read two fields instead of one to know whether a
proof is demanded. Accepted: the alternative is an operator population that either
runs with a gate they cannot switch off or discovers the deletion trap the hard way.
The `reason` is free text — it documents the decision, it does not validate it.

## Rejected alternatives

- **Let deletion from `requiredKinds` mean "off".** Rejected: that is exactly the
  quiet-disarm path the current rejection exists to prevent, and it leaves no record
  of the decision in the file that governs it.
- **Put the switch in `pipeline.user.yaml` and project it.** Rejected for now:
  `critical-human-proof.json` is not a V3 projection target, so this would mean new
  projection plumbing for a single boolean, and the projected copy would then need
  the tier-agreement treatment of ADR-0054 as well. Revisit if more security policy
  moves into the compiled surface.
- **An environment variable or a local, uncommitted file.** Rejected outright for a
  security gate: an off-switch nobody can see in a diff is worse than no off-switch.
- **Drop to `gates.push.approval: standing-approved` as the only way out.** Rejected:
  that removes the human gate entirely, when the thing the operator wants removed is
  the key ceremony. Conflating the two is what made this ADR necessary.

## Follow-up

- PRD approval (`approve-plan`) still takes an unattributed `--by <name>` and is not
  proof-bound. That is the remaining half of
  `backlog/items/2026-08-05-critical-human-proof-not-wired-to-push-and-prd-gates.md`
  and is out of scope here — this ADR closes the push half.
- `docs/po-approval-proof-contract.md` states that push proof is non-optional. That
  remains true of *deletion*; it now needs the waiver described alongside it.
