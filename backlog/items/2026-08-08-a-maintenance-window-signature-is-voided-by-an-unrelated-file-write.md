---
schema: pipeline.backlog-item.v1
id: pipeline.maintenance-window-signature-voided-by-unrelated-write
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-08-22
source: "Observed live while opening a Guard Maintenance Window for an AFK hardening session, 2026-08-08. The PO had already signed; the install failed."
---

# A maintenance-window signature is voided by a file write the human never authorized anything about

## What happened

`guard-maintenance-window.mjs prepare` bound `openingTreeSha256` to the live
plugin tree at preparation time. The PO read the confirmation, typed `approve`,
entered their passphrase, and produced a valid Ed25519 signature over the exact
intent digest. Between those two moments a parallel Goldfish wrote one unrelated
source file. `install` then refused:

    GUARD-MAINTENANCE-WINDOW-FAILED: live plugin tree drifted since the request was prepared

The signature was not forged, not replayed, not expired, and not mis-scoped. It
was simply useless, and the only route forward is to ask the same human for the
same decision a second time.

## Why this is a defect and not a working control

[ADR-0061](../../docs/adr/0061-uniform-human-approval-ceremony.md) records the
PO's binding order: one approval covers every layer of the command it authorizes
and **does not get consumed before the human's intent is finished**. The intent
here was "open a maintenance window for tonight's work". That intent was not
finished — it had not even started. What consumed the approval was an event the
human was never asked about and could not have anticipated: an ordinary write by
the very work the window exists to enable.

This is the same failure shape already recorded for the `GG-03` token in
`docs/state.md` (2026-08-07, fact 1): an approval spent by machinery rather than
by the approved action. Same family, different mechanism.

There is a second, sharper edge in the AFK case. The parallel-dispatch model the
Pipeline itself recommends makes plugin-tree writes *continuous* while work is in
flight. A prepare/sign/install ceremony that requires a frozen tree is therefore
not merely inconvenient during parallel work — it is close to unsatisfiable
during it, and gets harder the more the operating model is followed. The window
must be opened during a quiet moment that the work itself keeps destroying.

## What the binding is presumably for, and why it does not need this

`openingTreeSha256` plausibly exists so the audit record states what the tree
looked like when the lift was granted, and so a lift cannot be prepared against
one tree and silently installed against a very different one much later.

Both of those survive a weaker binding. The signed subject already carries
`repoFingerprintSha256`, the scope rule ids, an absolute `expiresAtMs`, a nonce,
and the feature/plan/spec identity. The tree hash adds provenance to the record;
it is not what makes the lift safe, and the expiry is what bounds it in time.

## Direction, not a design

Not designed here. The questions, in the order they matter:

1. **Should `openingTreeSha256` be an admission precondition at all, or only a
   recorded observation?** Recording the tree at install time — both the prepared
   and the observed hash — keeps the whole audit value without making an
   unrelated write void a human decision.
2. **If it must remain a precondition, what is the tolerated delta?** A drift
   confined to paths already inside the window's own scope is not evidence of
   tampering; it is evidence of the work proceeding. That is the same shape as
   the `approval-pending` tolerance the candidate freeze already accepts.
3. **Can `prepare` be made idempotent against its own intent?** If re-preparing
   after drift produced the *same* intent digest whenever scope, expiry, reason
   and feature are unchanged, the existing signature would still apply and the
   human would not be asked twice for one decision.

Option 3 is the one that most directly serves ADR-0061 and deserves the first
look; it is also the one with the most careful reasoning to do, since the intent
digest is what the signature covers.

## Triggering situation

Opening a 4-hour window (scope `GS-6`, `TP-1`, `TP-3`, `TP-5`) for an unattended
hardening session, with four Goldfish dispatches in flight. Reproduced
immediately and reliably: any plugin-tree write between `prepare` and `install`
does it.

## Related

- `2026-08-07-push-release-flow-unusable-for-third-party-adopters.md` — the same
  ceremony-cost thread.
- [ADR-0058](../../docs/adr/0058-guard-maintenance-window.md) — the window's own
  contract, which is where the binding is defined.
- [ADR-0061](../../docs/adr/0061-uniform-human-approval-ceremony.md) — the order
  this violates.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Option 3 — make `prepare` idempotent against its own signed
  intent digest, so a re-prepare after drift yields the same digest when
  scope/expiry/reason/feature are unchanged and the existing signature
  still applies.
- **Rationale:** PO, 2026-08-12: "option 3 aber ggf prüfen ob vorhin schon
  mit anderem item gelöst." Checked: `GG-03` (the other token/override
  mechanism referenced in `docs/state.md`) is a harness-classifier-denial
  double-confirmation override, an unrelated mechanism to this item's
  `openingTreeSha256` maintenance-window precondition — no overlap found,
  this item is not already solved elsewhere.
- **Assignment (if accepted):** SECURITY/GUARDRAIL-class (MP-07 max-tier
  model), queued for implementation this session.
- **Date:** 2026-08-12
