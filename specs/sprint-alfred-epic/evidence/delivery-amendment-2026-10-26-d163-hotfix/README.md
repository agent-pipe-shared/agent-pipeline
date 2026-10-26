# Delivery amendment 2026-10-26: D163 hotfix candidate

Snapshot: [`snapshot.json`](snapshot.json), previous: [portable closure 2026-10-25](../delivery-amendment-2026-10-25-portable-closure/README.md).

The PO applied the nineteen held patches of the C29 row as one operator commit `9ce6c2361` (D163) and stamped
`0.7.0+<runner>.20261026134650.9ce6c23` in `689116c57`. The Coordinator verified that the commit's tree is byte-identical
to HEAD `10e8573b5` plus the nineteen patches in order, and that both local marketplace copies equal the repository plugin
tree (2219 files). Claude, Codex and Antigravity installs report the new version.

**207 items · 190 at 75 · 15 at 50 · 2 at 25 · 17 below 75 · index 72.71%** (previous 184/17/6, 71.5%).

| Row | From | To | Evidence |
|---|---:|---:|---|
| `pipeline.greenfield.r2.onboarding-identity-and-actor-reuse` | 25 | 75 | `r2-identity-actor-reuse` patch and notes, helper `82f781b08` |
| `pipeline.greenfield.r2.behavioral-evidence-oracle` | 25 | 75 | direct commit `45612a7bd` (recorded in State, not yet in a snapshot) |
| `pipeline.greenfield.r2.critic-validation-transaction-recovery` | 50 | 75 | `r2-critic-txn-owner-recovery` patch and notes |
| `pipeline.greenfield.r2.windows-lock-release-postcondition` | 25 | 75 | `r2-windows-session-locks` patch and notes |
| `pipeline.greenfield.r2.windows-session-lock-owner-recovery` | 25 | 75 | `r2-windows-session-locks` patch and notes |
| `pipeline.greenfield.g33.post-close-push-continuity` | 50 | 75 | `g33-damaged-state-recovery` patch and notes |

75 means focused Source readiness. Each moved row drops only its `agent` open entry; native-host, Verify/Security,
frozen Critic and PO acceptance stay open. Native Windows behaviour of the two Windows rows is not measured.

Not in this snapshot: row 208 `pipeline.push-approval-record-always-trails-the-signed-commit` exists only in the
off-machine commits `64dbc35d0`/`6f089c41b` (see `docs/state.md`). D161 (`d161-push-close-fold`, applied here) addresses
it; it joins at 75 when those commits are merged. Report 05 minors PF-60, PF-63, PF-66, PF-68 and PF-70 map to existing
ACs and remain open.
