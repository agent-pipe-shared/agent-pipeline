# W9: the onboarding suite registers every case it declares

Built by the Elephant (PO exception: small items in a scratch clone, held as a patch). Candidate 65e0a0984. Protected file (`harness/scripts/verify.mjs`), so the PO's apply script carries it.

## Root cause
`project-onboarding-v3-tests` declares 240 case ids when it runs under Verify, but only 216 were registered in `caseIds`. The registration was written at the 0.7 integration commit; the cases added afterwards (R3, R4, G15c2, D214-C) were never added to the list. Verify therefore failed the suite with VERIFY-CASE-COMPLETION-DECLARATION even though every case passed. Registered is a strict subset of declared: no id was renamed or dropped.

## What changed
One line in `harness/scripts/verify.mjs`: the `caseIds` of that suite are now the sorted union of the registered ids and the 24 declared-but-unregistered ids (`POV-0530b726e628942c` and 23 more; list in the patch). Generated with a one-off helper from the suite's own captured completion stream, not typed by hand.

## Evidence
- Captured the suite's real completion stream (descriptor 3, private TMPDIR) in a fresh clone at the candidate: 242 records, 240 declared ids; identical to the stream captured in the earlier Full Verify clone (same byte count), so the ids hold at this HEAD.
- Declared vs registered before: 24 declared-not-registered, 0 registered-not-declared. After: 0 and 0 (`completion-diff`).
- `harness/scripts/check-verify-case-completion.mjs` valid (388 entries); `check-verify-case-completion.test.mjs` 32/32 and `self-verify-selection.test.mjs` 28/28 green in the clone.
- Patch applies on the candidate (`git apply --check`, exit 0).

## Not verified / dependent
- In this clone one case (SECGATE-2) still fails because the Round-4 fix patch is not stacked here; that is a separate, already-built patch. The registration question is independent of it, but the suite is only fully green once both are applied: fv9 on the assembled candidate is the real proof.
- Native Windows run, batch Critic, PO acceptance.
- Process gap (backlog candidate): nothing stops a later test addition from leaving the registration behind; the registered list is hand-maintained. A drift check that runs the suite under the case-completion descriptor in the push/verify path is what caught it.
