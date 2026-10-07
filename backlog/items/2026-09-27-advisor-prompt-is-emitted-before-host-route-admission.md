---
schema: pipeline.backlog-item.v1
id: pipeline.advisor-prompt-is-emitted-before-host-route-admission
type: defect
owner: pipeline
status: closed
closed_at: 2026-10-07
closure_repository: self
closure_commit: 4f27d3e803388c806eb22de88d97f92ead2b730e
closure_evidence: specs/sprint-alfred-epic/plans/backlog-triage-2026-10-07.md
created: 2026-09-27
source: "Codex/WSL greenfield review B2 on 2026-09-27; bridge source-order verification in specs/sprint-alfred-epic/evidence/0.7-codex-greenfield-advisor-triage-2026-09-27.md."
sprint: alfred
done_when: manual
---

# Advisor preparation emits the PRD-derived prompt before the host route is admitted

## Description

`advisory-host-bridge.mjs` constructs `dispatch.prepare` with
`prompt: input.question` and emits it before it checks the Codex WSL route.
The design coordinator derives that question from PRD bytes. Thus an
unavailable route can still put design content in tool output and transcripts
without an Advisor model call. The greenfield report observed this with
`modelCalls: 0` and `launcherCalls: 0`.

## Triggering situation

Codex/WSL Feature onboarding on 2026-09-27, where the route subsequently
returned `advisory-unavailable-wsl-native-deferred`.

## Affected artifact

`advisory-host-bridge.mjs`, `design-advisory-coordinator.mjs`, the role-dispatch
preflight packet and its host output contract.

## Proposal

Run model-free platform/route and export-admission checks before building or
emitting any prompt-bearing packet. For unavailable or denied routes, emit
only a typed reason and bounded path/digest metadata. Keep the full question
and evidence inside the admitted runtime transport; a rejected route must not
create an avoidable copy in logs.

## Acceptance

- A WSL-unavailable and a host-denied test each prove zero prompt bytes in
  stdout, error output, persisted events and receipts, with zero model and
  launcher calls.
- An admitted Advisor run still binds the exact question and evidence digests
  into its valid receipt without printing their raw contents.
- Route/consent decisions are taken before `dispatch.prepare`; fixture output
  checks include a recognizable secret-like design marker.

## Triage

- **Decision:** closed — fixed in source
- **Rationale:** fixed at 4f27d3e80: advisory-route-selection.mjs / design-advisory-coordinator.mjs (4f27d3e80); tests: advisory-route-selection.test.mjs 'only matching no-child route codes and statuses validate' and codex-advisor-execution.test.mjs 'Advisor export denial refuses before any source prompt construction or child launch'.
- **Assignment (if accepted):** n/a
- **Date:** 2026-10-07
