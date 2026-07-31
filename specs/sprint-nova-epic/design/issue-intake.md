# Nova issue intake and A/B allocation

## Current snapshot

The authoritative planning snapshot was refreshed read-only from
`agent-pipe-shared/agent-pipeline` on 2026-07-30. Membership is the current
GitHub label intersection:

- include every open Issue carrying `sprint:nova`;
- exclude an Issue carrying another `sprint:*` label or any `hotfix:*` label;
- preserve the current Issue body and accepted scope comments as design input;
  and
- never infer delivery or closure from labels, Issue state, branches or file
  presence.

The resulting Nova portfolio is exactly 16 open Issues:

`#7,#8,#12,#14,#15,#16,#18,#21,#29,#38,#49,#51,#54,#56,#57,#60`.

None of those 16 Issues has a competing Sprint or hotfix label. The
`blocker` label on `#7`, `#15`, `#49` and `#57` is a release-priority signal,
not a competing ownership label. The `triage:needs-review` label on `#56`
does not remove its explicit Nova membership.

This snapshot replaces the earlier 17-Issue allocation. Issue `#63` now
carries `hotfix:0.4.7` and no `sprint:nova` label. It is therefore not a Nova
deliverable. Its accepted implementation must arrive through the later rebase
onto the stable `main` 0.4.7 baseline. Existing Nova B4R bytes and evidence are
historical pre-rescope material: they are neither extended nor deleted before
that rebase and cannot claim Nova delivery. The PO separately permits
pre-rebase Nova packages whose exact write-sets are disjoint from Bootstrap,
installation, runtime-readback and V4/#63 recovery.

## Allocation

