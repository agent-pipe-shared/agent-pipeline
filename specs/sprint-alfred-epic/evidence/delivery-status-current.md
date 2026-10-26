# Delivery status (current)

**217items ·27below75 ·maturity index70.62%.**

| Stage | Items |
|---|---:|
|25|11|
|50|16|
|75|190|
|100|0|
|UNKNOWN|0|

[Current snapshot](delivery-amendment-2026-10-26-d163-hotfix/README.md). Six rows reach75 on the D163 hotfix candidate (operator commit `9ce6c2361`, stamp `689116c57`) and on `45612a7bd`; D164 adds the P1 row `pipeline.preflight-establishes-runner-prerequisites` at25; D165 adds two P0 consumer blocker rows at25 (late review unit blocks push; brownfield architecture gate never passes) for an interim candidate. D166 adds seven Toolbox rows (P0 D25, D6 at50, D7 complex; P1 D8, D9, D14/D18, D21 with the rest of D3). No Full Verify, Critic, native or acceptance promotion.

Active goal: all deliverables at75 for the next Greenfield round on the installed hotfix candidate. Full Verify and the batch Critic run only once every row is at75 and the happy path shows no P0/blocker and no P1/critical/major finding (D163, D164).

Portability-only correction: G10/G19/G20/G21 capture references now resolve to [tracked transports](pc-transfer-dependency-closure-2026-10-25/custody.json). Stages and counts are unchanged.
