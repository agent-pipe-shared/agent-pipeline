# W7 D47 onboarding evidence line-ending attributes, second attempt (PARTIAL: code and cases written, NOT verified)

Slice W7-D47-GITATTRIBUTES-ONBOARDING-C2-C1-20261027, candidate b34bee8b8771f072ca28dd12f4b6e6d8c1b25429.
Targeted delivery: BLOCKED (budget ended before any run result was held). Batch Critic review and PO acceptance stay parent-owned and pending.

## Cause
Onboarding seeds no .gitattributes, so digest-bound evidence bytes change under core.autocrlf=true. Recon lines from the first attempt were re-read and held.

## Delivered (patch w7-d47-gitattributes-onboarding-c2.patch, git diff --binary vs candidate, 2 files, 221 insertions, 11 deletions; first-attempt patch applied first)
lib/project-onboarding-v3.mjs:
- PROJECT_ATTRIBUTES_SEED = "specs/**/evidence/** text eol=lf" and "evidence/** text eol=lf"; REQUIRED_PROJECT_ATTRIBUTE_LINES derived from it.
- planProjectOnboardingV3: seedsProjectAttributes (no .gitattributes entry) adds a .gitattributes target, kind "project-attributes".
- missingProjectAttributeLines / readProjectAttributesText / collectProjectAttributesGapAction (mutation:false, input projectAttributesGapAcknowledged, guidance names the exact missing lines), copied from the .gitignore siblings.
- apply attaches projectAttributesGapAction (both return lines); pendingAsks gains observed.projectAttributesGapAction; withPendingProjectAttributesGapAsk added to the composition.
lib/project-onboarding-v3.test.mjs:
- EXPECTED_CASE_COUNT 216 -> 228 (and the two message texts). Justification: the suite is a closed partition 6 shards x 2 chunks x 18 (CASES_PER_CHILD = count / 12), so the count must be a multiple of 12; the first attempt's 221 would break the partition. Seven cases were added to the five RED cases: D47-GA-6..12 (empty file, plan kind/sort, whitespace trim, ack input name, .gitignore independence, both seeds on fresh, inner-spacing exactness). None removed.
- The three plan-target lists gain ".gitattributes" before ".gitignore" (localeCompare order after AGENTS.md): the new target is a deliberate behaviour change.
- GA-2 strengthened (pre-seed only .gitattributes, assert bytes unchanged, no duplicate line, no ask) instead of the trivially true re-plan check. This is a strengthening.
- Key list near line 3279 already contained projectAttributesGapAction? NO: it contains projectIgnoreGapAction only in the cited list; not changed.

## Verification state: NOT achieved
- RED run against the unchanged code was NOT executed in this attempt (budget); the first attempt only proved the count pin.
- A whole-file run in the patched clone was started in the background (log scratch/agent-out/w7ss/patched.project-onboarding-v3.test.mjs.log) but its result was not held. No GREEN line, no baseline run in clone2, no failing-name comparison, no apply check in clone2 (driver mode check not run). Known pre-existing baseline failures from attempt 1: SECGATE-1 private-critic-binding-unavailable, the antigravity configure-verify case, chunk 0 shards 0-4.
- Possible issue to check first: test uses existsSync; confirm it is imported in the test file. Existing cases asserting the exact applied changes list or target count for fresh roots may need updates beyond the three lists.

## NOT done
Writer for existing repositories (new guard-catalogue route, native-host-only); preflight readback line; real Windows run without core.autocrlf=input; clone cleanup (clone and clone2 still exist under scratch/agent-out/w7ss).

## Proposed commit message
feat(onboarding): seed evidence line-ending attributes and disclose the gap in an existing repository

## Operator flow
apply-diff the patch, git add -u with a path limit, --no-verify commit, stamp, install. Protected paths: neither slice file matches TP-1..TP-13.

## Open
Independent Critic review remains a parent-owned batch gate.

CONTINUATION CARD -- done: patch with production code in 5 regions + 12 cases + count 228 + three lists; remaining: RED run, GREEN run, whole-file compare clone vs clone2, driver check, cleanup; next step: node scratch/agent-out/w7ss/driver.mjs run base clone2 and run patched, read tails.
