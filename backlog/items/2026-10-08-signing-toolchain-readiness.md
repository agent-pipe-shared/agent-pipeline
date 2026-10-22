---
schema: pipeline.backlog-item.v1
id: pipeline.signing-toolchain-readiness
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-08
source: "admin-step inventory (docs/admin-steps-inventory.md), decision AO"
sprint: alfred
done_when: manual
due: 2026-10-31
---

# Signing toolchain readiness

## Description

Admin-step inventory row C9 ("Ensure openssl is resolvable for signing", non-default Git install root, per host,
PO terminal) is classified automatable: the Pipeline checks and resolves the toolchain. Source:
`docs/admin-steps-inventory.md` row C9, candidate 3; toil log:21-22 (T15/T16).

## Triggering situation

Toil rows T15/T16 (toil log:21-22): signing fails or needs manual PATH work when openssl is not at the default
Git install root.

Recurrence 2026-10-08 evening (tranche ceremony): `openssl` was not on the PO's PowerShell PATH at all (Git under a
non-default root, OpenSSL in its `ucrt64\bin`). `sign-intent` still ran ~10 min of disclosure lookups and then failed
with only `openssl failed; the human terminal must complete the local prompt` — no word that OpenSSL was missing. The
readiness probe has to run before any lookup and name the missing executable (see
`pipeline.sign-intent-disclosure-scan-blocks-for-minutes`).

## Affected artifact

The readiness report in `plugins/pipeline-core` and the signing helpers that invoke openssl.

## Proposal

Check openssl in the readiness report and emit a typed repair per finding.
Owner: pipeline; due 2026-10-31.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted.
- **Rationale:** decision AO: automatable admin step.
- **Assignment (if accepted):** post-0.7.0 automation lane unless pulled in.
- **Date:** 2026-10-08

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **WINDOWS-INTEROP-RUN** — The recurrence was a non-default Git root on a Windows PowerShell PATH; no counted native-Windows run of the pin exists
  Run the readiness-report pin natively through cmd.exe with a controlled PATH that omits openssl and a Git under a non-default root (ucrt64 layout), expecting the typed missing-OpenSSL repair. Fast, no secrets.
