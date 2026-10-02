---
schema: pipeline.backlog-item.v1
id: pipeline.design-package-parent-metadata-false-drift
type: defect
owner: pipeline
status: open
created: 2026-09-29
sprint: none
done_when: manual
source: "Actual native DAA-DWP-PHYSICAL-DRIFT refusal and deterministic physical-reader diagnosis, 2026-09-29."
---

# Unrelated directory entries can reject an unchanged approved design package

## Confirmed defect

The physical package reader compares directory size, modification time and
link count as though they were approved file authority. Creating an unrelated
sibling file or directory during a read therefore rejects unchanged admitted
artifact bytes. A deterministic current/prepared-reader comparison reproduces
both false positives while all nine synthetic artifact hashes remain unchanged.
The proposed comparator retains directory type, device, inode and mode checks;
leaf metadata, physical paths, byte equality, bounds and UTF-8 checks remain.

An actual five-file documentation/maps action was refused before writes with
`DAA-DWP-PHYSICAL-DRIFT`. Its exact failing artifact or read is not reported.
That historical refusal has not been causally attributed to this defect.
Subsequent bounded full admission accepts the actual approved package and its
stored signature in both Source and cache without observed public-file drift.
The existing Implementation approval remains valid.

## Acceptance

- Unrelated sibling creation cannot invalidate an otherwise unchanged package.
- Parent replacement, aliases and mode changes, and admitted leaf changes,
  hardlinks, aliases, oversized bytes, invalid UTF-8 and traversal still fail.
- Preserve the original registered 21-case corpus and its assertions; exercise
  deterministic mutations through the exported approved-package reader.
- Qualify the delivered Source and retain precise limits for installed runtime
  and historical failure attribution. Do not invent a renewed plan approval.

## Evidence and delivery

Prepared diagnosis namespace:
`scratch/0.7-design-package-physical-drift-diagnosis-20260929/`.
Generic-reader result: 13 cases / 26 comparisons passed, SHA
`1a2708fe84a4c18cd8d8cc855027a68d268ba107e797417684a764bdac945720`.
Actual full-admission result SHA
`80c89f4e0a5673a156810e239edd6bc9a22a8f58b82f8774e14a8d18993e6613`.
Reviewed two-path proposal manifest SHA
`17bb8b247613f5bba2766594485739f7eb5766ce9e63fadc02ec45970e7e3554`.
Root's first native two-path delivery succeeded. Actual Source qualification
passes all 21 original cases with real FD3; manifest SHA
`72823f3c59a2bc9693ca98fe147050e438e6ecb0a49975b28dbd98807b0a3c50`.
The current Verify completion policy still declares 20 cases; its exact
registration correction is held in the nine-file signature bundle. No canonical
Verify or installed-runtime PASS is claimed. Register this item
with the canonical ledger after its tracked commit; no closure is claimed here.
