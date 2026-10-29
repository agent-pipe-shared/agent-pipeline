---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield.r2.guard-denials-fill-the-override-request-namespace
type: defect
owner: pipeline
status: open
created: 2026-10-26
sprint: alfred
priority: P1
release: 0.7.0
source: "Live WSL PC re-entry 2026-10-26; PO decision Q17 (a)"
done_when: manual
---

# Guard-Ablehnungen füllen den Override-Antrags-Namespace

Related existing criteria: AC-160 (HGO), AC-148 (denial texts).

## Evidence

On the WSL PC the guard refused to plan any human override with
`HGO-REQUEST-NAMESPACE-FULL` (soft cap 3072 in
`plugins/pipeline-core/lib/human-guard-override.mjs`). Every guard denial,
including pure read-grammar refusals that offer no override route, seeds a
request under `.git/agent-pipeline/human-guard-overrides/requests/`. The
documented repair `guard-human-override.mjs sweep-requests` removes about 61
expired requests per run and has no loop option; 45 runs removed 2703.
[Re-entry evidence](../../specs/sprint-alfred-epic/evidence/wsl-pc-reentry-2026-10-26/README.md).

## Acceptance

A refusal for which no human override route exists seeds no override request.
`sweep-requests` can remove every eligible expired request in one bounded,
reported invocation. A full namespace names that one-shot repair. Live,
unexpired or armed requests are never removed. Existing HGO consumption,
signature and audit behaviour stay unchanged.
