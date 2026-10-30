---
schema: pipeline.backlog-item.v1
id: pipeline.signature-approvals-dirty-the-tracked-state-file
type: defect
owner: pipeline
status: open
created: 2026-10-30
priority: P1
release: 0.7.0
sprint: alfred
source: "Consumer handover 2026-10-30 (finding N26); PO direction 2026-10-30: major, a signature must not leave the working tree dirty, block the next steps and force a manual reset"
done_when: manual
---

# Signature approvals dirty the tracked state file

## Evidence

After every `approve-push` the consumer tree was dirty: `project/pipeline-state.json` gained `updatedAt`, a
`pushApproval.lastApproved` block (with `criticalProof`, `pendingAuditWrite: true`) and a
`criticalProofConsumption` entry (`scripts/pipeline-state.mjs` about lines 12638-12645). The next steps refuse
a dirty checkout, and the agent may not reset the file, so the PO typed `git restore` four times in one
delivery. Resetting the file also drops the replay-protection entry: a clean tree and kept replay protection
are impossible with this storage location. `pendingAuditWrite` stayed `true` after the push.

Related: `2026-10-26-push-approval-record-folds-at-push-close` (D161, fold at push close). That route still
leaves the tree dirty between approval and push. The residual acceptance already moved to a private,
candidate-bound store (`.git/agent-pipeline/critic-residual-acceptance/`) and works.

## Wanted (PO direction 2026-10-30)

1. `approve-push` and every `authorize-critical` approval kind write the approval and the proof consumption
   to a git-ignored private store under `.git/agent-pipeline/`, bound to the approved commit and destination.
   The tracked state file keeps only what the history needs.
2. Replay protection reads the private store: a second use of the same proof is refused.
3. The pre-push gate, `push-init` and `push-prepare` read the approval from the private store. The fold of
   `scripts/push-prepare.mjs` (NVA-CF-PUSHFOLD) and `pendingAuditWrite` are either removed or given one clear
   meaning, and the D161 item is reconciled with this one.
4. Tests: the tree is clean after `approve-push`; the push passes the gate; a replayed proof is refused; an
   old tracked `pushApproval` record is still read or migrated once.
