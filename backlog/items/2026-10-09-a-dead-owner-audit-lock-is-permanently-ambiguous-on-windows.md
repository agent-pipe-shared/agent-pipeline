---
schema: pipeline.backlog-item.v1
id: pipeline.hgo-dead-owner-audit-lock-permanently-ambiguous-on-windows
type: defect
owner: pipeline
status: open
created: 2026-10-09
source: "Live, Alfred session 2026-10-09 (toil T90): every override plan and ceremony refused with HGO-AUDIT-LOCK-AMBIGUOUS although the lock owner process no longer exists."
sprint: none
done_when: manual
---

# A dead-owner HGO audit lock is permanently ambiguous on Windows

## Confirmed behavior

`.git/agent-pipeline/human-guard-overrides/audit.lock` was left behind by owner pid 26972, which `tasklist` confirms
no longer exists. On win32, `auditLockOwnerState` (`plugins/pipeline-core/lib/human-guard-override.mjs:2336-2348`)
returns `ambiguous` for every owner on any non-Linux platform. So the closed recovery from
`2026-09-12-a-crashed-hgo-writer-leaves-an-unrecoverable-audit-lock.md` can never classify the owner as dead there.

The lock then blocks every human guard override on that machine:
- every ceremony;
- every override PLAN that a guard refusal tries to offer. The refusal text says "planning the route failed with
  code=HGO-AUDIT-LOCK-AMBIGUOUS".

Seen live in at least five dispatch refusals and two Elephant refusals on 2026-10-09, among them
`PB-CONTRACT-TESTS` for two new hook test files and `GUARD-CROSS-REPO-MUTATION`. The only exit is an attended manual
deletion of the lock and release files.

## Correction and acceptance

- On win32, determine whether the owner is alive from a platform-native process query (pid plus process start time,
  the same identity the Linux branch binds). Fail closed only when the query itself fails or the identity does not
  match.
- A dead owner with a matching recorded start identity becomes recoverable through the existing closed recovery path.
  A live owner, a reused pid with a different start time, or an unverifiable owner stays `ambiguous`.
- Regression: a win32-shaped fixture covers a dead owner, a live owner and a pid reused with a different start time.
  A Linux control stays unchanged.
- Override PLANNING should not need the audit lock where it only reads. If it must, the refusal names the attended
  recovery command instead of failing opaquely.

## Interim

The PO deletes the two files attended, after checking that no ceremony is running. The command is in
`specs/sprint-alfred-epic/plans/po-list-2026-10-08.md` (T90).

## Triage

- **2026-10-09:** filed live (toil T90). It is in scope for the next local 0.7.0 candidate (BN). The fix site is
  under `lib/`, and its guard/kernel classification needs checking at slice time.
