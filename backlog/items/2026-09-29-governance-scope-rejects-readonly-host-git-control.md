---
schema: pipeline.backlog-item.v1
id: pipeline.governance-scope-rejects-readonly-host-git-control
type: defect
owner: pipeline
status: open
created: 2026-09-29
done_when: manual
sprint: alfred
source: "Complete original onboarding run and physical host-layout contract analysis, 2026-09-29."
---

# Governance enrollment rejects the supported readonly host Git control mount

## Confirmed finding

Two original onboarding callbacks fail for the canonical Codex host-managed
layout: an empty, nonsymlink, nonwritable `.git` control directory. The onboarding
layout owner already recognizes this physical host capability. The new shared
governance reader instead treats the failed local Git probe as unavailable and
cannot establish the expected first intake/enrollment route. Replacing this
fixture with writable local Git changes the contract and is not a correction.

The full original 184-callback execution stopped at its deadline with 143 PASS,
8 FAIL and 33 unobserved. These host failures are observations from that run;
the incomplete run is not a suite PASS. Manifest:
`scratch/0.7-onboarding-fixture-source-failure-repair-20260929/full-184-after-fixes/manifest.json`
SHA `3472d2fb8993458dc1d14371ce8774ff046f567ba0502c1f4b5452db9b23e59a`.

## Correction boundary

Reuse the existing sealed physical host-layout recognizer, selected-root private
history paths and governance decision store. Bind root/mount identity to the
existing branded apply transaction. No local Git initialization, chmod, public
capability override or new authority/schema is permitted.

Fresh host enrollment must work without fabricating plan approval. Declined or
corrupt retained host history must remain a typed recovery requirement. Recovery
uses the existing external operator route for the same selected root; it must
not silently erase history or imply a local retirement capability exists.

## Acceptance

- Both original host callbacks pass against actual corrected Source.
- Fresh/no-history and persisted decisions remain root bound; mount drift,
  aliases, writable/nonempty near misses and corrupt history fail closed.
- Existing local Git and non-Git history assertions remain intact.
- No `.git` writes or false candidate/native acceptance claims are introduced.

## Triage — implementation tracking

The implementation design is frozen in
`scratch/0.7-host-managed-governance-integration-20260929/design.json`, SHA
`f9d805471e957902c4aae847a32c8659826536052501480b3f2322afa77431dd`.
Source delivery and focused qualification are in progress; this item remains
open until its candidate-bound acceptance is verified.
