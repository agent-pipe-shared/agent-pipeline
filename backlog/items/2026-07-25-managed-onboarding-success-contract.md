---
schema: pipeline.backlog-item.v1
id: pipeline.managed-onboarding-success-contract
type: workflow-improvement
owner: pipeline
status: open
created: 2026-07-25
source: "close-block self-retro, 0.4.4 managed-workspace onboarding hotfix"
---

# Host-managed onboarding tests need an explicit success contract

## Description

The prior regression for a fresh Codex host-managed root asserted that the
initializer rejected the layout. That made the test green while first-use
onboarding was unusable. The 0.4.4 repair replaces it with an end-to-end
success contract, but future host-layout additions need the same review lens.

## Triggering situation

The 2026-07-25 0.4.4 hotfix reproduced a writable empty root whose host owns
read-only `.git`/`.codex` controls and found that the previous dedicated test
preserved the rejection rather than the intended setup flow.

## Affected artifact

`plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`,
`plugins/pipeline-core/scripts/project-onboarding-e2e.test.mjs`, and the
onboarding acceptance guidance.

## Proposal

For every supported host-owned layout, require a disposable-root test that
asserts the public inspect/plan/apply/readback transaction, exact allowed
write set, and preservation of all host controls. A rejection-only test is
valid solely for an explicitly unsupported layout.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, still open — deferred to Sprint Alfred. This is a
  standing review-lens rule for future host-layout additions, not a live
  defect against any layout supported today; "mechanical governance,
  measurable rigor" (Alfred's scope) fits a rule like this better than
  urgent current-scope work.
- **Rationale:** no current host-layout gap is claimed by the item itself;
  it is a process rule for the next one.
- **Assignment (if accepted):** next available Alfred slot — likely lands as
  a `guardrails/quality-gates.md` entry or an onboarding-acceptance-checklist
  addition rather than code.
- **Date:** 2026-08-17
