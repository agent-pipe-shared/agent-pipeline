---
schema: pipeline.backlog-item.v1
id: pipeline.close-gate-rejects-critic-evidence-for-attested-records
type: defect
owner: pipeline
status: open
created: 2026-10-30
priority: P1
release: 0.7.0
sprint: alfred
source: "Consumer report N33 on 0.7.0+claude.20261030222500.21a5a8a (feature close of a live feature)"
done_when: manual
---

# The close gate rejects every Critic evidence for an orchestrator-attested record

A consumer reached `feature-close-prepared` after the N29 and reconcile fixes and was refused with
`CLOSE-CRITIC-EVIDENCE-MISSING` for two dispatch records that require a Critic. Both records are v4,
`orchestrator-attested`, one commit each, written through `dispatch-record-write.mjs --attested-request` (D56).

1. **The addendum validator excludes the record kind.** `validateCriticDispositionAddendum`
   (`lib/critic-disposition-addendum.mjs`) admits completed-undelivered, an interrupted Antigravity run,
   `authored-commit` and the v3 form; `orchestrator-attested` is not among them, so even a fully formed addendum is
   rejected. Review admission (`check-critic-skip-coverage.mjs`) already treats the kind as an authored delivery.
2. **Course evidence does not count at the close.** `boundCriticReviewFinding` requires the Critic packet's task id
   to equal the record's task id. The consumer reviewed the whole feature range in one Critic course (four rounds);
   the push gate accepted that evidence, the close gate does not.
3. **The refusal text is stale.** It still says "at most three correction-diff reviews ... never another Critic",
   which D190/D199 replaced, and names no command.
4. **Late detection.** Nothing before the close (attested writer, Critic preflight, `push-init`) reports that a
   required Critic has no satisfiable evidence; the feature was merged, deployed and smoke-tested first.

A remainder of N31 belongs to the same close route: the human-mode output of `authorize-critical` names only the
proof path (not the request and authority paths it wrote outside the project), there is no read action for the
reconcile `planSha256`, and `--by` is not marked as a value the PO supplies.

## Wanted (D212)

- A: the addendum validator admits a v4 `orchestrator-attested` record with exactly one commit equal to the
  addendum's `candidateCommit`.
- B: a consumed, passed Critic course receipt whose reviewed range contains the record's commit satisfies the
  record at the close; commit containment replaces task-id equality.
- The refusal names the current rule (no round cap) and the sanctioned route to write the addendum.
- D: the same coverage check runs early as a warning at the attested writer and in the Critic preflight, and as its
  own check line in `push-init`.
- N31 remainder: `authorize-critical` names request, proof and authority paths (or mirrors them as for a push), a
  read action prints the reconcile `planSha256`, and the builder marks `--by` as the PO's value.
