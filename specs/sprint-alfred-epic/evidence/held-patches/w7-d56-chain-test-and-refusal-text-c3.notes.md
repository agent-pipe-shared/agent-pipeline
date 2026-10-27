# Held patch notes: D56 chain test and refusal text (c3, STATE: green)

Patch: `w7-d56-chain-test-and-refusal-text-c3.patch` (git diff --binary of the scratch clone against the local baseline commit of the round-2 bundle state; 4 files, 14240 bytes). It contains everything the c2 patch holds plus the CPPA-4 fix, so it replaces c2. Apply the round-2 bundle first, then this patch. Never apply c2 and c3 together.

## State

- Clone HEAD stayed at the baseline commit made on f5be5c034; `git checkout --detach d327f525f` was refused (local changes). `git diff --stat f5be5c034 d327f525f -- plugins` is empty, so the plugins tree equals the briefing candidate. The apply check ran in clone2 at that same tree.
- Refusal-text sentence in critic-packet-preflight.mjs, hint fix in check-critic-skip-coverage.mjs, cases CPPA-4, CPPA-5, CSC-A8, CPP09 pinned counts: unchanged from c2.

## CPPA-4 fix (only change since c2)

Cause: the untrailered half asserted that `dispatch-record-write.mjs --repo-root . --attested-request` is absent. The corrected generic hint in check-critic-skip-coverage.mjs now names that CLI for every zero-target refusal, so the assertion contradicted the deliberate new behaviour. Change: new constant `trailerSentence = /The range carries a Goldfish Dispatch trailer: the Elephant can reconstruct the missing record with/u` (the exact sentence added by critic-packet-preflight.mjs). Trailered half: kept `producerRoute` match and added a match for `trailerSentence`. Untrailered half: `doesNotMatch(trailerSentence)` instead of `doesNotMatch(producerRoute)`. Nothing deleted or weakened: the trailered half is strictly stronger, the untrailered half now tests what the case is about (the preflight adds the trailer-specific sentence only when a Goldfish Dispatch trailer exists).

## Results (machine-written logs under scratch/agent-out/w7qz/: green4.*.log patched, base4.*.log baseline; all exit 0)

| file | patched (clone) | baseline (clone2, bundle only) |
|---|---|---|
| critic-packet-preflight.test.mjs | tests 17 pass 17 fail 0 | tests 15 pass 15 fail 0 |
| check-critic-skip-coverage.test.mjs | tests 48 pass 48 fail 0 | tests 47 pass 47 fail 0 |
| dispatch-record-write.test.mjs | tests 31 pass 31 fail 0 | tests 31 pass 31 fail 0 |

Failing-name sets: empty in both; no pre-existing failure. CPP09 is green in the patched run (the whole preflight file is 17 of 17; the earlier "16 of 17" expectation referred to CPP09's internal injected-failure probe count, which the c2 pins already set). New cases CPP16 (CPPA-4), CPP17 (CPPA-5) and CSC-A8 are present only in the patched run. RED for CSC-A8 (47 of 48) was recorded in c2; CPPA-4 untrailered half was RED (15 of 17) in c2 before this fix.

Old-wording pins updated in c2 and carried (justified there): D176 `/PO decision/` -> `/attested-request/`; CSC-A6 `/writeOrchestratorAttestedDispatchRecord/` -> `/--attested-request/`.

Apply check: `git apply --check` of this patch in clone2 (bundle applied, baseline) exits 0.

## Reference sweep

Searched templates/prompts/critic-review.md and plugins/pipeline-core/skills (including references) for CPP-REVIEW-ADMISSION, writeOrchestratorAttestedDispatchRecord and "write a dispatch record": no stale place. NOT swept: docs/, harness/, the rest of plugins/.

## NOT done

Independent Critic review (parent-owned batch gate), Full Verify and PO acceptance remain pending. The clones were moved to the candidate only in the sense of tree equality, not by checkout.

Proposed commit message: `feat(critic): prove the attested dispatch-record route end to end and name the record producer in the admission refusal`

Operator flow: apply the round-2 bundle, then this patch (apply-diff); `git add -u` with a path limit; `--no-verify` commit; stamp; install. Toolbox usage: write the hand-back to scratch/, write the request, run `dispatch-record-write.mjs --repo-root . --attested-request <request.json>`, commit the record, rerun admit. Protected-path classification: none of the changed files matches TP-1..TP-13.
