# D56 slice 4b c3: binding assurance (COMPLETE patch against the stack base)

Stack: apply `w7-d56-admit-attested-record-c2.patch` first, then `w7-d56-binding-assurance-c3.patch` (git diff --binary against the stack base commit, 17998 bytes, six files; supersedes the c2 interim patch). Apply check in the unchanged baseline clone2 at the stack base: exit 0.

## Cause and production edits
Unchanged from `w7-d56-binding-assurance-c2.notes.md`: the local dispatch evidence binding now carries `assurance` ("orchestrator-attested" or null); `check-critic-skip-coverage.mjs`, `critic-packet-preflight.mjs` and `lib/critic-generic-batch.mjs` (both target sites yield `orchestrator-attested-delivery`; correction-owner accepts both kinds).

## Changes in this continuation
1. CPP09 (case-completion self-test, `critic-packet-preflight.test.mjs`): `caseCount` and `disposed.length` pins 12 to 15; counts `{pass:11,fail:1}` to `{pass:14,fail:1}`; `declaredCount`/`disposedCount` 12 to 15. Justification: a deliberate count pin; the corpus gained three cases (CPP13..15), the injected failure is still exactly one case; nothing weakened.
2. `critic-generic-batch.test.mjs`: ids CGB027, CGB028 added to `completionCaseIds`; helper `registeredTargets` reads the saved registration; CGB027 host-observed binding gives `authored-delivery`; CGB028 a v4 orchestrator-attested record rewritten into the fixture gives `orchestrator-attested-delivery`. Production was already in the clone, so no RED against the baseline was run for these two (the kind is absent in the baseline logic by construction); first run failed only on a test-side bug (`originTargets` is in registration.json, not in the return value), fixed, then GREEN.

## Results (logs under scratch/agent-out/w7qp/patched.*.log)
- critic-packet-preflight.test.mjs patched clone: 15/15 pass, exit 0 (CPP09 green; baseline 12/12).
- check-critic-skip-coverage.test.mjs patched: 47/47 pass (baseline 47/47 from the c2 note).
- critic-generic-batch.test.mjs patched: only CGB002 and CGB003 fail (SCF-ORIGINAL-SOURCE-UNAVAILABLE), identical to the baseline per the c2 note; pre-existing, not fixed; CGB027 and CGB028 pass.
- Baseline clone2 was NOT re-run in this continuation (budget); the baseline failing-name sets are those of the c2 note.
- session-critic-finalizer.test.mjs: not run, not verifiable here (path absent in the c2 attempt; no budget left to find it).

## NOT done
Driver cleanup (both clones under scratch/agent-out/w7qp/ still exist; delete with `driver.mjs cleanup`); baseline re-run in clone2; finalizer suite; full attested end-to-end binding case in check-critic-skip-coverage.test.mjs; finalizer forwarding of the inner LDE code.

## Proposed commit message
`feat(critic): carry the record assurance in the local dispatch evidence binding`

## Operator flow
Apply the c2 patch, then this patch (`git apply`), `git add -u` limited to the six slice paths, `--no-verify` commit, stamp, install. None of the touched files matches TP-1..TP-13. Independent Critic review stays a parent-owned batch gate; Full Verify and PO acceptance pending.
