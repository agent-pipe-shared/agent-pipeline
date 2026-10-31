---
schema: pipeline.backlog-item.v1
id: pipeline.residual-acceptance-expires-after-the-signature-window
type: defect
owner: pipeline
status: open
done_when: manual
release: 0.7.1
created: 2026-10-31
sprint: alfred
source: "Toolbox finding N36 (2026-10-31): a PO residual acceptance given the day before was invalid at feature close and had to be signed again."
---

# A residual acceptance becomes invalid after its signature window although it is a historical record

## What happened

A PO residual acceptance (`accept-residual-critic-findings`, then `approve-residual-acceptance`) was signed with a window that ended the same
evening. The next day the feature close refused it with `RESIDUAL-PROOF-EXPIRED`; the PO had to sign a second time with identical content, although
packet, candidate and findings had not changed. The plan and the addendum binding only said that a failed receipt never binds without a PO
residual acceptance: no hint that the record had expired, and no route.

## Cause (read from the code by the reporting session)

`loadResidualAcceptanceDeps` (`lib/critic-verify-readiness-read.mjs`) loads the private record under `.git/agent-pipeline/critic-residual-acceptance/`.
`verifySignedAction` (`lib/critical-action-authorization-read.mjs`) compares `expiresAt` with the current time on EVERY read, not only when the
decision is captured. A decision that was valid when it was signed becomes invalid retroactively.

## Proposed direction

Check the expiry only at capture time (the consumption ledger already proves validity at the moment of acceptance), or at least make the
refusal distinguish "missing" from "expired" and name the route: capture the acceptance again, then approve it again. To be decided by the PO:
whether a read of an already consumed acceptance may ignore the window (the weaker reading) or the window must be extended by policy.
