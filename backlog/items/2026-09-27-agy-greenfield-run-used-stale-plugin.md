---
schema: pipeline.backlog-item.v1
id: pipeline.agy-greenfield-run-used-stale-plugin
type: requirement
owner: pipeline
status: open
created: 2026-09-27
sprint: alfred
done_when: manual
source: "PO Agy greenfield handover, 2026-09-27; private fixture docs/agent-pipeline-review.md, .claude/settings.json, pipeline.user.yaml, project/pipeline-state.json; installed Antigravity plugin.json and agy plugins list readback."
---

# Require a version-correct Antigravity run before 0.7 acceptance

The Agy greenfield report describes a successful move from design to
implementation under `gates.human_approval: signature` without a signature.
The project settings permit an installed Antigravity plugin whose manifest is
`0.6.2+antigravity.20260913103423.c1e799c`; `agy plugins list` dates its
import to 2026-09-15. Its state records a name-only plan approval and no
signature or bootstrap acknowledgement receipt. The 0.6.2 `approve-plan`
route accepts `--by`; current 0.7 source requires the exact verified receipt
and forbids `--by` under global signature mode.

The report lacks per-command runtime provenance, so it does not prove that a
0.7 signature gate was bypassed. It also cannot count as a 0.7 live acceptance
run. The report's own Ed25519-gate conclusion is inconsistent with the stored
approval state and the PO's first-hand observation.

## Required release evidence

- Record the loaded Antigravity plugin root, manifest version, import/registry
  identity and policy mode before classifying a consumer run as 0.7 evidence.
- Re-run the design-to-implementation path on the intended 0.7 installed
  build. Show an unsigned approval refused and a signed approval accepted,
  with the resulting receipt/state binding read back.
- Keep the 0.6.2 run as a historical regression observation and mark its
  0.7 acceptance status unavailable. Do not infer a 0.7 bypass or a 0.7 pass
  from the old run.

## Triage

- **Decision:** Supersession authorized by the PO on 2026-09-28, by
  [pipeline.agy-imported-plugin-snapshot-shadows-registered-plugin](2026-09-28-agy-imported-plugin-snapshot-shadows-registered-plugin.md).
- **Rationale:** The successor retains this historical evidence classification
  and version-correct acceptance requirement, and adds the independently observed
  managed-copy/registry topology and diagnostic/refresh gaps. This is deduplication,
  not a fixed claim; the old run remains unsuitable as 0.7 acceptance.
- **Assignment:** Successor item; no separate active acceptance task here.
  The status transition to `closed` follows the committed successor evidence
  and receives its exact closure metadata before ledger reconciliation. The
  temporary `open` status is not a separate delivery assignment.
- **Date:** 2026-09-28
