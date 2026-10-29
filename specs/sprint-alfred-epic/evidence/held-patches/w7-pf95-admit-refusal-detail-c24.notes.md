# PF-95 follow-up, slice c24: the operator output of a refused admit names the takeover verbs (held patch, no stacking)

Candidate 9c31c6f4c. The patch (`w7-pf95-admit-refusal-detail-c24.patch`) applies on the candidate without any other held patch.

## Cause (re-verified)

`describeCliError` in `session-critic-finalizer.mjs` keeps the first line of an error message and caps it at 200 characters. The `CGB-CONFLICT` details of `critic-generic-batch.mjs` (the constant `TAKEOVER_DETAIL` and the delivery target detail in `reserveFeatureCriticReviewUnitOwnership`) put the verbs `inspect-course-takeover` and `supersede-course-takeover` after long prose, so a refused `admit` printed a cut-off line without the verbs.

## Changed lines

- `plugins/pipeline-core/lib/critic-generic-batch.mjs`: both details get the same verb-first lead sentence in front of the unchanged text (137 characters: `Retire the old batch with the session-critic-finalizer verbs inspect-course-takeover then supersede-course-takeover (nothing is deleted).`). The cap and `describeCliError` are not changed; no schema, code or behaviour changes.
- `plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs`: `describeCliError` added to the import; new case `PF95 admit refusal (1) the CLI detail of a CGB-CONFLICT from an old batch names both takeover verbs` (library error from the real feature-course ownership refusal of the takeover fixture, then `describeCliError`: both verbs present, no line break, no absolute path, at most 220 characters).

## Results (measured by the Elephant on a fresh clone of the candidate)

- RED before the production edit (Goldfish log, read by the Elephant): the new case fails alone, 1 test, 0 pass, 1 fail.
- session-critic-finalizer with the patch: 88 tests, 87 pass, 1 fail; the only failing case is the known pre-existing `private task snapshot binds uppercase delivered-v3 bytes without exporting record prose` (86 of 87 on the unpatched baseline, identical name). The new case passes.
- critic-generic-batch 35/35, critic-course-admission 65/65, check-verify-case-completion 32/32 (no count pin for the extended finalizer file), unchanged baseline and patched.

## Not done

Delivery target detail: no existing fixture reaches that branch through the CLI route and none was invented; it is covered only by the shared lead sentence and stays untested by a fixture. Independent Critic review (parent-owned batch gate), Full Verify, PO acceptance.

## Proposed commit message

fix(critic): lead the old-batch conflict details with the takeover verbs so the CLI output shows them (PF-95)

## Operator flow

`git apply` the patch; `git add -u` limited to the two touched files; commit with `--no-verify`; Elephant stamps; PO refreshes the plugin copy. Protected-path classification: neither file is in TP-1 to TP-13; no ceremony.
