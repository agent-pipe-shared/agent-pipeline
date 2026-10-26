# D170 held patch notes: the design package folder follows the registrar rule

Candidate: `304365b68b84233e30c6f2928d3932e94e43e622`. Backlog item:
`backlog/items/2026-10-26-design-course-and-registrar-disagree-on-the-feature-directory.md`, Wanted 1.
Status: **implementation complete, verified in a fresh clone; independent Critic review and PO acceptance pending.**
Authored over dispatches W6-D170B-DESIGNFOLDER (C1-C5); the final patch is the C5 result, the
coordinator verified it and corrected one whitespace nit.

## Cause

`references/kickoff-design.md` prescribed the design package directory `specs/YYYY-MM-DD_short-topic/` (date,
underscore). The feature package registrar (`lib/feature-package-registration.mjs`, `SAFE_ID`) binds every registered
path inside `specs/<featureId>/` with a hyphen-only id, so a folder with an underscore can never be registered.
A consumer paid three signatures to rename such a folder.

## Changed lines (four files, no others)

- `skills/pipeline-start/references/kickoff-design.md` (~lines 165-170): the directory is `specs/<id>/` where `<id>` is
  the `--id` of the promotion (lowercase letters, digits, single hyphens; a date prefix only as
  `YYYY-MM-DD-short-topic`, never an underscore). The registrar reason is stated once. File names unchanged.
- `lib/onboarding-continuity.mjs`: `PROMOTION_FOLDER_SAFE_ID` (copy of the registrar `SAFE_ID`, source named in a
  comment) and `assertRegistrablePromotionFolder`, called in `buildKickoffPromotionPlan` right after its
  `promotionInput` call. The apply-time `promotionInput` call is untouched.
- `skills/pipeline-start/pipeline-start-v3.test.mjs` (lines 197-199): pins the new wording and asserts
  `YYYY-MM-DD_short-topic` no longer appears.
- `lib/onboarding-continuity.test.mjs`: six D170 cases (OBC277-OBC282) and the closed-partition pin
  `cases.length` **318 -> 324** (six new cases; no other restatement of 318 exists).

`lib/project-onboarding-v3.test.mjs` is deliberately NOT in the patch: it is a closed partition
(`EXPECTED_CASE_COUNT = 216`); the first patch (C1) added cases there and made the file throw at load.

## Refusal

Code `KICKOFF-PROMOTION-FOLDER`, thrown at plan time. Rule: `dirname(specPath)` must be exactly `specs` (flat layout,
untouched) or `specs/<one segment matching SAFE_ID>`. Message: `design package directory <dir> cannot be registered:
it must be directly under specs/ and use lowercase letters, digits and single hyphens only, because the feature
package registrar binds specs/<featureId>/.` plus ` Use specs/<hyphenated> instead.` when replacing underscores
yields a valid id.

Decision: the folder is NOT required to equal `--id`. About ten existing promote fixtures promote an id that differs
from the folder; the registrar binds the folder, so the folder rule is the minimum that prevents the observed failure.

## Evidence

RED (C4, `red.log`, unchanged production, 324 tests): OBC277 (SAFE_ID equals registrar), OBC278 (underscore),
OBC279 (uppercase), OBC280 (nested) fail; OBC281/OBC282 (not refused) pass as expected; OBC264 is the known
environmental baseline failure.

GREEN, coordinator run in a fresh clone of the candidate with the patch applied (`git apply --check` clean):

| suite | tests | pass | fail | failing names vs baseline |
|---|---|---|---|---|
| pipeline-start-v3 | 8 | 8 | 0 | none (baseline none) |
| project-onboarding-v3 | file level | | | same two push/security-gate cases, 5 of 6 shards failed (baseline identical); chunk 1 unverifiable in the clone |
| kernel-closure | 11 | 11 | 0 | none |
| onboarding-continuity | 324 | 323 | 1 | OBC264 only (baseline 318 / 317 / 1, same name); OBC277-OBC282 green |
| plan-authority-staging-guard | 11 | 10 | 1 | same as baseline |
| session-cleanup-binding | 68 | 36 | 32 | same counts as baseline |
| project-reset | 44 | 44 | 0 | none |
| argv-closure | 42 | 41 | 1 | same as baseline |

## Not fixed / limits

- Wanted 2-5 of the item stay open: Phoenix apply `planPath`, reopen-design preview, receipt rebind,
  `PO-GATE-PRD-CARDINALITY` message.
- No seam test for the apply-time non-refusal (no exported seam exists; not built).
- `project-onboarding-v3` cannot be proven in the clone (environmental red); the patch does not touch it. A native
  run after install is the real proof.
- `onboarding-continuity` is a custody path: the independent Critic review stays a parent-owned batch gate.

## Proposed commit message

`fix(onboarding): follow the registrar folder rule in the design package and refuse an unregistrable folder at promote plan (D170 D7)`

## Operator flow

`scripts/apply-diff.mjs` with this patch, path-limited `git add -u`, `git commit --no-verify -F`, then
`scripts/stamp-candidate.mjs`, marketplace update and `claude plugin update`.
