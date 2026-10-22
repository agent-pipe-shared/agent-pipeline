---
schema: pipeline.backlog-item.v1
id: pipeline.verify-does-not-run-the-observation-governance-checker
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-16
source: "PO decision 2026-10-16 (AC-198 D1 tile): hook-only governance classification of staged documents is accepted for 0.7.0; a Verify second line is a backlog item after 0.7.0. Evidence: ALF-C-P1-11B."
sprint: none
done_when: manual
---

# Verify does not run the observation-governance checker on the repository

## Description

The governance classification of staged documents (for example a handover
document) runs only in the installed pre-commit hook
(`plugins/pipeline-core/scripts/pre-commit-hook-install.mjs`, the
`checkStagedObservationDocumentation` call). A clone without the hook
commits an unclassified document with exit 0. `harness/scripts/verify.mjs`
runs only the checker's own tests and the bootstrap tests, not the checker
against the repository, so the only later catch is the session-start
observation-governance bootstrap (failure case F6).

## Proposal

Add a Verify step that runs `harness/scripts/check-observation-governance.mjs`
against the repository tree and fails on an unclassified governed document.
`verify.mjs` is protected, so this is a signature-bound change; first measure
whether existing documents would fail it.

## Acceptance

- A full Verify on a tree with an unclassified governed document fails with
  the checker's typed code; a classified tree passes.
- The hook-only behaviour accepted for 0.7.0 stays unchanged until then.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**

## Merged from `2026-10-03-handover-doc-committed-without-governance-classification` (created 2026-10-03; merged 2026-10-22)

*Carried over verbatim from the item closed as a duplicate of this one. What is unique to it: Incident record (commit a0d83ce78 added docs/0.7-recovery-2026-10-03.md unclassified; same omission earlier, repaired in e727a9893), the contributing factor that the Windows clone had no pre-commit/commit-msg hooks (HOOK-READINESS-INSTALL-REQUIRED), and the alternative proposal to run the check inside the handover writer itself.*

**Front matter of the merged item, verbatim (status/ledger fields of the original):**

```yaml
schema: pipeline.backlog-item.v1
id: pipeline.handover-doc-committed-without-governance-classification
type: defect
owner: pipeline
status: open
created: 2026-10-03
source: "Bootstrap F6 finding, Claude Code session on Windows, 2026-10-03: `check-observation-governance.mjs` reported `OG-DOC-UNCLASSIFIED docs/0.7-recovery-2026-10-03.md` at HEAD a0d83ce78."
sprint: alfred
done_when: manual
```

#### Description

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

#### Triggering situation

Session re-entry 2026-10-03 after the handover commit.

#### Affected artifact

The handover writing path (close/handover skills and templates),
`governance/observation-doc-governance.json`, and commit-time enforcement of
`harness/scripts/check-observation-governance.mjs`.

#### Proposal

A handover or any new `docs/*.md` must not be committable unclassified.
Run the observation-governance check in the pre-commit hook, or in the
handover writer itself, so the omission is caught at commit time rather than
at the next bootstrap.

#### Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
