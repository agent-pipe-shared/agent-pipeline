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

- **Decision:** accepted — deferred to a dedicated design round. Owner: `pipeline`, due `2026-08-30`.
- **Investigation done this session (2026-08-17), so the next pass starts from findings, not from zero:**
  - No file under `plugins/pipeline-core/{scripts,lib,hooks}` in this Public Core repo contains the literal strings `reconcile-request` or `reconcile-proof`, or any `cp`/copy guidance tied to an external PO directory. The exact two-`cp`-command friction the PO hit live is not produced by code that exists in this repo today — either it is Phoenix-repo-local tooling not yet upstreamed, or the PO was working around `GUARD-CROSS-REPO-MUTATION` by hand rather than following a Pipeline-authored instruction. **Before any fix is designed, confirm which of these it is** — a fix aimed at Public Core code that never produced the friction would not help Phoenix.
  - `plugins/pipeline-core/scripts/po-human-approval.mjs` is itself a PO-run tool (`sign-intent`, `authorize-critical`, etc. all take `--repo-root <repo> --directory <external-dir>` and are documented/exercised as commands the human runs directly, unguarded, on their own machine — see ADR-0056/ADR-0061 precedent, and this session's own `authorize-critical --subject` work for ADR-0064). Because the PO's own process is not subject to `GUARD-CROSS-REPO-MUTATION` (that guard binds a *governed agent session*, not the human's shell), **the PO's own tool already has simultaneous filesystem access to both the repo's `scratch/` and their external PO directory** — the boundary the manual `cp` works around belongs to the *agent* session that prepares the request, not to the human step that signs it. This reframes the fix: it is very plausibly not a guard change at all, but extending `po-human-approval.mjs`'s own PO-run subcommand(s) to read the request/write the proof directly against the repo-root `scratch/` path (which the PO already passes or could pass alongside `--directory`), collapsing "one thing to sign, two things to copy by hand" into "one thing to sign, one thing to run" — the exact shape `authorize-critical` already achieved for push-approval prepare+sign. If this holds up under a real read of the actual Phoenix-side flow, it needs no guard-boundary change and no ADR.
  - **Direction (a) from the original Proposal (let the PO's signature also authorize the agent session to write the copy itself) looks wrong on a closer read, not just heavier.** `guard-lifecycle-ready.mjs`'s own `crossRepositoryMutationBlocked()` denial text is deliberate and emphatic that "Pipeline source, another repository, marketplace metadata, cachebuster updates, and plugin installation require **a separate session rooted at the exact target** plus their own explicit PO authorization" — this reads as an intentionally absolute boundary (no in-session exception at all, by design), not an incidentally-strict one that a signature could legitimately soften. Recommend dropping direction (a) rather than carrying it forward as a live option; direction (b), refined by the finding above, is the one worth designing next.
- **Rationale for deferring rather than building now:** confirming which repo actually contains the friction, and reading the full `sign-intent`/`authorize-critical` PO-run flow closely enough to extend it correctly, is real investigation this session did not complete — proportionate to a dedicated pass, not a rushed inline fix riding on an unrelated dispatch.
- **Date:** 2026-08-17

