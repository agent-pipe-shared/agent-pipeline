# Delivery status (current)

**221items ·27below75 ·maturity index70.70%.**

| Stage | Items |
|---|---:|
|25|11|
|50|16|
|75|194|
|100|0|
|UNKNOWN|0|

[Current snapshot](delivery-amendment-2026-10-26-d163-hotfix/README.md). Six rows reach75 on the D163 hotfix candidate (operator commit `9ce6c2361`, stamp `689116c57`) and on `45612a7bd`; D164 adds the P1 row `pipeline.preflight-establishes-runner-prerequisites` at25; D165 adds two P0 consumer blocker rows at25 (late review unit blocks push; brownfield architecture gate never passes) for an interim candidate. D166 adds seven Toolbox rows (P0 D25, D6 at50, D7 complex; P1 D8, D9, D14/D18, D21 with the rest of D3). D172 (2026-10-27): 75 counts when the work is technically delivered in the candidate (PO), so D25, PF-78 and S7b move to75 (held patches D166/D169, D167, D168 in operator commit `304365b68`, installed in `…20261026222010.17e002a`) and D7 to50 (D170 `17e002a67`, D171 `bff5c444e`); the Glossover findings PF-79 (P0), PF-80 and PF-81 (P1) join at25. D173 (2026-10-27): PF-80 moves to75 (held patch D173 in operator commit `e3f0d7d03`, installed in the stamp `e562ae955`). No Full Verify, Critic, native or acceptance promotion.

Active goal: all deliverables at75 for the next Greenfield round on the installed hotfix candidate. Full Verify and the batch Critic run only once every row is at75 and the happy path shows no P0/blocker and no P1/critical/major finding (D163, D164).

Portability-only correction: G10/G19/G20/G21 capture references now resolve to [tracked transports](pc-transfer-dependency-closure-2026-10-25/custody.json). Stages and counts are unchanged.
