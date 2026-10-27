# Held patch notes: D56 chain test and refusal text (c2, STATE: BLOCKED on one case)

Patch: `w7-d56-chain-test-and-refusal-text-c2.patch` (git diff --binary of the scratch clone against the local baseline commit of the round-2 bundle state; 4 files). Apply the round-2 bundle first, then this patch. Clone base was f5be5c034 (evidence-only commits to 6199b1eeb do not touch plugins/); the apply check against the exact 6199b1eeb candidate was not re-run.

## State

- Partial refusal-text sentence and cases CPPA-4 / CPPA-5 in critic-packet-preflight.test.mjs carried over; CPP09 pinned counts: caseCount/disposed 15 -> 17 and pass 14 -> 16 (17 cases, one injected failure; the earlier unverified 14 was wrong: the whole-file run showed actual pass 16).
- New RED case CSC-A8 (check-critic-skip-coverage.test.mjs): RED 47/48 pass before the change; GREEN 48/48 after.
- Hint fix in check-critic-skip-coverage.mjs (~line 918): now names `node plugins/pipeline-core/scripts/dispatch-record-write.mjs --repo-root . --attested-request <request.json>`, no longer says a no-history range needs a PO decision, no longer names writeOrchestratorAttestedDispatchRecord.
- Existing pins updated with justification (they pinned the exact text this slice deliberately changes): D176 case `/PO decision/` -> `/attested-request/`; CSC-A6 `/writeOrchestratorAttestedDispatchRecord/` -> `/--attested-request/`. No case weakened beyond the replaced wording, none skipped or deleted.
- dispatch-record-write.test.mjs: 31/31 pass (no change in this patch).

## BLOCKED: preflight whole file 15/17

Patched clone: critic-packet-preflight.test.mjs fails CPPA-4 (CPP16) and, as a consequence, CPP09 (its subprocess probe counts the CPPA-4 failure, pass 15 instead of 16). Cause: CPPA-4 asserts that a range WITHOUT a Dispatch trailer does not contain the producer route regex; the generic hint in check-critic-skip-coverage.mjs now names the CLI unconditionally, so the untrailered refusal matches too. Resolution options for the next dispatch (a judgement call, not taken here): change the untrailered half of CPPA-4 to assert the absence of the preflight-specific trailer sentence (written in critic-packet-preflight.mjs, the partial patch) rather than the CLI string; CPP09 then returns to 16. Baseline (clone2, bundle only): the preflight file was not run as a baseline in this pass; the earlier logs `base.*.log` are untracked scratch.

## RED / GREEN ids and counts

- preflight whole file (clone, patched): tests 17, pass 15, fail 2 (CPP09, CPP16/CPPA-4).
- check-critic-skip-coverage: RED tests 48 pass 47 fail 1 (CSC-A8); GREEN tests 48 pass 48 fail 0.
- dispatch-record-write: tests 31 pass 31 fail 0.
- Baseline vs patched failing-name set comparison in clone2: NOT done (budget).

## Reference sweep

Searched templates/prompts/critic-review.md and plugins/pipeline-core/skills (incl. references) for CPP-REVIEW-ADMISSION, writeOrchestratorAttestedDispatchRecord and "write a dispatch record": no stale place found. Not swept: docs/, harness/, other plugin dirs (the final rg was refused by the shell grammar for flag -ln).

## NOT done

- Fix of CPPA-4 (above); baseline failing-name comparison; apply check in clone2 of the final patch; driver cleanup (clones remain under scratch/agent-out/w7qz/). Independent Critic review stays a parent-owned batch gate; Full Verify and PO acceptance pending.

Proposed commit message (only once CPPA-4 is green): `feat(critic): prove the attested dispatch-record route end to end and name the record producer in the admission refusal`

Operator flow: apply the round-2 bundle, then this patch; `git add -u` with a path limit; `--no-verify` commit; stamp; install. Toolbox usage: write the hand-back to scratch/, write the request, run the command, commit the record, rerun admit. Protected-path classification: none of the five files matches TP-1..TP-13.
