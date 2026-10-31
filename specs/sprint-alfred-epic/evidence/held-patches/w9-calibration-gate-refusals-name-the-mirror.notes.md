# W9 slice 7 (Toolbox N42): the refusal of either calibration mirror names the other mirror

Built by the Elephant (PO exception: small items are built in a scratch clone and held as a patch). Candidate d9b4ae1a9. PO decision (2026-10-31, tile): a warning in the first refusal/plan naming the mirror; NOT a joint plan for both files (that changes the security-critical signature binding and needs its own design and Critic round, after Candidate 15).

## The finding
`project/pipeline.json` (GS-10) and `.claude/pipeline.json` (GS-11) must stay byte-equal (`PCI-CALIBRATION-DRIFT`), and each protected file needs its own PO-approved override. The first refusal said nothing about the mirror, so the second signature was discovered only when Verify went red.

## The change (one production file, kernel/protected path: the PO applies it)
`plugins/pipeline-core/hooks/guard-gate-strength.mjs`: the `reason` text of GS-10 and GS-11 now names the other file and its rule id, says that a change to one needs the same change in the other under its own PO-approved override, and names `PCI-CALIBRATION-DRIFT`. The rule ids, paths and the rest of the refusal (Rule ID, File, Why, the override plan and prepare-for-signature lines) are unchanged. GS-12 (the root manifest) keeps its text.

## Evidence (logs in the scratch directory of this slice)
- Red first: GST39 red against the unmodified guard (`red.*`): the refusal of `project/pipeline.json` does not name `.claude/pipeline.json`.
- Green: the guard suite 42/42 (41 existing plus GST39, `g1.*`); `pre-commit-hook-install` 61/61, `guard-gate-strength-origin-attestation` 7/7 and `guard-split-contract` 5/5, identical in clone and baseline (`c1` vs `base1`).
- Revert proof: with the guard reverted only GST39 is red (41 passed, 1 failed, `revert.*`), restored byte-equal.
- Callers of the reason text: only the refusal renderer; the only tests that read the GS-10/GS-11 refusal assert the prefix `GS-10 project/pipeline.json` and `GS-11 .claude/pipeline.json` (pre-commit-hook-install), unchanged and green.
- The patch applies on the candidate (apply-check exit 0).

## Not verified
Native Windows run, a live override ceremony with both mirrors, Full Verify, batch Critic, PO acceptance. The joint plan for both mirrors is deliberately not built.
