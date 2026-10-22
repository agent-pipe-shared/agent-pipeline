---
schema: pipeline.backlog-item.v1
id: pipeline.private-temp-root-not-secure-branch-has-no-test-seam
type: defect
owner: pipeline
status: open
created: 2026-10-07
source: "B-S1-T2 dispatch report, evidence/dispatch-record-B-S1-T2.json"
sprint: alfred
done_when: manual
due: 2026-10-20
---

# The private temp root's NOT_SECURE refusal has no test seam

## Description

`privateTempRoot()` in `plugins/pipeline-core/lib/test-private-tmp.mjs` takes no options, and its `secureRoot()` calls
`hardenWindowsPrivateDirectory(root)` and `assessWindowsPrivatePath(root)` without options, so the adapter's `{run,
environment}` seams are unreachable. The `PRIVATE_TMP_ROOT_NOT_SECURE` refusal is therefore unpinned: removing it would not
turn any test red.

## Triggering situation

B-S1-T2, 2026-10-07: every other refusal was pinned and mutation-checked; this one had no reachable seam.

## Affected artifact

`plugins/pipeline-core/lib/test-private-tmp.mjs`, `plugins/pipeline-core/lib/test-private-tmp.test.mjs`.

## Proposal

Add an injectable harden/assess option to `privateTempRoot` (default unchanged), then pin the refusal. Owner: pipeline; due
before the 0.7.0 release candidate.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted.
- **Rationale:** an unpinned security refusal can regress silently.
- **Assignment (if accepted):** B-S1-F seam dispatch, then a test pin; 0.7.0 candidate.
- **Date:** 2026-10-07

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **WINDOWS-INTEROP-RUN** — Run the P1/P2 seam and NOT_SECURE cases on native Windows to get a counted result
  Run lib/pins/private-temp-root-not-secure-branch-has-no-test-seam.test.mjs with Windows node via cmd.exe on a /mnt/d clone (the WIN_ONLY cases at lines 106-155 skip on Linux); record the counted result. Minutes.
