# W7 D47 onboarding evidence line-ending attributes, third attempt (VERIFIED: no regression versus baseline)

Slice W7-D47-GITATTRIBUTES-ONBOARDING-C3-C1-20261027, candidate 8c4aa7d1802bf425daa37e5c7dae61a6d89f126b.
Targeted delivery: green (see limits below). Batch Critic review and PO acceptance stay parent-owned and pending.

## Cause
Onboarding seeds no .gitattributes, so digest-bound evidence bytes change under core.autocrlf=true.

## Exact changes (patch w7-d47-gitattributes-onboarding-c3.patch, git diff --binary vs candidate, 2 files, 221 insertions, 11 deletions)
The committed c2 patch applied unchanged at the new candidate (git apply exit 0); no repair was needed, so c3 equals c2 rebased.
- lib/project-onboarding-v3.mjs (67 lines): PROJECT_ATTRIBUTES_SEED ("specs/**/evidence/** text eol=lf", "evidence/** text eol=lf"); a fresh root gets a .gitattributes target (kind project-attributes); an existing .gitattributes is never rewritten; missing lines yield a mutation:false ask projectAttributesGapAction (input projectAttributesGapAcknowledged) naming the exact missing lines; apply and pendingAsks carry it.
- lib/project-onboarding-v3.test.mjs (165 lines): EXPECTED_CASE_COUNT 216 -> 228 (closed partition 6 shards x 2 chunks x 18, so a multiple of 12); cases D47-GA-1..12; three fresh-root plan-target lists gain ".gitattributes" before ".gitignore" (deliberate behaviour change of the plan, no assertion weakened).

## Verification (whole file plugins/pipeline-core/lib/project-onboarding-v3.test.mjs, run via node, logs under scratch/agent-out/w7uu)
- Patched clone: "project-onboarding-v3: 228 cases across 2 sequential chunks of 6 shards, 5 shards failed"; five named FAIL cases, none of them D47.
- Baseline clone2 (candidate, unpatched): the same five named FAIL cases.
- Failing-name sets are IDENTICAL, baseline and patched (pre-existing, not caused by the patch, each failing in both runs, so NVA-R40-PROJDRIFT and the codex configure-verify case are baseline, not new):
  1. the seeded push gate refuses an unapproved push and admits it after the shipped commands (private-critic-binding-unavailable)
  2. NVA-R40-PROJDRIFT: set-phase --phase implementation does not itself cause projection-drift ...
  3. the seeded security gate ... (SECGATE-1) (private-critic-binding-unavailable)
  4. public onboarding handover ... configured verify codex (configure verify: 2 !== 0)
  5. public onboarding handover ... configured verify antigravity (configure verify: 2 !== 0)
- D47-GA-1..12 therefore pass in the patched run (228 declared, only the five baseline names failed). The reporter prints no per-case pass lines by name, so this is inferred from the absence of any D47 FAIL, not from a named pass line.
- RED run against baseline was not repeated (briefed as not required; attempt 1 proved the count pin).
- Apply check: git apply --check of the c3 patch in clone2 at the candidate: exit 0.

## NOT done
Writer for existing repositories (needs a guard-catalogue route, native-host-only); a preflight readback line; a real Windows run without core.autocrlf=input. The five baseline failures are not investigated here.

## Proposed commit message
feat(onboarding): seed evidence line-ending attributes and disclose the gap in an existing repository

## Operator flow
apply-diff the patch, git add -u with a path limit, --no-verify commit, stamp, install.
Protected-path classification: neither plugins/pipeline-core/lib/project-onboarding-v3.mjs nor its .test.mjs matches TP-1..TP-13.

## Open
Independent Critic review remains a parent-owned batch gate.
