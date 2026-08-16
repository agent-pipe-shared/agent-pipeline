---
schema: pipeline.backlog-item.v1
id: pipeline.gmw-reconcile-still-needs-a-manual-copy-after-the-po-signs
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-16
source: "PO, 2026-08-16, observed live in agent-pipeline-share_phoenix: after po-human-approval.mjs sign-intent succeeded (PO-HUMAN-SIGN-INTENT-READY) and the GMW window was active, the session still asked the PO to manually run two `cp` commands to move scratch/reconcile-request-*.json and scratch/reconcile-proof-*.json into the external PO directory. PO: 'dass man nach der freigabe noch mal was von hand kopieren muss sollte auch nicht sein' (having to manually copy something again after the approval shouldn't be necessary either)."
---

# GMW/HGO reconcile hand-off still needs a manual copy after the PO has already signed

## Description

The push-approval ceremony (ADR-0056) was already collapsed to one PO-run
command (`authorize-critical`, prepare+sign in one). The GMW/HGO reconcile
path observed live in the Phoenix repo has not had the same treatment: even
after `po-human-approval.mjs sign-intent` succeeds and the GMW window is
confirmed active, completing the reconcile still requires the PO to run two
plain `cp` commands by hand to move the request and proof JSON files from
the repo's `scratch/` into the external PO directory
(`~/agent-pipeline-po-nova/`), because the agent session is blocked from
writing there directly (`GUARD-CROSS-REPO-MUTATION`: a governed session may
write only inside its own physical project root). The PO's point: having
already done the one irreversible, must-be-human step (typing the
passphrase to sign), a second manual hands-on step immediately afterward is
avoidable friction, not a second safety boundary.

## Triggering situation

Live GMW reconcile attempt in `agent-pipeline-share_phoenix` on 2026-08-16:
`po-human-approval.mjs sign-intent` completed successfully; the session then
hit `GUARD-CROSS-REPO-MUTATION` trying to place `reconcile-request-*.json`
into the external PO directory itself, and fell back to asking the PO to run
two `cp` commands manually before the reconcile could proceed.

## Affected artifact

`plugins/pipeline-core/scripts/guard-human-override.mjs` (HGO plan /
prepare-authorization / authorize-by-signature commands) and
`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`
(`GUARD-CROSS-REPO-MUTATION` — the guard forcing the copy to be manual in
the first place). Same shared mechanism as ADR-0056/ADR-0058
(push-approval and GMW), so a fix here is Public Core, not a
Phoenix-local one.

## Proposal

Not yet designed. Two directions worth comparing when this is picked up:
(a) let the PO's already-typed signature also authorize a single,
narrowly-scoped, audited copy step that the agent executes on the PO's
behalf (the write target is fixed and PO-owned, not arbitrary, so this may
not need the same boundary `GUARD-CROSS-REPO-MUTATION` protects against in
general); (b) keep the write manual but collapse the two separate `cp`
commands into one PO-run script the way `authorize-critical` collapsed
prepare+sign, so the ceremony is at most "one thing to sign, one thing to
run" instead of "one thing to sign, two things to copy by hand." Needs a
Design-tier look (touches a guard boundary) before either is built.

## Triage (filled in by the Elephant of the next Pipeline session)

