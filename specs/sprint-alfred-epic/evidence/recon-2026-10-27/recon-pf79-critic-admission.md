# Recon: pipeline.critic-admission-requires-a-dispatch-record-a-project-cannot-have (P0, PF-79)

Source: read-only Explore agent, 22 tool calls, 2026-10-27. Model output; claims re-verifiable at the cited lines. One scratch/backlog rg was blocked by the guard (D176 mention check incomplete).

## Cause (re-verified in source)
- plugins/pipeline-core/scripts/check-critic-skip-coverage.mjs:903 inside evaluateReviewAdmissionCore (:800): with no matching evidence/dispatch-record-*.json, admittedCount stays 0 and it pushes `review admission requires exactly one matching target for <taskId>@<sha>; found 0`.
- plugins/pipeline-core/scripts/critic-packet-preflight.mjs:512 turns it into CPP-REVIEW-ADMISSION. The message names task and sha only: no expected path, no producer, no alternative.
- createLocalDispatchEvidenceBinding (check-critic-skip-coverage.mjs:317) is called from critic-packet-preflight.mjs:515; session finalizer (scf:485-489) and batch route (cgb:247) read the record too.

## Already delivered
- D172 recon (held-patches/d172-pf79-admission-dispatch-record-recon.notes.md): routes, facts a record proves, Wanted-2 design (`undispatchedRangeEvidence`). BLOCKED on PO questions Q1-Q3.
- D175 recon: a post-hoc native record is impossible (background dispatch ends NGHF-PENDING-UNAVAILABLE; a later v3 record would be a forged authorship claim). Documenting dispatch-record-write.mjs does not unblock a consumer whose dispatches were background calls.
- D173 (PF-80) committed e3f0d7d03: LDE-* codes, finalizer detail; pinned by check-critic-skip-coverage.test.mjs:318.
- D176 (refusal message) NOT delivered: refusal text at :903 unchanged.
- No code for Wanted 2.

## Minimal slice (D176 only; Wanted 2 stays PO-blocked)
- Edit check-critic-skip-coverage.mjs:903 only. Keep prefix `review admission requires exactly one matching target for ${taskId}@${candidateCommit}; found ${admittedCount}` byte-identical (tests at :209 and :666 match /found 0/).
- Append a suffix only when admittedCount === 0 saying: (1) expected record is `evidence/dispatch-record-${taskId}.json`; (2) a record is written by the host at the end of a foreground goldfish dispatch (host commit), cannot be authored by hand, and a background dispatch leaves none; (3) a range with no dispatch history has no admitted route yet and needs a PO decision, item `pipeline.critic-admission-requires-a-dispatch-record-a-project-cannot-have`.
- Do not mention init-dispatch-record.mjs as a fix; do not promise `undispatchedRangeEvidence`. critic-packet-preflight.mjs:512 needs no edit.
- Write scope: check-critic-skip-coverage.mjs + check-critic-skip-coverage.test.mjs. No new files besides held-patch outputs.
- Cases RED-first (after :318, helper `evaluateReviewAdmission({root, taskId, candidateCommit, readChangedPaths: () => []})` as at :206): (1) no record -> ok false, findings match /evidence\/dispatch-record-NEXT\.json/, /host/, /foreground/, /cannot be authored/; (2) old prefix and `found 0` still present; (3) matching record -> ok true, no suffix; (4) admittedCount 0 with other findings -> suffix once.

## Estimate
18-24 Goldfish calls.

## Risks / protected paths
- Custody chain: critic-packet-preflight, session-critic-finalizer, critic-generic-batch are named custody paths; check-critic-skip-coverage.mjs is not listed but D173 edited it as a held patch. Deliver as held patch d176-pf79-refusal-names-record-path.{patch,notes.md}; classification of the live guard for this path unverified, confirm before dispatch.
- Does not close the item (needs Wanted 2 + PO answers Q1-Q3; native-host, verify-wsl, critic, po-acceptance stay open). Do not claim the consumer's cause is (a) (D175: not established).
- Docs gap (producer not named in critic-review skill / pipeline-start references) is a separate non-test slice.

## Runner-neutrality
Pure Node message text in the shared admission function; identical under Claude, Codex, Antigravity. No runner-specific vocabulary in the message ("foreground goldfish dispatch", "host commit").

## Recommendation
Held patch YES, single Goldfish slice D176. Matrix effect: improves the refusal only; row stays below 75 unless PO answers Q1-Q3 and Wanted 2 is delivered.
