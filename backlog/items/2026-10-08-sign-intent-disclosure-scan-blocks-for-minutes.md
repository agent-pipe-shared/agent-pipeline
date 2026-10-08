---
schema: pipeline.backlog-item.v1
id: pipeline.sign-intent-disclosure-scan-blocks-for-minutes
type: defect
owner: pipeline
status: open
created: 2026-10-08
source: "tranche signing ceremony 2026-10-08 (PO report, measured by the Elephant)"
sprint: alfred
done_when: manual
due: 2026-10-31
---

# `sign-intent` blocks for ~10 minutes before the passphrase prompt

## Description

Before it prints the disclosure, `po-human-approval.mjs sign-intent` tries the GMW resolver and then
`describeHumanGuardOverrideSelection` (HGO) for a description of the digest. With 111 recorded HGO requests in
`.git/agent-pipeline/human-guard-overrides/requests`, the HGO resolver took **563 s** (measured read-only with the
installed plugin, 2026-10-08) and still resolved nothing (`HGO-RECORD-DIGEST-MISMATCH`), because a signed quality
package is not an HGO request at all. The PO saw a silent hang of 10+ minutes before every passphrase prompt, three
times in one ceremony. The PO's verdict: the search is "hohl" (hollow) and must work differently.

## Triggering situation

Tranche package intent `882476b7…`: three `sign-intent --request scratch/T1/t1-request.json` runs, each ~10 min before
the disclosure; two of them then failed on a missing OpenSSL (see `pipeline.signing-toolchain-readiness`).

## Affected artifact

`plugins/pipeline-core/scripts/po-human-approval.mjs` (`sign-intent` branch, disclosure resolver chain);
`plugins/pipeline-core/lib/human-guard-override.mjs` (`describeHumanGuardOverrideSelection`).

## Proposal

1. Recognise a signed-quality-package request (or intent record) directly and disclose its base commit, changed
   paths and digests — before, and instead of, the GMW/HGO resolvers.
2. Make the HGO lookup a digest-keyed lookup (index or file name by request digest), never a full scan that
   re-derives every request.
3. Run every toolchain/key/directory readiness check (OpenSSL on PATH, key readable, key directory resolved) before
   any resolver work, so a missing prerequisite fails in seconds with its typed repair.
4. A sanctioned sweep for consumed or expired HGO requests.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, high priority (blocks every signing ceremony for minutes).
- **Rationale:** measured 563 s for a lookup that cannot succeed; PO request 2026-10-08.
- **Assignment (if accepted):** first slice of the next signed package (the fix itself touches a protected path).
- **Date:** 2026-10-08
