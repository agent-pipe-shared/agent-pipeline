---
schema: pipeline.backlog-item.v1
id: pipeline.observation-governance-bootstrap-false-positives-on-vendor-synced-consumer-projects
type: defect
owner: pipeline
status: open
created: 2026-08-17
source: "Relayed by the PO 2026-08-17 from a Windows (D:\\Dev\\Web\\Toolbox) session's handover after completing Toolbox's pipeline bootstrap through plan approval. Confirmed live on Toolbox post-vendor-sync: observation-governance-bootstrap.mjs --root D:\\Dev\\Web\\Toolbox returns {\"status\":\"failed\",\"sourceCheckout\":true,\"code\":\"OGB-CHECKER-MISSING\"}. Not currently blocking anything (not wired into the PreToolUse guard, only into pipeline-start's own happy-path checklist step)."
---

# `observation-governance-bootstrap.mjs` false-positives as "source checkout" on any consumer project that used vendor-sync

## Description

`plugins/pipeline-core/lib/observation-governance-bootstrap.mjs`,
`inspectObservationGovernanceBootstrap()` (~lines 12-18):

```js
const SOURCE_MANIFEST = "plugins/pipeline-core/.claude-plugin/plugin.json";
...
if (!regular(sourceManifest, fs)) return { ... };
const checker = join(rootDir, CHECKER);
if (!regular(checker, fs)) return { ..., status: "failed", ..., code: "OGB-CHECKER-MISSING" };
```

This distinguishes "the Pipeline's own source checkout" from "a consuming
project" purely by whether `plugins/pipeline-core/.claude-plugin/plugin.json`
exists under the project root. The vendor-sync mechanism (built to close a
provenance-evidence gap for marketplace-installed consumer projects)
creates exactly this file as part of its byte-identical vendored copy under
`<project>/plugins/pipeline-core/` — so any project routed through
vendor-sync (which the mixed-authority migration path routes every
marketplace-consumer project with legacy calibration through) now falsely
registers as "the Pipeline's own source checkout" and fails with
`OGB-CHECKER-MISSING`, because the actual source-checkout-only
`harness/scripts/check-observation-governance.mjs` genuinely does not exist
in a consumer project.

This is not a real governance violation — a vendor-synced consumer project
has no observation-governance obligations at all — just an overly narrow
detection signal (mere file presence) that vendor-sync's own byte-identical
copy defeats.

## Affected artifact

`plugins/pipeline-core/lib/observation-governance-bootstrap.mjs`,
`inspectObservationGovernanceBootstrap()` (~lines 12-18).

## Proposal

Not designed by the reporting session. The detector needs a second signal
beyond mere file presence — e.g. also require the `harness/` directory to
exist (source checkouts have it, vendor-synced consumer copies do not), or
have vendor-sync itself write an explicit "this is a vendored copy" marker
that this detector checks for and excludes.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, current scope but low urgency — confirmed
  not currently blocking anything (this check runs only as a
  `pipeline-start` happy-path checklist step, not inside the actual
  PreToolUse guard chain).
- **Rationale:** real detection-signal gap, narrow and well-diagnosed, but
  no live consequence beyond a confusing status on a checklist step for
  vendor-synced consumer projects — lower priority than the two sibling
  Windows findings from the same report (ACL-hardening gap is
  security-relevant; this one is a false-positive diagnostic only).
- **Assignment:** unassigned.
- **Date:** 2026-08-17
