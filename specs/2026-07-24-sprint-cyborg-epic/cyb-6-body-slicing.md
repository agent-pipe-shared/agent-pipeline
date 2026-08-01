# CYB-6 implementation plan — stack-aware verification

| Slice | Owns | Acceptance coverage |
| --- | --- | --- |
| CYB-6A | candidate-bound stack inventory and explainable capability planner | AC1–AC3 |
| CYB-6B | provider-neutral adapter contract, typed outcomes and safety boundaries | AC4–AC10 |
| CYB-6C | synthetic dynamic/fuzz and cross-platform/offline fixtures | AC6–AC12 |
| CYB-6D | CYB-2 evidence exchange, worked adapter guide and Verify evidence | AC5, AC13 |

The planner is pure and closed: discovery receives observed inputs only,
never runs setup scripts or installs tools. Required unavailable capability
outcomes block; optional absence stays explicitly typed. Every slice rolls
back with its Verify registration and retains prior candidate-bound evidence.
