# DAPU-D: DAA-PUBLIC-UNAVAILABLE in DWP21 and the e2e driver case (2026-10-09)

Read-only diagnosis. Candidate `feat/sprint-alfred`; ruleset 0.7.0+claude.20261008194106.da20519d.

## Case 1: DWP21 (`plugins/pipeline-core/lib/design-workflow-package.test.mjs`)

- Failure reproduced alone: `node --test --test-name-pattern="DWP21" plugins/pipeline-core/lib/design-workflow-package.test.mjs` -> exit 1,
  `{"ok":false,"code":"DAA-PUBLIC-UNAVAILABLE"}` at `design-workflow-package.test.mjs:936` (the first `designAdvisoryAdmission` call).
- Which file is "missing": the public advisory record (`DESIGN_ADVISORY_RECORD_PATH`). It is NOT expected by this test at all. The
  test never writes one and is not meant to: the signed-package branch of `designAdvisoryAdmission` returns before the record is read.
- Divergence (`file:line`):
  - Fixture, `design-workflow-package.test.mjs:928` (and `:964`): `planApproval.schema = "pipeline.plan-approval.v7"`.
  - Guard, `lib/guard-devplan-policy.mjs:103`: the workflow-package branch is entered only if `approval.schema === CURRENT_APPROVAL_SCHEMA`.
  - `lib/plan-spec-state-v2.mjs:17`: `CURRENT_APPROVAL_SCHEMA = "pipeline.plan-approval.v8"` (introduced by `fad3b88e1`, which kept v7 as a
    previous-current constant at `:16`).
  - A v7 record therefore skips the whole branch (`:103-151`), falls to the legacy record read at `:161`, finds no file (`ENOENT`, `:163`),
    has no v4 ledger fallback (`:169`) and no `humanDecision.candidate` (`:175`), and returns the code at `:185`. The code is produced by
    `guard-devplan-policy.mjs:185`, not by `design-advisory-transaction.mjs:262`.
- Classification: test/fixture defect (stale schema literal after the product advanced to v8). Not environment.
- po-human-approval.mjs foreign edit on the path: NO. `evidence/TR-S1-F2-20261009/po-human-approval.patch` only adds the
  encrypted-PO-key gate (`assertPoPrivateKeyProtected`, key-armor classification) around setup/authorize/approve verbs; it does not touch plan-approval
  schemas, `designAdvisoryAdmission`, or `readApprovedDesignWorkflowPackage`, and the DWP21 case does not import it.
- Proposed slice (test-only): in `design-workflow-package.test.mjs` change the two fixture literals (`:928`, `:964`) to the v8 shape the guard
  accepts (use the exported `CURRENT_APPROVAL_SCHEMA`, add whatever v8-required fields the validator demands). Open point: v8 may require more
  fields than the v7 fixture carries; the slice must run the case to find the first refused field (not done here, budget).

## Case 2: e2e in-process driver (`plugins/pipeline-core/scripts/project-onboarding-e2e.test.mjs`, case at `:780`)

- Evidence of the observed failure: `evidence/R7-3-F1b2-20261009/before.txt` lines 481 and 555-563 (assertion at `:1607`, message
  `codex: [guard-devplan] ... (DAA-PUBLIC-UNAVAILABLE)`); the same text already appears as a non-failing diagnostic at line 481 (the test's
  own `testContext.diagnostic` at `:1466`, "real lifecycle gate after final approval").
- Which file is "missing": again the public advisory record. At `:1450-1466` the test completes the lifecycle through the public driver and
  asserts `preState.planApproval.schema === "pipeline.plan-approval.v7"` (`:1461`). The writer of the advisory record is the later
  `coordinateDesignAdvisory` call (`:1469`); the `:1466` probe runs before it, and the `:1607` assertion is a later probe that still saw no record.
- Divergence: the same v7 vs `CURRENT_APPROVAL_SCHEMA` (v8) mismatch is the likeliest cause. The `:1461` literal documents that the lifecycle was
  expected to emit v7; the guard (`guard-devplan-policy.mjs:103`) only honours v8 and otherwise needs the advisory record or a v4 ledger fallback.
  Not proven: the case currently stops earlier (`:1036`), so I could not observe which schema the driver writes today, and I did not read `:1580-1610`
  (tool budget reached). Two alternatives remain open: (a) the driver emits v8 and `:1461` itself is what fails first once `:1036` is fixed, and
  `:1607` fails for a different reason (the advisory record written by `coordinateDesignAdvisory` is absent because the codex path skips it);
  (b) the driver emits v7 (product defect: a writer not yet moved to v8).
- Classification: test/fixture defect with moderate confidence (stale literal at `:1461`); product defect (v7 writer) not excluded.
- po-human-approval.mjs foreign edit on the path: NO for the same reason as above (the patch changes only key-armor gating; the e2e path signs with an
  encrypted `privateKey` fixture, so the gate would at most raise `PO-KEY-UNENCRYPTED`, which is a different code from DAA-PUBLIC-UNAVAILABLE).
- Proposed slice: after R7-3-T2e lands, rerun the case alone under WSL with `--test-name-pattern` via `capture-evidence.mjs`, read
  `readFixtureState(path).planApproval.schema` at `:1461`, then (test-only) update the literal if the driver emits v8, or (production) move the
  remaining v7 writer to `CURRENT_APPROVAL_SCHEMA`.

## Shared root cause?

Probably yes at the guard: both failures arrive at `guard-devplan-policy.mjs:185` because the plan-approval record is not
`CURRENT_APPROVAL_SCHEMA` (v8) while two tests still pin `pipeline.plan-approval.v7` (`design-workflow-package.test.mjs:928`,
`project-onboarding-e2e.test.mjs:1461`). Proven for DWP21 (reproduced, exact line chain); hypothesis for the e2e case. The
foreign po-human-approval edit is on neither path.
