# PO decisions from the decision tiles, 2026-10-23

Answers to the entries of `po-list-afk-2026-10-22.md`, given by the PO in chat through question tiles after the AFK window.
Each line names the PO list row, the ceremony or item, the decision and the consequence. Nothing here is signed or applied:
protected patches still go through the bundled sitting.

| Batch | Row | Topic | Decision | Consequence |
|---|---|---|---|---|
| 1 | 27 | K1D / C26 private closed-feature release member step | Take C26; D73 E is extended to the private closed-feature release | Sitting applies the C26 pair (protected first, then the test case); raise the `onboarding-continuity.mjs` ratchet (69 lines over); the Critic reads the extra snapshot-admission rule; K1D closes after the sitting |
| 1 | 28 | K8 / C24 `evaluate.mjs` shared onboarding observation | Take C24 | Sitting applies the patch; K8 closes once C21, C22 and C24 are applied and counted green |
| 1 | 24 | K2 / C25 adapter purity split | Take C25 | Sitting applies the protected patch first, then the unprotected one; raise the `guard-maintenance-window.mjs` ratchet by one line; K2 then keeps only row 23 |
| 2 | 29 | K8 GS-1 on `pipeline.user.yaml` | PO rule: "every deadlock must stay repairable by signature in the user repo" (chat wording: "Jeder deadlock muss reparierbar bleiben per Signatur im user repo") | GS-1 on `pipeline.user.yaml` stays liftable by signature: the two Antigravity cases keep expecting the signature route, and the product's `HGO-NARROWER-USER-CONFIG-REFUSED` answer needs a signed-override repair route (protected product patch, K92); the two cases are NOT restated |
| 2 | 30 | K9 supervisor CLI suite | Extend D66 (a) | LWSC01 and LWSC03 to LWSC10 become typed pending cases naming a backlog item, assertions byte-identical; journal-phase design after 0.7.0 (K94, unprotected test file) |
| 2 | 25 | K12 S3 binding refusal choices | Confirm all three | Unjudgeable owner counts as running; unreadable scope only warns; no transitive import closure |
| 2 | 25 | K12 S2 guard default | Build now: the guard enforces overlap refusal without a slice queue and the refusal names the repair directly | Protected diff in `hooks/guard-dispatch.mjs` (K93): default enforce, message names the overlapping paths and the exact repair; new ceremony row |
| 1 | 19 | K6 / C28 Critic preimage re-pin | Re-pin at the end, right before the stamp, after the Critic batch | Test stays red until then; the re-pin patch is regenerated from the digests at that moment (never applied earlier) |
