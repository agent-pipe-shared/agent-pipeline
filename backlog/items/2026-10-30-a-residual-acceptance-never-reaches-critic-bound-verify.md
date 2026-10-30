---
schema: pipeline.backlog-item.v1
id: pipeline.a-residual-acceptance-never-reaches-critic-bound-verify
type: defect
owner: pipeline
status: open
created: 2026-10-30
sprint: alfred
priority: P0
release: 0.7.0
source: "Consumer report N22 relayed by the PO 2026-10-30 (installed candidate 0.7.0+claude.20261030091213.ca4e1c4)"
done_when: manual
---

# A residual acceptance never reaches Critic-bound Verify

## Evidence (consumer report N22)

The PO signed `approve-residual-acceptance` for two minor findings of a consumed failed Critic receipt. Critic-bound
Verify then refused, and push stayed unreachable. The signature was spent for nothing.

## Source reading (2026-10-30, branch head c7508bf6c)

1. Binding. `approve-residual-acceptance` (`scripts/pipeline-state.mjs` near line 9315) binds the record to the
   current HEAD (`gitCandidate(dir)`); the signing route (`scripts/po-human-approval.mjs`
   `resolveResidualAcceptanceSubject`) computes the subject digest over that same HEAD candidate.
   `residualAcceptanceFor` (`lib/critic-verify-lifecycle.mjs` line 74) requires the Critic receipt's own candidate.
   One evidence commit after the Critic and the two never match.
2. Circle. The record is written into the tracked project state file, so the tree is dirty. Verify
   (`scripts/verify-evidence-producer.mjs` lines 156 and 421) and push-init require a clean tree; committing the
   state file moves HEAD (and is not an evidence-only commit for the carry-forward range).
3. Hand-over. `verify-evidence-producer.mjs` (lines 221 and 245) calls `readBoundConsumedCriticReceipt` without
   `residualAcceptance` deps, and `inspectConsumedCriticEvidenceCarryForward` (`lib/critic-verify-lifecycle.mjs`
   lines 188-190) passes only the receipt reader. A failed receipt therefore always ends in `CVL-CRITIC-FAILED`.
   Only the read side (`lib/critic-verify-readiness.mjs`) supplies the deps, and it binds them to HEAD.

## Decided fix (Elephant, 2026-10-30, within D190)

- The acceptance is bound to the Critic receipt's candidate (commit and tree), in the writer and in the signing
  subject alike.
- The record is private: `<git-common-dir>/agent-pipeline/critic-residual-acceptance/<criticReceiptSha256>.json`,
  carrying the record and its proof consumption entry; the tracked state file is not written. Replay of the same
  proof is refused across the private records.
- One shared loader supplies `residualAcceptance` and `verifyResidualAcceptanceFn` for a given Critic receipt; the
  Verify preflight, the lifecycle recorder, the evidence carry-forward and the readiness check all use it.
- An earlier acceptance in the state file is not migrated; it needs a new acceptance after the fix.

## Done when

A failed Critic receipt with only minor findings, accepted by the PO, followed by an evidence-only commit, passes
Critic-bound Verify on a clean tree and admits push-init; an end-to-end case proves it.
