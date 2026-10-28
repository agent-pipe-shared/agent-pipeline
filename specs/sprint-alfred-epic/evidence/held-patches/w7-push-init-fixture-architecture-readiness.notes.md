# push-init fixture: architecture entry readiness (STOPPED, wrong premise, no patch)

Dispatch W7-PUSH-INIT-FIXTURE-ARCHITECTURE-READINESS-C1-20261027, candidate 4df94469b35b11e07356a0f9798f8f3b4d8364bb. Model output; the raw log was written by the driver (untracked, `scratch/agent-out/w7pi/red.log`, deleted clones). Outcome: STOP (stop condition "the recon note contradicts the code you find"). No patch was produced; no repository file other than these notes changed.

## RED (clone at the candidate, unchanged)

Command: `node scratch/agent-out/w7pi/driver.mjs run red plugins/pipeline-core/scripts/push-init.test.mjs` (driver runs `node --test <file>` via spawnSync in the shared clone). Counts: tests 32, pass 23, fail 9. The 9 failing names match the recon list exactly:

1. chains all three steps (reconciliation, gate-satisfiability, push-prepare) in one call, reaches signature-required
2. signature preparation keeps the existing signature-required output
3. reconciliation accepts WSL EPERM only after status zero, while non-zero and status-less results stop fail-closed
4. layer 1b is skipped, not failed, when the project has no harness/scripts/check-doc-reconciliation.mjs
5. the signature-required outcome never carries a driver-executable action, for the real authorize-critical command
6. dirty working tree stops at push-prepare's own check, named, even though gate-satisfiability does not check it
7. stale verify evidence is reported by the cheap preflight while push-prepare still collects its independent checks
8. an onboarding-set machine-plane anchor resolves the key directory without disclosing it in the signature instructions
9. real repo -- an explicit candidate distinct from the record-ref lets layer 1b actually pass (NVA-B-PUSHINIT-1 regression)

## Contradiction with the recon note (the reason for the stop)

The recon claims the 9 reds are caused by the architecture entry readiness gate and quotes the first output line `Error: set-phase implementation refused (ARCHITECTURE-MAP-MISSING)`. Re-verified: that line IS the first line of the log, but it is the stderr of a PASSING test. The first test ("baseline-only implementation publishes configure-verify...", push-init.test.mjs lines 394-398) deliberately runs `set-phase --phase implementation` on a fixture without architecture evidence and asserts status 2 ("must fail closed"); the same test then builds the real lifecycle fixture (`provisionApprovedImplementationFixture`, which already reaches `set-phase implementation` through the real producers) and injects `architectureEntryReadiness`. That test is GREEN. None of the 9 reds calls `set-phase`; they call `drivePushInit` with injected push-prepare deps.

Actual first failure per name, read from the log:

- Names 1, 2, 3 (cases), 5, 8 (and 4 per the same shape, sets read: outcome `precondition-unmet` instead of `signature-required`): the single failed check is `critic-bound-verify`, message `candidate qualification unavailable (CBV-ROOT)`. Source: `plugins/pipeline-core/scripts/push-prepare.mjs` lines 745-755: when `requiresPublicationReview(state)` is true, it calls `deps.checkCriticBoundVerify ?? checkCurrentCriticBoundVerify`, which fails with CBV-ROOT in a fixture root without a Critic/Verify binding. The fixtures' `prepareDepsAllGreen()` does not override `checkCriticBoundVerify` or `requiresPublicationReview`.
- Name 7: checks are `[verify-evidence-bound, critic-bound-verify]` where the test expects only the first (same CBV-ROOT check is the extra id).
- Name 6: `2 !== 1` at test line 691 (exit status, push-init CLI/driver path); the same gate is the likely cause (not separately confirmed).
- Name 9 (real repo): `doc-reconciliation` step exitCode 2, not 0, with fixed refs `56e91858...` / `86810466...` against this clone's checkout; a different cause (reconciliation of those refs in a shared clone), unrelated to architecture and to CBV-ROOT. Not investigated further.

So at least two distinct causes, neither of them the architecture entry readiness gate. The briefing says: if the 9 names do not show the architecture gate as the cause, stop and report. Following it.

## Not done

- No patch, no apply check (nothing to apply), no GREEN run, no clone2 comparison. Clones removed.
- Exactly what a fix would need (for the next briefing, parent decision): in `prepareDepsAllGreen()` (and the deps of the cases that build their own prepare deps) inject the existing seam `checkCriticBoundVerify: () => ({ ok: true })` and/or `requiresPublicationReview: () => false` (both are `deps.*` seams in push-prepare.mjs lines 745-747), keeping every assertion; plus a separate diagnosis for name 6 and name 9. That is a different mechanism from the one briefed (architecture readiness neutralisation), so it needs a fresh briefing; I did not apply it.

## Proposed commit message

Not applicable (no change). For a later correct slice: "test(pipeline-core): let the push-init fixture pass the publication review gate".

## Gates

Independent Critic review, Full Verify and PO acceptance stay parent-owned and pending.
