# AC-9 evidence: D4 adoption decision (2026-10-22)

AC-9 (`acceptance.md:26`): typed state, priced staged proposal, one durable PO decision, evidence recorded.

| Element | Evidence |
|---|---|
| Typed state | `architecture-adoption.mjs status` read `adoption-required` (the earlier deferral `po-0.7.0-release-defer-2026-09-20` had expired on its review date 2026-10-20), then `approved-scoped` after the decision below. |
| Priced staged proposal | `architecture-adoption.mjs propose --json` on candidate `540e96f71`: four stages, 24 units in total (navigation map 5, core contracts 8, fitness model and baseline ratchet 5, continuous enforcement and receipts 6), coverage class `evaluated`. |
| One durable PO decision | `architecture/adoption-state.json`: `approved-scoped`, scope `specs/sprint-alfred-epic/`, decision ref `po-0.7.0-adopt-2026-10-22`, review date 2026-11-30, no expiry. Authority mode `signature`: an Ed25519 proof over intent digest `03c98952520d7113adede5ad1b336ae487fef96792bbf72ef04e572d39afee71`, produced by the PO at an attended terminal (`po-human-approval.mjs sign-intent`), subject digest `265f4bf98a87a8fed004b32fbb36574685637ef0ffebe4ce4890e873afac0ea5`, signer key sha256 `2de20a39d0f1c13c15350e428ea0c70be50f8fbca26ec88758a8dcb1a880beee`. |
| Readback | `architecture-adoption.mjs status` after apply: `Adoption State: approved-scoped`. |

Scope of the claim: the decision adopts the staged proposal for the Alfred epic scope. It does not build the four stages; building them is the follow-up the review date 2026-11-30 governs. PO acceptance of AC-9 itself remains with the PO (stage 100).
