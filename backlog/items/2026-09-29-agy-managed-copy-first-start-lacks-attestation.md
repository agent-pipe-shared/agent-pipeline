---
schema: pipeline.backlog-item.v1
id: pipeline.agy-managed-copy-first-start-lacks-attestation
type: defect
owner: pipeline
status: open
created: 2026-09-29
source: "Antigravity greenfield report for the stamped 0.7 local candidate; verified against installer and preflight source."
sprint: none
done_when: manual
---

# Agy managed copy needs its receipt before the first project start

## Description

A fresh empty project can load a Gitless managed Antigravity plugin copy.
Preflight then requires an external source-to-copy receipt and returns
`plugin-attestation-required` with `IPA-HOST-LOCATOR-UNAVAILABLE`. The existing
installer writes the receipt only during a global refresh, while a workspace
refresh can leave a managed copy available for execution. A user following a
normal workspace installation therefore encounters a repair step at first
start. Running the installer from the copied plugin cannot establish its Git
source identity.

The reported repair instruction that selects source option 2 and workspace
option 1 is inaccurate: source option 2 is the local marketplace, and the old
workspace path does not write the receipt.

## Affected artifact

`plugins/pipeline-core/install-agy.mjs`,
`plugins/pipeline-core/lib/antigravity-topology-refresh-host.mjs`, and
`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`.

## Acceptance

- A clean Git source installed into an empty non-Git Agy project creates the
  required receipt before a managed copy can execute.
- Workspace and global refresh preserve exact source/copy and registry
  readback; stale copies require an explicit topology update.
- The first new Agy session passes plugin attestation without a manual repair
  step. An already affected copy gets one exact host recovery action.
- Tests cover the installer, receipt verification, preflight, and a native
  fresh-runner observation. No source or operator identifiers enter evidence.

## Triage

Accepted into the next local 0.7 candidate by PO instruction. Native Agy
confirmation follows installation of that candidate.

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **HOST-SESSION-NEEDED** — Native fresh-runner observation of the first Agy session passing attestation without a manual repair step
  Item Triage: 'Native Agy confirmation follows installation of that candidate'. Needs the stamped candidate installed and a fresh Antigravity session started in an empty project; observed is plugin attestation passing with no manual receipt repair.
- **HOST-SESSION-NEEDED** — D79 (553342999): whether the real Antigravity host resolves a repo-relative entries[].path in the tracked registry is unverified
  Only the real Antigravity host can show whether it resolves a repo-relative entries[].path in the tracked .agents/plugins.json (D79 option 2: tracked file repo-relative, machine binding in a machine-local file). Observed: a new agy session in a clean clone loads the plugin from that path; a negative result is a finding.
