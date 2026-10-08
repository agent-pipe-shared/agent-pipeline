---
schema: pipeline.backlog-item.v1
id: pipeline.verify-on-a-wsl-mnt-drive-checkout-hides-its-reason
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Reproduced on two WSL checkouts under /mnt/<drive> on 2026-10-05 (Alfred session, round 3b drafts)."
sprint: alfred
done_when: manual
---

# Verify on a WSL `/mnt/<drive>` checkout cannot run and hides the reason

## Description

Verify cannot run on a WSL checkout under `/mnt/<drive>` and hides the reason. On DrvFs every path reports mode 777, so `ensurePrivateDirectory` throws `VERIFY-JOURNAL-DIRECTORY-NOT-PRIVATE`. `registerRunRecordOwner` in `plugins/pipeline-core/scripts/verify-journal.mjs` catches it and rethrows the generic `VERIFY-CLEANUP-REGISTRATION-REQUIRED`, so the operator sees "cleanup registration" instead of "private directory not possible on this filesystem".

Reproduced on 2026-10-05 on two DrvFs checkouts; a clone in the Linux home ran clean.

## Affected artifact

`plugins/pipeline-core/scripts/verify-journal.mjs` (`registerRunRecordOwner`, `ensurePrivateDirectory` call path).

## Proposal

Keep the original error code in the error (cause chain) and print a typed hint naming the filesystem limit and the native-clone workaround (clone into the Linux home).

Matrix: WSL only. Native Linux and macOS have real modes; native Windows uses the DACL path.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** fixed in source — closes after the 0.7.0 candidate host checklist (status stays `open` until then).
- **Rationale:** commit(s) `dac8d1314`.
- **Assignment (if accepted):** sprint-alfred-epic close-out batch.
- **Date:** 2026-10-08.
