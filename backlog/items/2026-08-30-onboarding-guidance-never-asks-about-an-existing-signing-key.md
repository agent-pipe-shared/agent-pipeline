---
schema: pipeline.backlog-item.v1
id: pipeline.onboarding-guidance-never-asks-about-an-existing-signing-key
type: defect
owner: pipeline
status: closed
created: 2026-08-30
closed_at: "2026-08-30"
closure_repository: "self"
closure_commit: "4b29d1ad2ed5f38c060f790a265bfa600986e2d7"
closure_evidence: "plugins/pipeline-core/lib/project-onboarding-v3.mjs"
tracking: "Retrospective-analysis follow-up item #2, PO-confirmed 2026-08-30 ('auch verdrahten und fixen! das muss der runner zwingend abfragen')"
source: "PO's greenfield-test relay, 2026-08-30: onboarding's key-setup guidance defaults to walking the PO through a brand-new key, never asking whether one already exists on the machine, even though closed item 2026-08-29-onboarding-has-no-happy-path-for-an-existing-signing-key.md already built the --existing-key mechanism."
---

# Onboarding's key-setup guidance never surfaces the already-built `--existing-key` path as a mandatory question

## What happened

`2026-08-29-onboarding-has-no-happy-path-for-an-existing-signing-key.md`
(closed) added `po-human-approval.mjs setup --existing-key <path>` so an
already-existing key can be registered directly. But the onboarding
guidance TEXT that a runner actually reads and acts on
(`project-onboarding-v3.mjs`'s `collectPushApprovalPreferenceAction()`
`firstAsk` branch, and the "no PO signing key recorded at all" guidance in
`proposeTrustAnchorAbsentGuidanceAction()`) never mentioned this option --
both unconditionally walked the PO through creating a brand-new key. The PO
required this to become a MANDATORY forced sub-question, not merely a
passing text mention: "das muss der runner zwingend abfragen."

## Fix

Both guidance strings now ask the PO, as an explicit, unmissable
sub-question, whether they already have an existing signing key on this
machine BEFORE any instruction to create a new one -- and if yes, explain
registering it via `po-human-approval.mjs setup ... --existing-key <path>
...` instead of the new-key ceremony. Additive only: no `collect-input`
action shape, function signature, or call site changed.

Dispatch `NVA-CF-EXISTINGKEYASK` (goldfish-implementor, medium). Evidence,
independently re-verified by the Elephant: `project-onboarding-v3.test.mjs`
157/157 pass (new assertions added to the existing `pushApprovalSetupAction`
and `NVA-V17-NOKEYASK` tests proving both guidance strings carry the
question and the flag mention), `check-consumer-safe-paths.test.mjs` 9/9.
Commit `4b29d1ad`.

## Triage

- **Decision:** accepted, Nova A
- **Rationale:** PO-prioritized happy-path fix, direct follow-up to an
  already-closed mechanism that was never actually surfaced
- **Date:** 2026-08-30
