# Case-completion migration batch

Date: 2026-09-12
Scope: Nova B, runner-neutral Verify evidence

Three further legacy process-only suites now declare their complete case corpus
before fixture setup or callback execution and emit the standard bounded
case-completion stream consumed by Verify:

| Verify suite | Case policy | Result |
|---|---:|---|
| `product-capability-inventory-tests` | `PCI01`–`PCI28` | 28 declared, 28 disposed, terminal count 28, 28 pass |
| `stack-adapter-contract-tests` | `SAC01`–`SAC23` | 23 declared, 23 disposed, terminal count 23, 23 pass |
| `publication-executor-v2-tests` | `PEV01`–`PEV14` | 14 declared, 14 disposed, terminal count 14, 14 pass |

Each suite includes a child self-probe that injects a failure into case 02. The
probe requires the final case to execute and requires one terminal disposition
for every declared case. This is the original failure mode's direct regression:
an early assertion can make its own case fail, but cannot make later cases
disappear without evidence.

The shared registry remains 181 entries and moves from 18 required / 163 legacy
to 21 required / 160 legacy. Verify binds the exact policies above. Direct
developer runs keep a writable null descriptor and therefore exercise the same
case registration without minting a Verify receipt.

Focused verification passed for all 65 normal cases and all three injected
early-failure probes. `check-verify-case-completion.mjs` reports a valid
181-entry registry, and its 14-case meta-suite passes. The product inventory
suite's Git clone fixture requires normal host process access; its first WSL
process-sandbox run failed with `spawnSync git EPERM`, and the same focused
offline suite passed 28/28 outside that process sandbox. This is not native
Codex sandbox readiness evidence.

The parent also registered the new module-cluster reachability test and mapped
its derived Verify surface to deterministic verification in the same known
`verify.mjs` edit. That suite is ordinary `node:test` with nine independently
registered tests and is not part of the legacy truncation population.

The aggregate backlog item remains open for the remaining 160 staged legacy
suites.
