---
schema: pipeline.backlog-item.v1
id: pipeline.critical-human-proof-policy-lacks-the-reconcile-approval-generalization
type: defect
owner: pipeline
status: closed
created: 2026-08-18
closed_at: "2026-08-18"
closure_repository: "self"
closure_commit: "d44f992eb60120005a4a02950af1356e2484d719"
closure_evidence: "plugins/pipeline-core/lib/critical-human-proof-policy.test.mjs"
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

### Closure, 2026-08-18 (evening)

**Decision:** Closed. Implemented by an earlier same-day dispatch (commit
`d44f992e`, before this item's own wave-1 re-dispatch ran) and the OT09
pin fix landed separately (`467a92bc`, via a completed signed HGO
author-repair ceremony — the TP-7 route this item's source paragraph
says Phoenix's own session could not self-select). Verified live:
`node --test plugins/pipeline-core/lib/critical-human-proof-policy.test.mjs`
→ 31/31 pass; `guard-testpath-override.test.mjs` OT09 already matches the
generalized shape. `feature-package-reconcile` correctly does not appear
in `CRITICAL_ACTION_KINDS`, and `po-human-approval.mjs` carries no
reconcile references — the ported surface stays dormant/unused exactly
as scoped. A parallel wave-1 dispatch confirmed this same finding
independently (no-op, nothing further to implement).

**Known gap, not blocking this closure:** this item's own Triage asked
for "a fresh Critic review before merge" specifically for the Nova port;
no dedicated Critic-review commit is visible near `d44f992e` in this
repo's history (the design itself was multi-round Critic-reviewed in
Phoenix before the port, per the source paragraph, but that is a
different repository's review, not this one's). Closing anyway because
the ported surface is genuinely dormant — no new call site makes it
reachable, `readReconcileApprovalMode`/the generalized
`criticalProofWaiverFor` branch affect nothing until a future dispatch
wires `feature-package-reconcile` into `CRITICAL_ACTION_KINDS` — so the
review gap carries no live risk today. Whoever does that future wiring
dispatch should treat a Critic review of this ported surface as a
prerequisite, not an optional nicety, since that is the point it stops
being dormant.
- **Date:** 2026-08-18

