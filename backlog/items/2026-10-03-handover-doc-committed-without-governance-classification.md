---
schema: pipeline.backlog-item.v1
id: pipeline.handover-doc-committed-without-governance-classification
type: defect
owner: pipeline
status: closed
created: 2026-10-03
closed_at: 2026-10-22
closure_repository: self
closure_commit: 35455319327d44d5519671a13f0956583dd99a21
closure_evidence: backlog/items/2026-10-16-verify-does-not-run-the-observation-governance-checker.md
source: "Bootstrap F6 finding, Claude Code session on Windows, 2026-10-03: `check-observation-governance.mjs` reported `OG-DOC-UNCLASSIFIED docs/0.7-recovery-2026-10-03.md` at HEAD a0d83ce78."
sprint: alfred
done_when: manual
---

**Rejected as a duplicate (backlog grooming 2026-10-22):** merged into `backlog/items/2026-10-16-verify-does-not-run-the-observation-governance-checker.md`. Both describe the same observable defect: a new governed docs/*.md (handover) can be committed unclassified and is caught only at the next session-start bootstrap (F6). The 2026-10-03 item's proposal (commit-time check in the pre-commit hook) is already implemented (checkStagedObservationDocumentation in pre-commit-hook-install.mjs, line 975); the remaining gap, a clone without the hook, is exactly the 2026-10-16 item's Verify second line, which has the fuller acceptance. All content of this item is carried over verbatim into that item's section "Merged from `2026-10-03-handover-doc-committed-without-governance-classification`"; nothing is lost.

# Handover document committed without its governance classification

## Description

Commit `a0d83ce78` (`docs(state): record clean recovery handover for next
session`) added `docs/0.7-recovery-2026-10-03.md` without adding it to
`governance/observation-doc-governance.json`. On the next session start the
mandatory observation-governance bootstrap failed (case F6), which blocks
writing, dispatch and bootstrap confirmation until repaired. The same omission
happened before and was repaired after the fact (`e727a9893`,
`docs(governance): classify local candidate handovers`), so it is recurring.

Contributing factor: this Windows clone had no `pre-commit`/`commit-msg` hooks
installed (preflight reported `HOOK-READINESS-INSTALL-REQUIRED`). Whatever
commit-time check exists did not run. The handover was also authored in a
different checkout, so it is unknown whether that checkout had the hooks.

## Triggering situation

Session re-entry 2026-10-03 after the handover commit.

## Affected artifact

The handover writing path (close/handover skills and templates),
`governance/observation-doc-governance.json`, and commit-time enforcement of
`harness/scripts/check-observation-governance.mjs`.

## Proposal

A handover or any new `docs/*.md` must not be committable unclassified.
Run the observation-governance check in the pre-commit hook, or in the
handover writer itself, so the omission is caught at commit time rather than
at the next bootstrap.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **NOT-BLOCKED** — Decide whether the pinned residual gap is accepted: a clone without installed hooks still commits an unclassified handover and only the bootstrap catches it later
  The item is status closed (2026-10-22, closure commit 35455319), rejected as duplicate and merged into 2026-10-16-verify-does-not-run-the-observation-governance-checker.md, whose Verify second line carries the residual gap and its acceptance. The decision now lives there, not here.
