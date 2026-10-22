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

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **LINUX-RUN** — The item is WSL-only: a Verify run on a real /mnt/<drive> DrvFs checkout showing the typed hint is missing; the pin simulates permissive modes
  This machine has real /mnt/d DrvFs: clone with --no-hardlinks under /mnt/d and run the verify-journal pin plus a Verify entry there, with a private TMPDIR. Closes when the output shows VERIFY-JOURNAL-DIRECTORY-NOT-PRIVATE in the cause chain and the typed hint naming the Linux-home clone workaround.
