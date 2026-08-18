---
schema: pipeline.backlog-item.v1
id: pipeline.critical-human-proof-policy-lacks-the-reconcile-approval-generalization
type: defect
owner: pipeline
status: open
created: 2026-08-18
source: "PO, 2026-08-18, relayed live from the sibling agent-pipeline-share_phoenix session: Phoenix's local `plugins/pipeline-core/lib/critical-human-proof-policy.mjs` was legitimately generalized (ADR-0056's 2026-08-11 Follow-up, PHX-WP-PAC08-RECONCILE-APPROVAL) to a `GATE_APPROVAL_MODE_KEYS` lookup table supporting a second gate (`gates.reconcile_approval`, kind `feature-package-reconcile`), multi-round Critic-reviewed (T2-T5 findings referenced in its own comments). Phoenix's TP-7-protected `guard-testpath-override.test.mjs` OT09 still pins the pre-generalization literal `gates?.push_approval`, which no longer appears in the generalized source, blocking Phoenix's own Verify/push. TP-7 requires the fix at an explicit author source root, which Phoenix's own session cannot self-select or write to. Confirmed by direct read of both repos: neither this repo (Nova) nor the local marketplace copy has the generalization yet -- Nova and marketplace currently agree with each other (both pre-generalization), only Phoenix has moved ahead."
---

# `critical-human-proof-policy.mjs` lacks the `gates.reconcile_approval` generalization Phoenix already built and Critic-reviewed

## Description

Phoenix (a sibling Public Core checkout, different sprint) built and
multi-round-Critic-reviewed a backward-compatible generalization of
`readPushApprovalMode`/`criticalProofWaiverFor` into a data-driven
`GATE_APPROVAL_MODE_KEYS`/`GATE_APPROVAL_MODE_DEFAULTS` table, adding
`readReconcileApprovalMode` for a second gate kind
(`feature-package-reconcile` -> `gates.reconcile_approval`) alongside the
existing `push` -> `gates.push_approval`. This repo (Nova) does not have it.
Because `plugins/pipeline-core/**` test files are protected (TP-7,
`guard-testpath.mjs`) and require an explicit author-source-root fix rather
than an in-session edit, Phoenix cannot resolve its own now-inconsistent
`guard-testpath-override.test.mjs` OT09 assertion (still pinned to the old
literal `gates?.push_approval`, absent from the generalized source) from its
own session. Left as-is, this also matches the PO's own named risk: a future
`claude plugin update` in Phoenix could silently roll the generalization back
if the marketplace copy (which both Nova and Phoenix ultimately sync from/to)
never picks it up.

## Affected artifact

`plugins/pipeline-core/lib/critical-human-proof-policy.mjs` (the port target)
and `plugins/pipeline-core/hooks/guard-testpath-override.test.mjs` OT09 (the
TP-7-protected pinned assertion that must track the new source shape).

## Triage (filled in the same session, 2026-08-18)

- **Decision:** accepted, scoped, dispatched now — PO explicitly chose "port
  into Nova now" over "prepare a patch for someone else to apply", given the
  change is additive, backward-compatible, and already Critic-reviewed in
  Phoenix.
- **Scope, deliberately bounded:** port ONLY the lookup-table generalization
  in `critical-human-proof-policy.mjs` (`GATE_APPROVAL_MODE_KEYS`,
  `GATE_APPROVAL_MODE_DEFAULTS`, `readGateApprovalMode`,
  `readReconcileApprovalMode`, the generalized `criticalProofWaiverFor`
  branch) verbatim from Phoenix's reviewed shape, and update Nova's OT09
  pinned assertion to match. Explicitly NOT in scope: adding
  `"feature-package-reconcile"` to `CRITICAL_ACTION_KINDS`
  (`critical-action-approval-request.mjs`), any GMW-reconcile ceremony call
  site, or `po-human-approval.mjs` changes -- none of that machinery exists
  in Nova yet, so the ported surface stays dormant/unused (an unused export)
  until a future dispatch wires up the real feature. This keeps the port
  low-risk and reviewable in isolation.
- **Not this session's job:** actually syncing the fix into
  `~/agent-pipeline-local-marketplace/plugins/pipeline-core/` (a separate
  physical root this session cannot write to, GUARD-CROSS-REPO-MUTATION) or
  into Phoenix's own checkout. Once this port lands, verifies clean, and
  passes Critic review, it becomes the candidate to rsync+stamp into the
  marketplace through the existing procedure -- a follow-up, PO-involved
  step, not part of this item's own closure.
- **Dispatch:** `goldfish-deep` (security-adjacent gate-strength code,
  protected-test-path handling), with a fresh Critic review before merge.

