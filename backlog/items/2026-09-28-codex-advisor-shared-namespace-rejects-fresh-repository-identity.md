---
schema: pipeline.backlog-item.v1
id: pipeline.codex-advisor-shared-namespace-rejects-fresh-repository-identity
type: defect
owner: pipeline
status: open
created: 2026-09-28
source: "Controlled ordinary Git Fresh-Start reproduction against the canonical sanctioned identity writer and prepared Codex Advisor namespace helper; source 7a2dcfe7, aggregate 563fbe7b. No operator namespace or model was accessed."
sprint: none
done_when: manual
---

# Make fresh repository identity and Codex Advisor namespace compatible

## Description

The canonical identity writer recursively creates
`<git-common>/agent-pipeline/governance-events` with mode 0755. On a fresh
ordinary repository this also creates the shared `agent-pipeline` parent as
0755. The prepared registered Codex Advisor process-root helper requires that
same shared parent to be 0700 and refuses it with `host-process-root-unsafe`.
Thus the sanctioned first identity mint and prepared host route cannot compose
without extra provisioning. This is a confirmed preparation defect; the new
Advisor route has not been installed or productively invoked.

The controlled reproduction minted a genuine fixture identity through the
canonical writer, observed parent mode 0755, and received the typed refusal.
The binding remained present. Private store positive fixtures explicitly
provision the shared parent as 0700 and therefore do not qualify this fresh
ordering. No manual chmod workaround should become an implicit user step.

## Affected artifact

`plugins/pipeline-core/lib/governance-event-store.mjs` sanctioned identity
provisioning, proposed `codex-host-process-journal.mjs` registration and proposed
`codex-advisor-private-store.mjs` construction. The related Readiness namespace
must be checked for the same shared-parent assumption.

## Proposal

Define a compatible shared-parent policy and preserve private duty namespaces.
An owner-owned physical shared directory without group/world write permissions
can coexist with private 0700 Advisor/Readiness descendants; alternatively use
an explicit sanctioned provisioning/repair contract. Preserve physical alias,
owner, inode/mode and exact registered namespace checks. Do not silently chmod
existing operator directories or admit arbitrary process roots.

## Acceptance

- Actual sanctioned first identity mint followed by registered Advisor/store
  creation succeeds in a controlled ordinary Git repository without extra
  operator commands or signatures.
- Group/world writable shared parents, aliases and permissive private duty
  directories remain refused; linked worktrees retain one common identity.
- Existing namespace/ownership tests remain valid and the Readiness shared
  parent policy is verified independently.
- Productive integration and installed Codex replay are recorded separately;
  fixture success does not constitute an Advisor receipt or release stamp.

## Evidence

`scratch/probe-codex-shared-namespace-mode.mjs` and
`scratch/codex-shared-namespace-mode-probe.json` record the actual controlled
reproduction. `scratch/codex-advisor-production-store-design.md` documents its
fixture provisioning limitation. A separate compatibility patch is being
prepared; no source correction or item closure is claimed.

## Triage
