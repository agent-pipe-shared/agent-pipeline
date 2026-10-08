---
schema: pipeline.backlog-item.v1
id: pipeline.approval-bound-design-package-lives-in-an-ignored-directory
type: defect
owner: pipeline
status: open
created: 2026-10-06
source: "Device switch, Claude/Windows session 2026-10-06 (IC-2d install on the second PC): onboarding inspect demanded reopen-design with DWP-PACKAGE-PHYSICAL because the approved package file does not exist on that machine."
sprint: alfred
done_when: manual
---

# The approval-bound design workflow package lives in an ignored directory

## Description

The signed plan approval of `sprint-alfred-epic` (`project/pipeline-state.json`, `planApproval.designWorkflowPackagePath`)
binds `evidence/design-course/sprint-alfred-epic/claude.package.json` (sha256 `826f1374…`). The root `evidence/`
directory is git-ignored by design (ADR-0063: machine-regenerated evidence). The package is not regenerable: it carries
`createdAt` and digests of host-observed readiness and course artifacts that also live under the ignored root. It was
never committed (`git log --all -- evidence/design-course` is empty). On any other checkout of the same commit the
approval therefore cannot be verified, the dev-plan guard refuses every implementation write — and, in that state, even
`backlog/` writes (`DWP-PACKAGE-PHYSICAL`) — and the only offered recovery is `reopen-design` plus a new signed
approval, for a design whose PRD and spec are unchanged and tracked.

## Triggering situation

2026-10-06: the PO switched devices after the IC-2d handover; the first PC is unreachable for three days. The handover
listed root `evidence/` as local-only for dispatch records and Verify results, but nothing identified the
approval-bound package as living there. Recovery taken: `reopen-design` and a new signed approval on the second PC.

## Affected artifact

The design-course / design-workflow-package writers (`plugins/pipeline-core/lib/design-workflow-package-v2.mjs` and the
course producer that chooses the output path), `docs/adr/0063-repository-directory-contract.md` (directory kinds),
handover template / close-block (what must travel), `project/pipeline-state.json` approval records.

## Proposal

1. Classify every artifact an approval, signature or gate binds by digest as durable, tracked evidence: write it under
   `specs/<feature-id>/evidence/` (or another tracked home ADR-0063 names), never under the ignored root `evidence/`.
2. Refuse at `present-plan` / approval time when a bound path is git-ignored (fail closed before the PO signs, not on the
   next machine).
3. Sharpen ADR-0063: "machine-regenerated" means regenerable bit-for-bit from tracked inputs; anything else is not
   eligible for the ignored root.
4. A handover/close check that lists every digest-bound path in the state file and fails when one is untracked.

## Recurrence 2026-10-08 (late, switch back to the first PC)

Second occurrence (toil T70): the other machine continued in `implementation`; here every `node` call and every
tracked write was refused until the PO copied the files by hand. The bound set is larger than this item first said:
besides `r5d.package.json`, its readiness/preparation/failure/initial files under `evidence/`, the private readiness
receipt `.git/agent-pipeline/design-readiness/<fp>/drh_*.json` and the Advisor course under
`.git/agent-pipeline/design-advisor-courses/` are all required — so tracking `evidence/` alone does not fix it. The
tracked mirror `specs/sprint-alfred-epic/evidence/design-course-rev5/` (`1b911a544`) is byte-identical
(`539629da…`) but unused, because State and the package still name the ignored paths. A separate product defect
surfaced behind it (`2026-10-08-approval-verification-demands-head-equals-candidate.md`). PO decision BI: candidate
blocker — an approved phase must never be lost by a device switch.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
