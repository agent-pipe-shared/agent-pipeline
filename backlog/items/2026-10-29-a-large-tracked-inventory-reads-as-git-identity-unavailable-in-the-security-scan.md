---
schema: pipeline.backlog-item.v1
id: pipeline.a-large-tracked-inventory-reads-as-git-identity-unavailable-in-the-security-scan
type: defect
owner: pipeline
status: open
created: 2026-10-29
priority: P1
release: 0.7.0
sprint: alfred
source: "Elephant, 2026-10-29, own security scan of this repository (snapshot mode) stopped with git-identity-unavailable"
done_when: manual
---

# A large tracked inventory makes the security scan report git-identity-unavailable

## Evidence

`security-scan.mjs` read the Git identity (commit, tree, tracked-file listing) through `gitText()` with the default spawn buffer. A repository whose `ls-tree` output exceeds it (1.89 MB here) made the read fail, and the scan reported `git-identity-unavailable` instead of binding the candidate, so a scan of a large consumer could not complete at all.

## Delivered

Commit cd5d5e591: `gitText()` passes a 256 MiB `maxBuffer`; new suite `security-scan-large-inventory.test.mjs` (5000 long-named files, candidate clean and commit/tree bound). In the stamped candidate 0b10cc602; not installed.

## Open

The suite is not registered in the Verify suite list (the registration gate is red for nine older suites too; registering by hand breaks the capability inventory baseline, an operating-tools ceremony). Real run on a large consumer repository.
