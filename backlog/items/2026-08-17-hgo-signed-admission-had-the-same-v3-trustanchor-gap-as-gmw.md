---
schema: pipeline.backlog-item.v1
id: pipeline.hgo-signed-admission-had-the-same-v3-trustanchor-gap-as-gmw
type: defect
owner: pipeline
status: closed
created: 2026-08-17
closed_at: 2026-08-17
closure_repository: self
closure_commit: 989cb236
closure_evidence: specs/sprint-nova-epic/evidence/backlog/2026-08-17-v3-trustanchors-gmw-hgo-fix-closure.md
source: "Reported by the PO on 2026-08-17, relaying a diagnosis independently made and verified in a downstream consumer-project session; confirmed live in this repository, whose own project/critical-human-proof.json is already on the v3 schema."
---

# `human-guard-override.mjs`'s signed admission path read only the legacy singular `trustAnchor` field

## Description

`authorizeHumanGuardOverrideBySignature()` in
`plugins/pipeline-core/lib/human-guard-override.mjs` read only the legacy
**singular** `policy.trustAnchor` field, permanently `null` once
`project/critical-human-proof.json` carries the v3 **`trustAnchors` array**.
Every signed Human-Guard-Override authorization therefore failed with
`HGO-TRUST-ANCHOR-MISSING`, regardless of how correctly it was signed — this
repository's own trust-anchor file has been on the v3 schema since earlier
in the same AFK session, so this was live and reproducible here, not
hypothetical.

Same defect class as `guard-maintenance-window.mjs`'s
`currentGuardMaintenanceWindow()`, already fixed this session
(`NVA-GMWFIX-1`/`NVA-GMWFIX-2`, see
`backlog/items/2026-08-16-gmw-install-never-recognizes-its-own-window-under-v3-multi-anchor-schema.md`).

## Triggering situation

Downstream consumer-project session diagnosis, relayed by the PO, prompted a
direct check of this repository's own `human-guard-override.mjs` — the same
`policy.trustAnchor === null` pattern was found at the signed-admission call
site and confirmed as a live defect against this repo's own v3 policy file.

## Affected artifact

`plugins/pipeline-core/lib/human-guard-override.mjs`,
`authorizeHumanGuardOverrideBySignature()`.

## Proposal

Mirror GMW's fail-closed pattern: resolve a non-empty v3 `trustAnchors` set
when present, fall back to the legacy singular field when absent/empty, and
hard-fail (`HGO-TRUST-ANCHOR-MISSING`) on a genuinely empty set — never
adopt `verifyAgainstTrustAnchors()`'s own "absent/empty accepts any
well-formed key" posture, which is deliberate only for the four
`CRITICAL_ACTION_KINDS` ceremonies (push/deploy/publication/
release-preflight) and would make this broader, arbitrary-denial-override
ceremony self-serviceable by an agent if adopted here.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted — fixed this session, `NVA-HGOFIX-1` (commit `954e12da`, dispatched into an isolated worktree; merged into main as `989cb236` after independent re-verification of a clean, conflict-free merge and a full re-run of the affected test suite).
- **Rationale:** identical defect class to the already-fixed GMW gap; same fail-closed judgment call applies and was independently confirmed against ADR-0059/the GMW threat-model doc before implementation, per the dispatch briefing.
- **Assignment (if accepted):** this AFK block.
- **Date:** 2026-08-17
