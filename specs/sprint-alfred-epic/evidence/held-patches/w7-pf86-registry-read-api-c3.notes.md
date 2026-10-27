# PF-86 c3 held patch: lock-free registry read path (INTERIM, budget-stopped, NOT verified green)

Status: PARTIAL. Patch written (`w7-pf86-registry-read-api-c3.patch`, 20344 bytes, 3 files, +104/-5) as `git diff --binary` against a local "stack base" commit (candidate 87b05c9d3 + `w7-pf86-scan-outside-registry-lock.patch`). Apply check in clone2 (`driver check`) was NOT run; the whole-file GREEN run in the clone was started but its result was not read; clone2 baseline whole-file run was not done; NGHS50 (formerly NGHS46) was NOT diagnosed.

## New finding (re-verified against the clone, supersedes the interim notes)
The stack base itself cannot run its test file: the PF-86 c1 patch adds cases with ids NGHS41, NGHS42, NGHS43 that duplicate the candidate's existing NGHS41-43 (DR2-DR4, lines ~1204-1233). `registerTestCaseCompletion` throws `TCC-CASE-DUPLICATE` ("completion case ids must be unique") before any case runs, so the interim "NGHS41 red, identical in baseline" claim was a stale artifact of an older candidate. Evidence: RED run log (scratch/agent-out/w7qs/red.native-goldfish-host-state.test.mjs.log tail) shows the exception at the registration line.

## Change made in the clone (test file only so far)
- Renumbered c1's three cases NGHS41/42/43 -> NGHS45/46/47 (justification: ids must be unique; names and bodies untouched, no case weakened).
- Renumbered this slice's four cases (interim NGHS44-47) -> NGHS48-51 (NGHS48 facts equal, NGHS49 drift never adopted, NGHS50 slow scan does not hold the lock, NGHS51 export/arity guard).
- Production edits (registry `readSessionAuthorityGeneration` / `withSessionAuthorityReadScope`, host-state `prescanAdmissionFacts` / `adoptAdmissionFacts` wiring) are those of the interim patch, applied cleanly (apply without 3-way; the 3-way blob was missing but direct apply succeeded). Not re-reviewed.

## Results
- RED (unchanged state, whole file): fails at registration (duplicate ids), so no per-case RED was observable; the new cases were never RED individually in this attempt.
- GREEN: not read. Log would be scratch/agent-out/w7qs/green.native-goldfish-host-state.test.mjs.log (run may have completed after hand-off).
- NGHS50 (child spawned from inside slow scan must enter the lock): still undiagnosed; test already passes `child.stderr` as the assertion message, so the printed failure of the green log names the cause.

## NOT done
Diagnosis/fix of NGHS50; baseline vs patched failing-name sets; focused suites importing session-authority-registry.mjs; apply check; clone cleanup (clones in scratch/agent-out/w7qs/clone and clone2 remain; `node scratch/agent-out/w7qs/driver.mjs cleanup`). The c1 duplicate-id problem means the c1 held patch itself must carry the renumbering (or the operator applies it from this patch). Pending inventory scan and reserved-item-scope read still run in the lock; generation covers the registry catalogue, not native pending files; the read token is read-only by contract only (Critic risk).

## Proposed commit
`perf(dispatch): read admission facts through a lock-free registry path and publish by generation compare (PF-86)`

## Operator flow
Apply PF-86 c1, then this patch (`git apply`), `git add -u` limited to the three lib files, `--no-verify` commit, stamp, install. Protected-path class: registry and host-state are core registry area (Critic batch gate); test file matched no TP pattern. Independent Critic review stays a parent-owned batch gate.

CONTINUATION CARD -- done: stack clones, interim patch applied, duplicate-id root cause found and fixed in test, patch written; remaining: read green log, diagnose NGHS50 from child stderr, baseline clone2 whole-file run (after renumbering c1 ids there too or compare registration only), driver patch rewrite, driver check, cleanup; next step: read scratch/agent-out/w7qs/green.native-goldfish-host-state.test.mjs.log.
