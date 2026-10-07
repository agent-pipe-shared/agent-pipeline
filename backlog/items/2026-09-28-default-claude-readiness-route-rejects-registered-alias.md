---
schema: pipeline.backlog-item.v1
id: pipeline.default-claude-readiness-route-rejects-registered-alias
type: defect
owner: pipeline
status: closed
created: 2026-09-28
source: "Default-validator integration during 0.7 preparation: a valid frozen V3 Claude readiness alias is rejected by the shared resolver used by the supported non-Codex readiness producer and verifier. Model-free disposable Git reproduction 797359; no provider or real key invoked."
sprint: alfred
done_when: manual
closed_at: 2026-10-07
closure_repository: self
closure_commit: 3d9ffe770
closure_evidence: specs/sprint-alfred-epic/plans/backlog-triage-2026-10-07.md
---

# Registered Claude readiness alias is rejected by its shared default resolver

A fully validated committed V3 source has a default Claude readiness selector
`{kind: alias, value: sonnet}`. `resolveV3DutyRoute` unconditionally requires
`model-id` and rejects it, while the registered Codex cell succeeds in the same
fixture. The helper is used by the supported `runner-design-readiness-bootstrap`
Claude producer and the non-Codex branch of `design-readiness-host-evidence`.
Its Codex-oriented file header does not limit those actual generic consumers.

The independent model-free reproduction uses the actual frozen registry,
parser, validator, committed source and resolver. It is not a live Claude
provider observation. The defect blocked a complete isolated synthetic DWP
signing fixture before signing; it is distinct from the corrected nested-digest
transport. No resolver override or relabelled selector is an accepted repair.

## Acceptance

- Resolve the registered default Claude alias only after full frozen V3 and
  committed-source validation; producer and verifier consume the same route.
- Preserve Codex model-id and high-risk Critic admission and all exact source
  bindings. Unknown kinds, altered registry cells, malformed/uncommitted sources
  and unavailable duty admission remain refused by their proper boundary.
- Complete default-validator synthetic DWP request signing and proof readback
  with a disposable key; disclose synthetic readiness authority explicitly.
- Keep genuine native runner execution and effective model identity separate
  from this source/transport fixture.

## Triage

- **Decision:** closed — fixed in source
- **Rationale:** Fix site `plugins/pipeline-core/lib/critic-route-v3.mjs:49`
  (commit 3d9ffe770); regression test `critic-route-v3.test.mjs:35`.
- **Assignment:** n/a
- **Date:** 2026-10-07
- **State:** Open. Source proposal, ledger registration and acceptance follow;
  this intake does not change the five bound design sources or grant approval.
