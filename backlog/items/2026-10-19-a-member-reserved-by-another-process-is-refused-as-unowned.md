---
schema: pipeline.backlog-item.v1
id: pipeline.a-member-reserved-by-another-process-is-refused-as-unowned
type: defect
owner: pipeline
status: open
created: 2026-10-19
source: "Elephant decision E30 (2026-10-19): MFHS028 measurement by ALF-B10-MFH"
sprint: none
done_when: manual
---

# A member reserved by another process is refused as unowned

## Description

`lib/session-authority-domain-owner.mjs` `reconcile()` (line ~198) refuses every
non-released member record whose phase is `reserved` and whose `bindingSha256` is not in
the calling process's own in-memory `live` map. That map belongs to one process. A
member that a second, still-running process reserved therefore looks unowned, and
`reserveSessionAuthorityMember` throws `SDC-AUTHORITY-UNAVAILABLE`
(`model-family-host:unowned-retained-member`).

The refusal fails closed: nothing is admitted, and no state is corrupted. Two processes
writing model-family host state for the same repository at the same time cannot both
proceed, though. One of them is refused until the other's reservation settles. The
registry lock (`session-authority-registry.mjs` ~115, O_EXCL, no wait) has the same
contention shape, but there it is a typed `SDC-LOCK-HELD` that a caller can retry.

## Evidence

`lib/model-family-host-store.test.mjs` MFHS028: the spawned concurrent writers retry
on `SDC-LOCK-HELD registry-lock-held` (E29), then die on `unowned-retained-member`.

## Open

- Reachability in the shipped default chain has not been measured. It is unknown whether
  two processes can reserve model-family members for one repository concurrently
  outside the test.
- Possible fixes: a cross-process liveness proof for a reservation, for example a
  lifetime file the owner can observe, or a typed retryable code that a caller can wait
  on.

## Acceptance

- A member reserved by another live process is either honoured or refused with a typed
  retryable code, never as `unowned-retained-member`.
- A member whose reserving process is gone is still refused or reclaimed, fail-closed.
- MFHS028 runs its concurrent writers without a test-side workaround.
