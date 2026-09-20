# Review-admission remediation plan

## Scope

This plan covers the Critic packet admission boundary added by commits
`012e5de3` and `02784d50`. `evaluateReviewAdmission` reads the source
repository's complete dispatch-record corpus before a packet directory or
detached candidate checkout is created. It admits exactly one pending v3/v4
Critic record only when its task ID and candidate commit match the requested
review. Every other applicable record must be skipped with valid evidence;
malformed, stale, contradictory and unrelated pending records fail closed.

The common packet preflight calls the same evaluator, so Codex, Claude and
Antigravity Critic hosts receive the admission decision before their
runner-specific execution paths. The admission check deliberately operates in
the source evidence corpus: the dispatch record is produced after the candidate
commit and cannot truthfully be expected in that detached commit tree.

## Authority and approval sequence

The effective policy is `.claude/pipeline.yaml` and the checked-in reference
model is `nova-b-final-threat-model.json`, policy revision
`nova-b-final-boundaries-v3`. After the final candidate is committed and the
worktree is clean, prepare a detached threat-model approval request with this
plan, `specs/sprint-nova-epic/spec.md`, and that model. The request copies the
model with the exact candidate commit and tree, creates the approval intent,
and is signed outside the repository. Before a final PO decision, the Critic
must verify the request's candidate, policy revision and model digest. A chat
statement, dispatch record, or checked-in model is not a substitute for that
detached proof.

## Threats and controls

| Threat | Control | Verification | Residual boundary |
| --- | --- | --- | --- |
| A review is issued for a different or stale candidate. | The evaluator permits one exact `taskId` and `candidateCommit`; packet preflight runs it before constructing a packet. | `check-critic-skip-coverage.test.mjs` and `critic-packet-preflight.test.mjs` cover candidate mismatch and absent admission. | A maintainer who changes code must produce a new candidate and detached request. |
| A malformed or historical record is silently ignored to obtain review. | The full corpus is schema-validated; malformed v3/v4 records and any unrelated pending record block admission. | The coverage check reports each offending record; packet preflight returns `CPP-REVIEW-ADMISSION`. | Historical records require truthful reconciliation or their own valid review evidence; no synthetic Critic receipt is permitted. |
| A runner-specific route bypasses the common gate. | The gate is in common candidate-packet preparation, before host selection. | Packet-preflight tests exercise the common entry point; runner-specific host tests remain required for release evidence. | This change does not itself prove native execution on Linux, macOS and Windows. |

## Compatibility and rollback

The change is fail-closed and has no external production side effect. If a
regression is found before delivery, stop issuing Critic packets, retain the
dispatch corpus and review artifacts, and create a forward corrective
candidate. If the delivery must be withdrawn after merge, use an ordinary
revert of `02784d50` and `012e5de3` together, then immediately replace the
removed admission path with a fail-closed packet stop before any new packet is
issued. Never delete or rewrite dispatch records, detached requests, Critic
reports, governance events, or proofs. The rollback candidate requires fresh
focused tests, Full Verify, Security, a new Critic review and a new detached
approval request; it cannot reuse the withdrawn candidate's proof.

## Acceptance evidence

- `node plugins/pipeline-core/scripts/check-critic-skip-coverage.test.mjs`
- `node plugins/pipeline-core/scripts/critic-packet-preflight.test.mjs`
- `node plugins/pipeline-core/lib/threat-model-approval-request.test.mjs`
- Full Verify, Security and a fresh Critic review over the final committed
  candidate, followed by the detached approval request and its independently
  verified PO proof.