| Issue | Current size / role | Increment | Binding design detail |
| --- | --- | --- | --- |
| [#57](https://github.com/agent-pipe-shared/agent-pipeline/issues/57) Automatic Spec-bound backlog reconciliation | P0 / blocker / quality foundation | Nova A | Sanctioned item initialization, assignment/closure automation, atomic projections and append-only repair of events 39/40. |
| [#7](https://github.com/agent-pipe-shared/agent-pipeline/issues/7) Runner conformance | P0 / L / release prerequisite | Nova A | Certify capability cells rather than universal parity. Per the 2026-07-28 comment, expose required usage/cost and Critic-assurance fields or a typed unavailable result; `#75` owns their cross-runner taxonomy, denominators and aggregation. |
| [#8](https://github.com/agent-pipe-shared/agent-pipeline/issues/8) Reproducible benchmark | P1 / L | Nova A | Freeze scoring before worker/external modes and reconcile the existing backlog item. Unknown usage is never zero. |
| [#12](https://github.com/agent-pipe-shared/agent-pipeline/issues/12) Bounded scheduling | P1 / XL | Nova A | Compose the deterministic planner; do not add process supervision here. |
| [#14](https://github.com/agent-pipe-shared/agent-pipeline/issues/14) Execution-plane contract | P1 / XL | Nova A | Versioned companion/envelopes only; the v1 exchange remains frozen. |
| [#29](https://github.com/agent-pipe-shared/agent-pipeline/issues/29) Durable selected-sandbox resolution | P1 / M | Nova A | Narrow capability resolver; never cache a gate pass or misreport fallback assurance. |
| [#38](https://github.com/agent-pipe-shared/agent-pipeline/issues/38) Invocation reliability | P1 / L | Nova A | Generic preflight, attempt, resolution and repair contracts; telemetry never becomes authority. |
| [#54](https://github.com/agent-pipe-shared/agent-pipeline/issues/54) Critic convergence | P1 / L | Nova A | Consume `#38` and `#29`; keep fresh review and hard course budgets. Per the 2026-07-28 comment, `#75` owns cross-runner usage/cost and assurance aggregation, not Nova. |
| [#56](https://github.com/agent-pipe-shared/agent-pipeline/issues/56) Release preflight | shared release gate | Nova A | Provider-neutral core only; later reconciled requirements enter through versioned extensions. |
| [#60](https://github.com/agent-pipe-shared/agent-pipeline/issues/60) Runner-native continuation | P1 / M-L / continuation baseline | Nova B | Bind active executable work to one generation-bound native goal/readback for Codex and Claude Code without a watchdog or automatic unblock claim. |
| [#21](https://github.com/agent-pipe-shared/agent-pipeline/issues/21) Local Goldfish pool | P1 / XL | Nova B | Start only after accepted `#7/#8/#12/#14`; serial fallback and reserved capacity are product requirements. |
| [#16](https://github.com/agent-pipe-shared/agent-pipeline/issues/16) Async remote adapter | P2 / L | Nova B | Extend the accepted local-first contract; no provider is required for core tests. |
| [#18](https://github.com/agent-pipe-shared/agent-pipeline/issues/18) Credential leases | P1 / XL | Nova B | Activate only after the execution boundary; secrets remain broker-owned. |
| [#15](https://github.com/agent-pipe-shared/agent-pipeline/issues/15) Antigravity/Gemini | P0 label retained; Nova scope narrowed | Nova B | Per the PO-approved 2026-07-27 comment, Nova delivers only the documentation-bound Alpha descriptor and fail-closed unavailable cells. Direct AGY execution belongs to `#69` (`sprint:NONE`). |
| [#51](https://github.com/agent-pipe-shared/agent-pipeline/issues/51) GitLab forge | P1 / XL | Nova B | Independent forge lane after Nova A; Git stays the VCS and weaker provider controls stay explicit. Live operations remain an implementation-stage, separately authorized gate. |
| [#49](https://github.com/agent-pipe-shared/agent-pipeline/issues/49) macOS assurance | P0 label retained; Nova scope narrowed | Nova B close | Per the 2026-07-27 comment, Nova retains the synthetic/non-native boundary plus bounded keep-awake and resume continuity. Native Apple-Silicon delivery belongs to `#72` (`sprint:NONE`). |

## Excluded and external work

| Issue/group | Decision |
| --- | --- |
| `#63` V4 recovery deadlock | `hotfix:0.4.7`; excluded from Nova delivery. Stable `main` 0.4.7 containing the accepted fix is a mandatory rebase prerequisite before protected-surface work, increment acceptance and final candidate evidence. |
| `#13` external execution-plane pilot | Post-Nova integration. Nova B defines async and lease contracts but does not select an external service pilot automatically. |
| `#17` rich event/replay model | Phoenix concern. Nova uses the minimum frozen exchange/event projection. |
| `#39,#41`-`#48` | Sprint Cyborg. Nova consumes only accepted, reconciled outputs after both Sprints complete. |
| `#69` direct executable AGY integration | Future dedicated AGY Sprint, currently `sprint:NONE`. |
| `#72` native Apple-Silicon assurance | Separate candidate/evidence lifecycle, currently `sprint:NONE`. |
| `#75` cross-runner usage/cost and assurance taxonomy | Nightwing-owned dependency boundary. Nova exposes typed capability availability but does not deliver its aggregation system. |
| Other Nightwing/Phoenix/SCM/brand/hotfix items | No Nova membership inferred from thematic proximity. |

## Rebase and phase gate

No `main` bytes are imported before the stable 0.4.7 baseline. After the
16-Issue PRD/Spec/Acceptance/plan set is byte-consistent and digest-bound, the
Pipeline may enter bounded pre-rebase Execution.

Every pre-rebase dispatch must provide an exact write-set. Bootstrap,
installation, marketplace, runtime-readback and V4/#63 recovery paths are
protected; an absent or uncertain classification is protected as well. The
stable 0.4.7 rebase, conflict disposition, regenerated bindings and refreshed
PO readiness remain mandatory before those paths, Nova A acceptance or final
candidate evidence.

## Issue maintenance

No GitHub mutation is part of this Design correction. At Sprint close, every
in-scope Issue receives exact merged-candidate and evidence accounting.
Incomplete criteria remain open. New `nova:a` / `nova:b` labels are not
required and would need a separate exact preview and approval.
