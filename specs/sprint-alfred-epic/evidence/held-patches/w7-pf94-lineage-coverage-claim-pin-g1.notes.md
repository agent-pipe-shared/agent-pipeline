# W7 PF-94 pin slice G1: FPR-LINEAGE-COVERAGE-CLAIM is defensive, no case added

Slice W7-PF94-LINEAGE-COVERAGE-CLAIM-PIN-G1-C1-20261027. Candidate 7ef23589cf9126d38acf0753c9b784a3003b2483, stacked on the held bundle `scratch/agent-out/compose/bundle.patch` (applied only inside the scratch clones). Nothing committed by the Goldfish. The patch file is intentionally empty (0 bytes): the answer is "defensive branch, keep production line, add no case".

## Cause and evidence (line numbers on the stacked clone; re-verified, the recon note is model output)

Refusal: `plugins/pipeline-core/lib/feature-package-registration.mjs` lines 536 to 537 (`addCriticReviewLineage`), compares `consumed.receipt.reviewRange` (base, commit, diffSha256) with `packet.candidate.base/commit` and `packet.diff.sha256`.

Can a real route produce a differing receipt range? No:
- `scripts/critic-packet-preflight.mjs` line 294 to 298 (`materializeDiff`) builds `packet.diff` as `{base, commit: candidate, sha256}` from the same `base` and `candidate` that line 621 stores in `packet.candidate`. The two ranges are equal by construction.
- `scripts/session-critic-finalizer.mjs` line 527 (`buildResult`) writes `reviewRange` from `packet.diff`; line 547 (`validateResult`) refuses a result whose `reviewRange` differs; line 559 (`receiptFor`) copies it into the receipt; line 592 (`validateSessionCriticReceipt`) requires receipt candidate and reviewRange base/commit to agree.
- Caveat: `recordCandidatePacket`/`consumeCandidatePacket` in the packet store (preflight lines 758 to 793) accept any object as result or receipt, so a caller bypassing the finalizer could store a different range. That is not the course route, and the course claim reader refuses it first (below).

Tamper attempt (one attempt, then removed): a case rewrote `receipt.json` and the durable `state.json` consistently (the store has no external anchor for the receipt body). `readConsumedCandidateResult` accepted the pair (the step assertion on the tampered receipt passed). The verb then returned `FPR-LINEAGE-NO-COURSE-CLAIM` with `readerCode: CVL-COURSE-BINDING` (the course claim binding, `lib/critic-verify-lifecycle.mjs` line 383, compares `result.reviewRange` against the expected range) instead of `FPR-LINEAGE-COVERAGE-CLAIM`. Log: `scratch/agent-out/w7di/logs/g1.log` (tests 1, pass 0, fail 1, the failure being the exact-code assertion). The claim reader at line 529 of the registration module runs before the line 536 check, so the refusal is shadowed even for a forged store. Reaching it would need the claim binding to also be forged, which is a hand-built state no route produces. Per briefing item (3) no case was kept; the production line is untouched.

## Counts

- Whole-file runs, failing-name sets and the VCR01 pin: not run and not needed, since the delivered patch is empty and the stacked baseline is unchanged. The `generate-architecture-overview --check` was not run for the same reason.
- Setup: both clones detached at the candidate, bundle applied (exit 0) and staged as the baseline in both; the final `git diff --binary` of the clone against that baseline is 0 bytes.

## What is NOT done

No test added; no whole-file or architecture check run; independent Critic review stays a parent-owned batch gate; Full Verify and PO acceptance pending. Option for the Coordinator: either accept the branch as defensive (documented here) or, if a pin is wanted, widen the slice to a case that forges the claim binding as well (not recommended; would pin a state no route produces).

## Proposed commit message

test(critic): pin the refusal of a lineage whose receipt reviewed another range

(Only applicable if a patch is later produced; for this slice there is nothing to commit except these notes.)

## Operator flow and protected paths

Nothing to apply (empty patch). Commit the notes alone if wanted: `git add -u` is not enough for a new file, so stage the path explicitly, commit with `--no-verify`-free standard flow, stamp, install. No protected path was touched or observed as needed.
