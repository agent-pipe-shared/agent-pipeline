---
schema: pipeline.backlog-item.v1
id: pipeline.prepared-maintenance-window-dies-at-the-next-commit
type: defect
owner: pipeline
status: open
created: 2026-08-08
source: "Found on 2026-08-08 while planning a TP-3/TP-5 window for Phoenix. The Elephant was about to hand the PO a prepare command with two implementation dispatches still in flight; reading install() first showed that every commit those dispatches made would have voided the signature before it could be used. Caught by reading, not by a refusal -- the ceremony gives no warning at prepare time."
due: 2026-09-07
---

# A prepared maintenance window dies at the next commit, and nothing says so until the signature is already spent

## Description

`installGuardMaintenanceWindow` binds the request to the repository's exact
`HEAD` at prepare time and refuses if it has moved:

```
GMW-CANDIDATE-COMMIT-MISMATCH  current HEAD commit does not match the signed candidate commit
GMW-CANDIDATE-TREE-MISMATCH    current HEAD tree does not match the signed candidate tree
```

(`lib/guard-maintenance-window.mjs:495-503`.) The binding itself is right, and
its comment argues the case well: the physical-repository fingerprint proves it
is the same repository, but says nothing about whether the committed state is
still the state the human signed for.

The defect is not the check. It is that **the ceremony never tells the human this
before they spend a signature**, and the ceremony's own shape makes the failure
likely:

1. The agent runs `prepare` and prints an intent digest.
2. The human leaves the session, goes to a trusted terminal, and signs it — the
   step the whole design exists to force.
3. The agent runs `install`.

Between (1) and (3) the repository is expected to sit still. Nothing enforces
that, nothing warns about it, and `prepare`'s output does not mention it. Any
ordinary act — a docs commit, a dispatch finishing its work package, a rebase —
silently invalidates a signature the human has already given. The human then
learns this from a five-word code, having already typed their passphrase.

## Why this is worth fixing rather than documenting

The failure lands on the one participant who cannot see it coming. The agent
knows whether commits are likely in the next few minutes; the human, standing at
a different terminal with a passphrase prompt, does not. The current design
places the cost of that asymmetry on the human.

It also interacts badly with a property this same module deliberately preserved.
Commit `23d93b0` removed an equality check on the live-plugin tree precisely
because it "killed a signature on any unrelated write to it, for a reason the PO
was never asked about" (`:504-518`). That reasoning applies almost word for word
to the candidate binding — the difference being that here the invalidating write
is not unrelated, so removing the check would be wrong. The right repair is
therefore disclosure, not removal.

## Proposed repair

Three options, cheapest first. They are not exclusive.

1. **Say it at `prepare`.** Have `prepare`'s output carry the bound candidate
   commit and one plain sentence: this signature is valid only while `HEAD` stays
   at `<sha>`; commit nothing between signing and installing. Costs nothing and
   closes most of the gap.
2. **Refuse to prepare into a moving target.** When the working tree is dirty in
   a way that implies an imminent commit, or when the caller declares work in
   flight, make `prepare` warn or refuse. Weaker than it sounds — dirtiness does
   not imply a commit — but it catches the common case.
3. **Bind the candidate at install rather than at prepare.** The signed subject
   would cover scope, expiry, reason and repository identity; the candidate would
   be observed and recorded at install as a fact, the way `openingTreeSha256`
   already is (`:504-521`). This is the structural fix and needs a threat-model
   decision: it widens what one signature admits, which is exactly what
   ADR-0058's candidate binding narrowed on purpose.

Option 3 is not obviously correct and should not be taken without that decision.
Option 1 is unambiguously an improvement and should ship regardless.

## Related

- `2026-08-07-approval-mechanisms-require-out-of-session-po-acts.md` — the same
  out-of-session step is what opens this window of exposure.
- `2026-08-08-trust-mismatch-names-neither-the-expected-key-nor-the-directory-that-holds-it.md`
  — the same failure class: a correct refusal that names nothing actionable, at
  the moment a human has already paid the cost.
- The two signing-UX findings recorded in `docs/state.md` (the five-minute plan
  TTL, and the intent digest the tooling never prints) belong to the same
  ceremony and should be repaired together rather than one at a time.
