---
schema: pipeline.backlog-item.v1
id: pipeline.nongit-retirement-reader-calls-inaccessible-controller-helper
type: defect
owner: pipeline
status: open
created: 2026-09-29
sprint: alfred
done_when: manual
source: "Complete unfiltered four-shard Source onboarding qualification, 2026-09-29."
---

# Read non-Git enrollment scope through the public sealed controller

`readGovernanceEnrollmentRetirement` calls `inspect(ctx)` in its no-Git branch.
That function exists only inside `createGovernanceScopeController`; it is not
available at module scope. Actual public inspection therefore throws
`ReferenceError: inspect is not defined` for the relevant non-Git roots,
including repository/session capability failure fixtures. Related portable
transactions also fail in the complete suite; their remaining causes must be
established after this concrete defect is corrected.

Evidence:
`scratch/0.7-actual-source-complete-project-onboarding-qualification-20260929/manifest.json`,
SHA `a925c01220a14bab0f4397b7627d6a55553cf8a0fcf25202577f30ad6c03132c`.
The actual canonical controller declared 184 cases: 54 PASS and 130 FAIL
lines; all four shards exited 1. Thirteen Source dependencies were stable.
These counts are the complete failed trajectory, not proof that this one
defect explains every failure. No Source mutation or filtered retry occurred.

## Acceptance

- Public retirement reads reuse the sealed controller's public observation,
  with the same physical root and authority binding.
- Inactive roots without retained history return no journal; valid active
  non-Git enrollment remains recognized without inventing a retirement record.
- Retained, corrupt or unverifiable owned history still fails closed with
  typed diagnostics; no permissive catch or fabricated State fixes the error.
- Preserve all 23 governance-scope callbacks and their exact completion policy;
  qualify the actual Source corpus and complete original onboarding controller.
- Reconcile remaining failures from the new actual receipts. The item remains
  open until the fixed candidate's combined acceptance.

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **LINUX-RUN** — Run the complete original onboarding controller and Source corpus on Linux/WSL and reconcile remaining failures
  Run lib/pins/nongit-retirement-reader-calls-inaccessible-controller-helper.test.mjs plus the full original onboarding controller (184 cases, four shards) serially with node scratch/run-in.mjs and a private TMPDIR; the earlier 130 FAIL were largely SDC-AUTHORITY-UNAVAILABLE, now green this way. Closes when exit 0 with consistent counts, or remaining reds are reconciled to named items. Long run.
