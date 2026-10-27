# W7 fixture repair d: finish the submit-plan architecture fixture repair (design-course-command-admission, design-approval-route.e2e)

Patch: `w7-fixture-submit-plan-architecture-d.patch` (git diff --binary against a local "stack base" commit). Apply order: `scratch/agent-out/compose/bundle.patch`, then `w7-fixture-submit-plan-architecture-b.patch`, then `-c.patch`, then this patch. This patch edits the e2e file again and replaces the e2e part of patch c (the shape-(b) call is kept; this adds the missing commit). `git apply --check` of this patch in a clone with bundle, b and c applied: exit 0.

## Cause
- design-course-command-admission: the in-process `fixture()` (also imported by design-course-run-v2) runs the real submit-plan without an `architectureEntryReadiness` dep, so D165-S4 refuses with ARCHITECTURE-MAP-MISSING.
- design-approval-route.e2e: `materializeArchitectureDesignFixture` (patch c) writes architecture and policy files into the fixture root but leaves them uncommitted, so the approval source was unavailable (CAC-SOURCE-UNAVAILABLE) at approve-plan. Committing the helper output inside the fixture fixed it, including DABC001 (no change outside the two files was needed).

## Changed lines (tests only; no assertion changed, no case added)
- `plugins/pipeline-core/hooks/design-course-command-admission.test.mjs`, fixture deps: after `runner: 'codex'` added `architectureEntryReadiness: () => ({ status: 'ready', code: null, nextAction: null })` (same stub as D165-S4 planAuthorityFixture). +2/-1 lines.
- `plugins/pipeline-core/scripts/design-approval-route.e2e.test.mjs`, `buildSubmittedFeature`: right after the `materializeArchitectureDesignFixture(...)` call added `git(dir, "add", "-A");` and `git(dir, "commit", "-q", "-m", "fixture: architecture design package");` (inside the fixture repo only). +2 lines.

## RED (clone, stack base; logs in scratch/agent-out/w7fd/red.*.log)
- design-course-command-admission: 0 of 17 (K3G001-K3G017, ARCHITECTURE-MAP-MISSING at fixture line 70).
- design-approval-route.e2e: failing DABC001, DABR002, DABR003, DABR004 (10 of 14).
- design-course-run-v2: failing A6 (nested DABR004) (8 of 10 per briefing).

## GREEN (clone, stack + this patch; logs green.*.log)
- design-course-command-admission: tests 17, pass 17, fail 0 (exit 0).
- design-approval-route.e2e: tests 14, pass 14, fail 0 (exit 0).
- design-course-run-v2 pin (verification only): tests 10, pass 10, fail 0 (exit 0), as reported in the dispatch return (corrected by the Elephant; the Goldfish ran out of budget before updating this line).

## Baseline (clone2, clean candidate e3110a64b; logs base.*.log)
- admission 17 of 17 (exit 0), e2e 14 of 14 (exit 0), run-v2 exit 0. Failing-name set empty on baseline; empty on stack + patch for admission and e2e. Stack-before-patch failing names: all 17 K3G for admission; DABC001, DABR002-004 for the e2e.

## Not done
- Cleanup of the scratch clones under `scratch/agent-out/w7fd/` is the last driver step (`driver.mjs cleanup`); see return report for whether it ran.
- Independent Critic review stays a parent-owned batch gate; Full Verify and PO acceptance pending.

## Proposed commit message
test(fixtures): finish the submit-plan architecture fixture repair for design-course-command-admission and design-approval-route.e2e (repair d)

## Operator flow
apply-diff (bundle, b, c, then d), `git add -u` with a path limit, `--no-verify` commit, stamp, install.
