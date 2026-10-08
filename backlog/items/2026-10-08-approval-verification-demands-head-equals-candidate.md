---
schema: pipeline.backlog-item.v1
id: pipeline.approval-verification-demands-head-equals-candidate
type: defect
owner: pipeline
status: open
created: 2026-10-08
source: "Haupt-PC session 2026-10-08 late, installed candidate 0.7.0+claude.20261008194106.da20519d: after restoring the device-local approval files, onboarding inspect still demanded reopen-design with DWP-READINESS-HOST-RECEIPT-INVALID; a PO-run step-by-step diagnosis (scratch/diag-readiness.mjs) located the throw."
sprint: alfred
done_when: manual
---

# Implementation-boundary approval verification demands HEAD == the approved candidate

## Description

`verifyFinalDesignWorkflowApproval` (`plugins/pipeline-core/lib/architecture-design.mjs`) reads the approved package
with `requireCurrentCandidate: false`, because HEAD is expected to move during implementation. For an
`advisor.status: "unavailable"` v2 package, the readiness host verifier (`verifyDesignReadinessHostExecution`,
`design-readiness-host-evidence.mjs`) re-reads the supplemental Advisor observation through
`rereadReadinessAdvisorContextV2` → `verifyReadinessAdvisorObservationV2` (`design-workflow-package-v2.mjs`), which
re-enters `readDesignWorkflowPackageV2FromRepository` without the flag. The default is `true`, so the inline read throws
`DWP2-CURRENT-CANDIDATE` as soon as HEAD differs from the approved candidate, surfacing as
`DWP-READINESS-HOST-RECEIPT-INVALID`. Every such approval becomes unverifiable after the first commit past its
candidate; the dev-plan guard then refuses every implementation write and every `node` execution, and `inspect` offers
only `reopen-design` — whose new approval would lock again at the next commit.

## Triggering situation

2026-10-08 late: measured with the real verifier against the installed plugin (red) and against a copy patched as below
(green, `DWP2-UNAVAILABLE-INITIAL-FINAL-VERIFIED`). Why the other PC was not hit since 2026-10-07 is unexplained (the
code is identical since IC-2c); it does not change the defect.

## Affected artifact

`plugins/pipeline-core/lib/design-workflow-package-v2.mjs` (`verifyReadinessAdvisorObservationV2`,
`readUnavailablePackage`, both `verifyReadinessExecution` call sites), `design-readiness-host-evidence.mjs`
(`verifyDesignReadinessHostExecution`), `readiness-advisor-context-v2.mjs`.

## Proposal

Forward the caller's `requireCurrentCandidate` through all three functions; the default stays strict (`true`) for
preparation, presentation and approval. Pins first (QG-04): one case per entry point proving (a) the implementation
boundary verifies with HEAD past the candidate and (b) presentation/approval still refuse a moved HEAD. The PO hotfix
`scratch/hotfix-candidate-binding.ps1` (9 anchors in 3 files) is the reference diff; the source fix must replace it and
the next stamp must carry it.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted — candidate blocker (PO decision BI).
- **Rationale:** blocks all work after any commit; reproduced; minimal fix known.
- **Assignment (if accepted):** sprint-alfred wave 1, pins + fix dispatch.
- **Date:** 2026-10-08
