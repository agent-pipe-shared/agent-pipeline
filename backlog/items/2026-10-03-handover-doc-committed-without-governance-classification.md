---
schema: pipeline.backlog-item.v1
id: pipeline.handover-doc-committed-without-governance-classification
type: defect
owner: pipeline
status: open
created: 2026-10-03
source: "Bootstrap F6 finding, Claude Code session on Windows, 2026-10-03: `check-observation-governance.mjs` reported `OG-DOC-UNCLASSIFIED docs/0.7-recovery-2026-10-03.md` at HEAD a0d83ce78."
sprint: alfred
done_when: manual
---

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
