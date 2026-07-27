# Nova issue intake and A/B allocation

## Snapshot

Observed on 2026-07-24 from
`agent-pipe-shared/agent-pipeline`. All 15 records below are open and carry
`sprint:nova`. Issue bodies are design inputs, not authority over the accepted
Operating Model or ADRs.

ADR-0043 originally listed only `#7,#8,#12,#14,#16,#18,#21`; later issue work
expanded the label to 15. The PO has now explicitly retained the full current
label set. This package resolves the expanded portfolio by Nova A/B sequencing
rather than by silently dropping labels.

## Allocation

| Issue | Size / role | Increment | Critical design adjustment |
| --- | --- | --- | --- |
| [#57](https://github.com/agent-pipe-shared/agent-pipeline/issues/57) Automatic Spec-bound backlog reconciliation | P0 / blocker / quality foundation | Nova A | First foundation: sanctioned item initialization, assignment/closure automation, atomic projections and append-only repair of events 39/40. |
| [#7](https://github.com/agent-pipe-shared/agent-pipeline/issues/7) Runner conformance | P0 / L / release prerequisite | Nova A | Becomes the certification foundation; reports capability cells, not universal parity. |
| [#8](https://github.com/agent-pipe-shared/agent-pipeline/issues/8) Reproducible benchmark | P1 / L | Nova A | Freeze scoring before worker/external modes; reconcile the existing backlog item. |
| [#12](https://github.com/agent-pipe-shared/agent-pipeline/issues/12) Bounded scheduling | P1 / XL | Nova A | Compose the existing deterministic planner; do not add process supervision here. |
| [#14](https://github.com/agent-pipe-shared/agent-pipeline/issues/14) Execution-plane contract | P1 / XL | Nova A | Versioned companion/envelopes only; the v1 exchange remains frozen. |
| [#29](https://github.com/agent-pipe-shared/agent-pipeline/issues/29) Durable selected-sandbox resolution | P1 / M | Nova A | Narrow capability resolver; never cache a gate pass or misreport fallback assurance. |
| [#38](https://github.com/agent-pipe-shared/agent-pipeline/issues/38) Invocation reliability | P1 / L | Nova A | Supplies generic preflight/attempt/resolution contracts; telemetry never becomes authority. |
| [#54](https://github.com/agent-pipe-shared/agent-pipeline/issues/54) Critic convergence | P1 / L | Nova A | Consumes `#38` and `#29`; fresh review remains mandatory and hard budgets become executable. |
| [#56](https://github.com/agent-pipe-shared/agent-pipeline/issues/56) Release preflight | shared release gate | Nova A | Provider-neutral core only; Cyborg requirements enter through a later approved extension. |
| [#21](https://github.com/agent-pipe-shared/agent-pipeline/issues/21) Local Goldfish pool | P1 / XL | Nova B | Starts only after accepted `#7/#8/#12/#14`; serial fallback and reserved capacity are product requirements. |
| [#16](https://github.com/agent-pipe-shared/agent-pipeline/issues/16) Async remote adapter | P2 / L | Nova B | Extends the accepted local-first contract; no provider is required for core tests. |
| [#18](https://github.com/agent-pipe-shared/agent-pipeline/issues/18) Credential leases | P1 / XL | Nova B | Activates only after the execution boundary; secrets remain broker-owned. |
| [#15](https://github.com/agent-pipe-shared/agent-pipeline/issues/15) Antigravity/Gemini | P0 / XL / release gate | Nova B | Current official contract is pinned at implementation time; only conformance-certified cells are exposed. |
| [#51](https://github.com/agent-pipe-shared/agent-pipeline/issues/51) GitLab forge | P1 / XL | Nova B | Independent forge lane after Nova A; Git stays the VCS and weaker provider controls stay explicit. |
| [#49](https://github.com/agent-pipe-shared/agent-pipeline/issues/49) Native macOS assurance | P0 / XL / final release gate | Nova B close | Runs last on the exact integrated candidate; Apple Silicon evidence does not imply Intel support. |

## Issues considered but not added

| Issue/group | Decision |
| --- | --- |
| `#13` external execution-plane pilot | Remains post-Nova integration. Nova B defines async and lease contracts but does not select an external service pilot automatically. |
| `#17` rich event/replay model | Remains a Phoenix concern. Nova uses the minimum frozen exchange/event projection. |
| `#39,#41`–`#48` | Remain Sprint Cyborg. Nova consumes only accepted, reconciled outputs after both branches complete. |
| Other open Nightwing/Phoenix/SCM/brand items | No Nova membership inferred from thematic proximity. |

## Issue maintenance recommendation

No GitHub mutation is part of design. After PRD approval, issue bodies should
receive a common, bounded amendment that records:

- Nova A or Nova B allocation;
- exact dependency/activation gate;
- this approved PRD path and, after its own gate, the canonical Spec path;
- no unpublished Cyborg dependency;
- per-issue close evidence requirement; and
- the rule that incomplete criteria remain open.

The `sprint:nova` label stays on all 15 by PO decision. New `nova:a` /
`nova:b` labels are not required; if the PO later wants them, their names,
descriptions and colors need a separate exact preview and approval.
